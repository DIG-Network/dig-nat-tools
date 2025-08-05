/**
 * PEX (Peer Exchange) implementation for peer discovery
 * Based on the BEP-11 (http://bittorrent.org/beps/bep_0011.html)
 * Uses Gun.js as the underlying communication layer for reliable peer exchange
 */

/**
 * How PEX (Peer Exchange) Works
 * ------------------------------
 * 
 * The PEX (Peer Exchange) system enables peers to discover each other without relying solely 
 * on centralized trackers. It follows these principles:
 * 
 * 1. Peer Registration & Announcement:
 *    - Each peer registers itself with info hashes (content identifiers) it's interested in
 *    - Peers periodically announce their presence and capabilities to the network
 *    - Announcements include peer ID, address, port, supported info hashes, and capability flags
 * 
 * 2. Decentralized Communication:
 *    - Uses Gun.js as a distributed database for real-time peer exchange
 *    - Peers publish/subscribe to messages in a shared "pex" space
 *    - Message types include ADD_PEERS (announcement) and REMOVE_PEERS (departure)
 * 
 * 3. Peer Discovery & Tracking:
 *    - Peers monitor the Gun.js network for peer announcements
 *    - When discovering a peer, it's stored with metadata (last seen time, capabilities)
 *    - Peers are deduplicated based on ID or address:port combination
 * 
 * 4. Capability Flags:
 *    - Peers announce their capabilities via flags (encryption, UTP support, etc.)
 *    - Other peers can filter potential connections based on required capabilities
 *    - Flags enable smarter peer selection for optimal connections
 * 
 * 5. Built-in Maintenance:
 *    - Automatic cleanup of stale peers based on configurable expiration time
 *    - Enforcement of maximum peer counts to prevent memory issues
 *    - Periodic re-announcements to maintain presence in the network
 * 
 * This implementation optimizes for decentralized operation while maintaining 
 * reliability through periodic announcements and health checks.
 */

import Debug from 'debug';
import { EventEmitter } from 'events';
import type { DiscoveryPeer, DiscoveryEvents, PEXManager as IPEXManager } from '../types';
import type { GunInstance } from '../../../types/gun';
import { validatePeerId, validatePeerAddress } from '../../../utils/security';
import { getPreferredIPs } from '../../../utils/ip-helper';
import { PEER_SOURCES } from '../../../discovery/types';
import type { InternalPeer, PexMessage, PexManagerOptions, PexPeerFlags } from './types';
import { PexMessageType } from './types';

const debug = Debug('dig-nat-tools:pex');

/**
 * PEX Manager for handling peer exchange
 * Implements the PEXManager interface from types/discovery
 * Uses Gun.js for reliable peer exchange
 */
export class PexManager extends EventEmitter implements IPEXManager {
  private peers: Map<string, InternalPeer>;
  private connectedPeers: Map<string, InternalPeer>;
  private maxPeers: number;
  private peerExpiration: number;
  private announcePeriod: number;
  private peerDeduplication: boolean;
  private announceTimer: NodeJS.Timeout | null = null;
  private infoHashes: Set<string> = new Set();
  private gun: GunInstance;
  private nodeId: string;
  private pexSpace: any; // Gun space for PEX messages
  private port: number;
  private localPeerFlags: PexPeerFlags;

  constructor(options: PexManagerOptions) {
    super();
    
    if (!options.gun) {
      throw new Error('Gun instance is required for PEX manager');
    }
    if (!options.nodeId) {
      throw new Error('Node ID is required for PEX manager');
    }
    if (!options.port) {
      throw new Error('Port is required for PEX manager');
    }
    
    this.peers = new Map();
    this.connectedPeers = new Map();
    this.gun = options.gun;
    this.nodeId = options.nodeId;
    this.port = options.port;
    
    this.maxPeers = options.maxPeers || 200;
    this.peerExpiration = options.peerExpiration || 30 * 60 * 1000;
    this.announcePeriod = options.announcePeriod || 5 * 60 * 1000;
    this.peerDeduplication = options.peerDeduplication !== undefined ? options.peerDeduplication : true;
    
    // Initialize default peer flags
    this.localPeerFlags = options.peerFlags || {
      preferEncryption: true,
      canUseUTP: false,
      isReachable: true,
      supportsNetCrypto: false
    };
    
    // Initialize Gun space for PEX
    this.pexSpace = this.gun.get('pex');
    
    debug('Created PEX manager');
  }

  public async start(): Promise<void> {
    if (this.announceTimer) {
      debug('PEX manager already started');
      return;
    }
    
    // Subscribe to PEX messages
    this.pexSpace.get('messages').map().on((message: PexMessage, key: string) => {
      if (key.startsWith(this.nodeId)) return; // Skip own messages
      
      try {
        this.handlePexMessage(message);
      } catch (err) {
        debug('Error handling PEX message:', err);
      }
    });
    
    // Start periodic announcements
    this.announceTimer = setInterval(() => this._announcePeers(), this.announcePeriod);
    setInterval(() => this._cleanupPeers(), this.peerExpiration);
    
    debug('PEX manager started');
  }

  public async stop(): Promise<void> {
    if (this.announceTimer) {
      clearInterval(this.announceTimer);
      this.announceTimer = null;
    }
    
    // Unsubscribe from Gun
    this.pexSpace.get('messages').off();
    
    debug('PEX manager stopped');
  }

  public addInfoHash(infoHash: string): void {
    this.infoHashes.add(infoHash);
    this.emit('content:announced', infoHash);
    
    // Announce the new info hash
    this._announcePeers();
  }

  public removeInfoHash(infoHash: string): void {
    this.infoHashes.delete(infoHash);
    this.emit('content:removed', infoHash);
    
    // Announce the removal
    const message: PexMessage = {
      type: PexMessageType.REMOVE_PEERS,
      peers: [{
        id: this.nodeId,
        address: '',
        port: 0,
        infoHashes: [infoHash]
      }]
    };
    
    this._publishMessage(message);
  }

  private _publishMessage(message: PexMessage): void {
    const messageKey = `${this.nodeId}_${Date.now()}`;
    this.pexSpace.get('messages').get(messageKey).put(message);
    
    // Clean up old messages after a delay
    setTimeout(() => {
      this.pexSpace.get('messages').get(messageKey).put(null);
    }, this.announcePeriod * 2);
  }

  public addPeer(peerId: string, infoHash: string): void {
    if (!validatePeerId(peerId)) {
      debug(`Invalid peer ID: ${peerId}`);
      return;
    }

    const peer = this.peers.get(peerId);
    if (peer) {
      if (!peer.infoHashes) {
        peer.infoHashes = [];
      }
      if (!peer.infoHashes.includes(infoHash)) {
        peer.infoHashes.push(infoHash);
        this.emit('peer-added', peer, infoHash);
      }
    }
  }

  public removePeer(peerId: string, infoHash: string): void {
    const peer = this.peers.get(peerId);
    if (peer && peer.infoHashes) {
      const index = peer.infoHashes.indexOf(infoHash);
      if (index !== -1) {
        peer.infoHashes.splice(index, 1);
        this.emit('peer-removed', peerId, infoHash);
      }
    }
  }

  public async findPeers(infoHash: string): Promise<DiscoveryPeer[]> {
    return Array.from(this.peers.values())
      .filter(peer => peer.infoHashes?.includes(infoHash));
  }

  public addDiscoveredPeer(
    peer: DiscoveryPeer & { flags?: PexPeerFlags },
    isConnected: boolean = false
  ): boolean {
    if (!validatePeerAddress(peer.address)) {
      debug(`Invalid peer address: ${peer.address}`);
      return false;
    }

    if (peer.id && !validatePeerId(peer.id)) {
      debug(`Invalid peer ID: ${peer.id}`);
      return false;
    }

    const key = this._getPeerKey(peer);
    const now = Date.now();
    
    const existingPeer = this.peers.get(key) as InternalPeer;
    if (existingPeer) {
      existingPeer.lastSeen = now;
      
      // Update flags if provided
      if (peer.flags) {
        existingPeer.flags = {
          ...existingPeer.flags || {},
          ...peer.flags
        };
        debug(`Updated flags for peer ${key}: ${JSON.stringify(existingPeer.flags)}`);
      }
      
      if (isConnected && !this.connectedPeers.has(key)) {
        this.connectedPeers.set(key, existingPeer);
        debug(`Marked peer as connected: ${key}`);
        this.emit('peer-discovered', existingPeer);
      }
      
      return false;
    }
    
    const peerWithMetadata: InternalPeer = {
      ...peer,
      source: PEER_SOURCES.PEX,
      confidence: 0.7,
      lastSeen: now,
      flags: peer.flags || {
        preferEncryption: false,
        canUseUTP: false,
        isReachable: true,
        supportsNetCrypto: false
      }
    };
    
    this.peers.set(key, peerWithMetadata);
    
    if (isConnected) {
      this.connectedPeers.set(key, peerWithMetadata);
      debug(`Added and connected new peer: ${key}`);
      this.emit('peer-discovered', peerWithMetadata);
    } else {
      debug(`Added new peer: ${key}`);
    }
    
    this._enforceMaxPeers();
    this.emit('peer-discovered', peerWithMetadata);
    
    return true;
  }

  public handlePexMessage(message: PexMessage): void {
    switch (message.type) {
      case PexMessageType.ADD_PEERS:
        const added = message.peers.reduce((count, peer) => {
          return this.addDiscoveredPeer(peer) ? count + 1 : count;
        }, 0);
        debug(`Added ${added} peers from PEX message`);
        break;
        
      case PexMessageType.REMOVE_PEERS:
        let removed = 0;
        for (const peer of message.peers) {
          if (peer.id && this.removePeerById(peer.id)) {
            removed++;
          }
        }
        debug(`Removed ${removed} peers from PEX message`);
        break;
        
      default:
        debug('Unknown PEX message type');
    }
  }

  public createPexMessage(type: PexMessageType, count: number = 50): PexMessage {
    switch (type) {
      case PexMessageType.ADD_PEERS:
        const peersToShare = this.getRandomPeers(count, true);
        return {
          type,
          peers: peersToShare
        };
        
      case PexMessageType.REMOVE_PEERS:
        return {
          type,
          peers: []
        };
        
      default:
        debug(`Unknown PEX message type: ${type}`);
        return {
          type: PexMessageType.ADD_PEERS,
          peers: []
        };
    }
  }

  private _getPeerKey(peer: DiscoveryPeer): string {
    if (!this.peerDeduplication && peer.id) {
      return peer.id;
    }
    return `${peer.address}:${peer.port}`;
  }

  private async _enforceMaxPeers(): Promise<void> {
    if (this.peers.size <= this.maxPeers) {
      return;
    }

    const peersToRemove = this.peers.size - this.maxPeers;
    const sortedPeers = Array.from(this.peers.entries())
      .sort(([, a], [, b]) => (a.lastSeen || 0) - (b.lastSeen || 0));
    
    const connectedKeys = new Set(this.connectedPeers.keys());
    
    let removed = 0;
    for (const [key, peer] of sortedPeers) {
      if (connectedKeys.has(key)) {
        continue;
      }
      
      this.peers.delete(key);
      removed++;
      
      if (peer.id && peer.infoHashes) {
        for (const infoHash of peer.infoHashes) {
          this.emit('peer-removed', peer.id, infoHash);
        }
      }
      
      if (removed >= peersToRemove) {
        break;
      }
    }
    
    debug(`Removed ${removed} oldest peers to stay under limit of ${this.maxPeers}`);
  }

  private async _cleanupPeers(): Promise<void> {
    const now = Date.now();
    const expirationThreshold = now - this.peerExpiration;
    const connectedKeys = new Set(this.connectedPeers.keys());
    
    let removed = 0;
    
    for (const [key, peer] of this.peers.entries()) {
      if (connectedKeys.has(key)) {
        continue;
      }
      
      if (peer.lastSeen < expirationThreshold) {
        this.peers.delete(key);
        removed++;
        
        if (peer.id && peer.infoHashes) {
          for (const infoHash of peer.infoHashes) {
            this.emit('peer-removed', peer.id, infoHash);
          }
        }
      }
    }
    
    if (removed > 0) {
      debug(`Cleaned up ${removed} expired peers`);
    }
  }

  private async _announcePeers(): Promise<void> {
    if (this.infoHashes.size === 0) {
      return;
    }

    const { ipv6, ipv4 } = await getPreferredIPs();
    const preferredAddresses = [...ipv6, ...ipv4];
    
    if (preferredAddresses.length === 0) {
      debug('No valid network interfaces found for announcing');
      return;
    }

    // Create announcement with our info and flags
    const message: PexMessage = {
      type: PexMessageType.ADD_PEERS,
      peers: [{
        id: this.nodeId,
        address: preferredAddresses[0], // Use first preferred address
        port: this.port,
        infoHashes: Array.from(this.infoHashes),
        source: PEER_SOURCES.PEX,
        confidence: 0.8,
        flags: this.localPeerFlags
      }]
    };

    this._publishMessage(message);
    debug(`Published PEX announcement with ${this.infoHashes.size} info hashes and flags: ${JSON.stringify(this.localPeerFlags)}`);
  }

  private getRandomPeers(count: number, excludeConnected: boolean = false): DiscoveryPeer[] {
    let eligiblePeers: DiscoveryPeer[];
    
    if (excludeConnected) {
      const connectedKeys = new Set(this.connectedPeers.keys());
      eligiblePeers = Array.from(this.peers.entries())
        .filter(([key]) => !connectedKeys.has(key))
        .map(([, peer]) => peer);
    } else {
      eligiblePeers = Array.from(this.peers.values());
    }
    
    if (eligiblePeers.length <= count) {
      return [...eligiblePeers];
    }
    
    return this._shuffleArray(eligiblePeers).slice(0, count);
  }

  private removePeerById(peerId: string): boolean {
    for (const [key, peer] of this.peers.entries()) {
      if (peer.id === peerId) {
        this.peers.delete(key);
        this.connectedPeers.delete(key);
        
        if (peer.infoHashes) {
          for (const infoHash of peer.infoHashes) {
            this.emit('peer-removed', peerId, infoHash);
          }
        }
        return true;
      }
    }
    return false;
  }

  private _shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  // Implement event methods
  public on<E extends keyof DiscoveryEvents>(event: E, listener: (...args: DiscoveryEvents[E]) => void): this {
    return super.on(event, listener);
  }

  public off<E extends keyof DiscoveryEvents>(event: E, listener: (...args: DiscoveryEvents[E]) => void): this {
    return super.off(event, listener);
  }

  public emit<E extends keyof DiscoveryEvents>(event: E, ...args: DiscoveryEvents[E]): boolean {
    return super.emit(event, ...args);
  }

  /**
   * Sets the local peer flags
   * @param flags The flags to set
   */
  public setLocalPeerFlags(flags: Partial<PexPeerFlags>): void {
    this.localPeerFlags = {
      ...this.localPeerFlags,
      ...flags
    };
    
    debug(`Updated local peer flags: ${JSON.stringify(this.localPeerFlags)}`);
    
    // Re-announce to update our flags
    this._announcePeers();
  }

  /**
   * Get the flags for a specific peer
   * @param peerId The ID of the peer
   * @returns The peer's capability flags or undefined if peer not found
   */
  public getPeerFlags(peerId: string): PexPeerFlags | undefined {
    const peer = this.findPeerById(peerId);
    return peer?.flags;
  }

  /**
   * Find peers that match specific capability requirements
   * @param infoHash Optional info hash to filter by
   * @param requiredFlags Flags that are required (all must match)
   * @returns Array of peers matching the requirements
   */
  public async findPeersWithCapabilities(
    infoHash?: string,
    requiredFlags?: Partial<PexPeerFlags>
  ): Promise<DiscoveryPeer[]> {
    let peers = Array.from(this.peers.values());
    
    // Filter by info hash if provided
    if (infoHash) {
      peers = peers.filter(peer => peer.infoHashes?.includes(infoHash));
    }
    
    // Filter by required flags if provided
    if (requiredFlags) {
      peers = peers.filter(peer => {
        if (!peer.flags) return false;
        
        // Check if all required flags match
        for (const [key, value] of Object.entries(requiredFlags)) {
          if (peer.flags[key as keyof PexPeerFlags] !== value) {
            return false;
          }
        }
        return true;
      });
    }
    
    return peers;
  }

  private findPeerById(peerId: string): InternalPeer | undefined {
    for (const peer of this.peers.values()) {
      if (peer.id === peerId) {
        return peer;
      }
    }
    return undefined;
  }

  /**
   * Update flags for a specific peer
   * @param peerId The ID of the peer to update
   * @param flags The flags to update
   * @returns True if peer was found and updated, false otherwise
   */
  public updatePeerFlags(peerId: string, flags: Partial<PexPeerFlags>): boolean {
    const peer = this.findPeerById(peerId);
    if (!peer) {
      debug(`Cannot update flags: Peer ${peerId} not found`);
      return false;
    }
    
    peer.flags = {
      ...peer.flags || {},
      ...flags
    };
    
    debug(`Updated flags for peer ${peerId}: ${JSON.stringify(peer.flags)}`);
    return true;
  }
}

export default PexManager;

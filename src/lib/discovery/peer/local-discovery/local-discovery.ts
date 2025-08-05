/**
 * Local peer discovery implementation using mDNS and UDP multicast
 * This is used to discover peers on the local network without relying on external services
 */

import * as crypto from 'crypto';
import Debug from 'debug';
import { EventEmitter } from 'events';
import { MdnsDiscovery } from 'multicast-service-discovery';
import type { MdnsService } from 'multicast-service-discovery';
import { validatePeerId, validatePeerAddress } from '../../../utils/security';
import { getPreferredIPs } from '../../../utils/ip-helper';
import { PEER_SOURCES } from '../../../../types/constants';

// Import types from local types file
import type { 
  DiscoveryPeer,
  DiscoveryEvents,
  LocalDiscoveryOptions, 
  LocalDiscovery as ILocalDiscovery 
} from './types';

const debug = Debug('dig-nat-tools:local-discovery');

/**
 * Local Discovery manager for finding peers on the local network
 * Implements the DiscoveryComponent interface
 */
export class LocalDiscovery extends EventEmitter implements ILocalDiscovery {
  private options: Required<LocalDiscoveryOptions>;
  private mdns: MdnsDiscovery;
  private started: boolean = false;
  private peerId: string;
  private announceTimer: NodeJS.Timeout | null = null;
  private peers: Map<string, DiscoveryPeer> = new Map();
  private listeningPort: number = 0;
  private sharedInfoHashes: Set<string> = new Set();

  /**
   * Create a new local discovery manager
   */
  constructor(options: LocalDiscoveryOptions = {}) {
    super();
    
    this.options = {
      serviceType: options.serviceType || 'dig-nat-tools',
      announceInterval: options.announceInterval || 60000, // 1 minute
      peerTTL: options.peerTTL || 300000 // 5 minutes
    };
    
    this.mdns = new MdnsDiscovery();
    this.peerId = this._generateSecureId();
    
    debug(`Created local discovery manager with peer ID ${this.peerId.substring(0, 6)}...`);
  }

  /**
   * Start local discovery
   */
  public async start(): Promise<void> {
    if (this.started) {
      debug('Local discovery already started');
      return;
    }

    try {
      // Get preferred IP addresses (IPv6 first)
      const { ipv6, ipv4 } = await getPreferredIPs();
      const address = ipv6[0] || ipv4[0] || '127.0.0.1';

      // Start announcing our service
      this.mdns.announce(this.options.serviceType, {
        port: this.listeningPort,
        txt: {
          peerId: this.peerId,
          infoHashes: Array.from(this.sharedInfoHashes).join(',')
        }
      });

      // Listen for other services
      this.mdns.on('service', (service) => {
        this._handleDiscoveredService(service);
      });

      // Start looking for peers
      this.mdns.lookup(this.options.serviceType);

      // Start periodic announcements
      this.announceTimer = setInterval(() => {
        this._cleanupStaleData();
        this._announceAll();
      }, this.options.announceInterval);

      this.started = true;
      debug(`Local discovery started on ${address}:${this.listeningPort}`);
    } catch (err) {
      debug(`Failed to start local discovery: ${(err as Error).message}`);
      this.stop();
      throw err;
    }
  }

  /**
   * Stop local discovery
   */
  public async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    if (this.announceTimer) {
      clearInterval(this.announceTimer);
      this.announceTimer = null;
    }

    this.mdns.destroy();
    this.started = false;
    debug('Local discovery stopped');
  }

  /**
   * Add an info hash to announce
   */
  public addInfoHash(infoHash: string): void {
    this.sharedInfoHashes.add(infoHash);
    this.emit('content:announced', infoHash);
    
    if (this.started) {
      this._announceAll();
    }
  }

  /**
   * Remove an info hash
   */
  public removeInfoHash(infoHash: string): void {
    this.sharedInfoHashes.delete(infoHash);
    this.emit('content:removed', infoHash);
  }

  /**
   * Find peers that have announced a specific info hash
   */
  public async findPeers(infoHash: string): Promise<DiscoveryPeer[]> {
    return Array.from(this.peers.values())
      .filter(peer => peer.infoHashes?.includes(infoHash));
  }

  /**
   * Handle discovered mDNS service
   */
  private _handleDiscoveredService(service: MdnsService): void {
    try {
      const { address, port, txt } = service;
      
      // Validate peer data
      if (!validatePeerAddress(address)) {
        debug(`Invalid peer address: ${address}`);
        return;
      }

      const peerId = txt?.peerId;
      if (!peerId || !validatePeerId(peerId)) {
        debug(`Invalid peer ID from ${address}`);
        return;
      }

      // Skip our own announcements
      if (peerId === this.peerId) {
        return;
      }

      // Create peer object
      const peer: DiscoveryPeer = {
        id: peerId,
        address,
        port,
        source: PEER_SOURCES.LOCAL,
        confidence: 1.0, // High confidence for local peers
        infoHashes: txt?.infoHashes?.split(',').filter(Boolean) || []
      };

      const isNewPeer = !this.peers.has(peerId);
      this.peers.set(peerId, peer);

      if (isNewPeer) {
        this.emit('peer-discovered', peer);
        debug(`Discovered new peer ${peerId.substring(0, 6)}... at ${address}:${port}`);
      }
    } catch (err) {
      debug(`Error handling discovered service: ${(err as Error).message}`);
    }
  }

  /**
   * Announce all tracked hashes
   */
  private _announceAll(): void {
    if (!this.started) return;

    try {
      this.mdns.update(this.options.serviceType, {
        port: this.listeningPort,
        txt: {
          peerId: this.peerId,
          infoHashes: Array.from(this.sharedInfoHashes).join(',')
        }
      });
    } catch (err) {
      debug(`Error announcing: ${(err as Error).message}`);
    }
  }

  /**
   * Clean up stale peer data
   */
  private _cleanupStaleData(): void {
    const now = Date.now();
    for (const [peerId, peer] of this.peers.entries()) {
      if (now - (peer as any).lastSeen > this.options.peerTTL) {
        this.peers.delete(peerId);
        debug(`Removed stale peer: ${peerId}`);
      }
    }
  }

  /**
   * Generate a secure random peer ID
   */
  private _generateSecureId(): string {
    const array = new Uint8Array(20);
    crypto.getRandomValues(array);
    return Array.from(array)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Implement DiscoveryComponent event methods
  public on<E extends keyof DiscoveryEvents>(event: E, listener: (...args: DiscoveryEvents[E]) => void): this {
    return super.on(event as string, listener);
  }

  public off<E extends keyof DiscoveryEvents>(event: E, listener: (...args: DiscoveryEvents[E]) => void): this {
    return super.off(event as string, listener);
  }

  public emit<E extends keyof DiscoveryEvents>(event: E, ...args: DiscoveryEvents[E]): boolean {
    return super.emit(event as string, ...args);
  }
}

export default LocalDiscovery; 
/**
 * Kademlia DHT implementation for peer discovery
 * Using Gun.js as the underlying communication layer
 */

/**
 * How DHT (Distributed Hash Table) Works
 * --------------------------------------
 * 
 * This DHT implementation leverages Gun.js as the communication layer for a Kademlia-style DHT:
 * 
 * 1. Network Structure:
 *    - Each node has a unique ID in the same 160-bit space as content hashes
 *    - XOR distance metric determines "closeness" between IDs
 *    - Gun.js provides the underlying P2P communication network
 * 
 * 2. Data Storage & Synchronization:
 *    - Routing tables stored in Gun's graph and synced automatically
 *    - Content announcements distributed through Gun's mesh network
 *    - Gun handles NAT traversal via its relay servers
 * 
 * 3. Key Operations:
 *    - find_node: locate nodes close to a target ID in the keyspace
 *    - get_peers: find peers for a specific content hash
 *    - announce_peer: advertise availability of content
 * 
 * 4. Advantages over UDP DHT:
 *    - Better NAT traversal using Gun's capabilities
 *    - Automatic peer discovery through Gun's network
 *    - Real-time updates when peers join/leave
 *    - Consistent with other Gun-based discovery mechanisms
 */

import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as path from 'path';
import Debug from 'debug';
import LRUCache from 'lru-cache';
import { EventEmitter } from 'events';
import { NODE_TYPE } from '../types';
import type { DiscoveryPeer } from '../types';
import type { GunInstance } from '../../../types/gun';

// Import types - need to add DHTNode export to types.ts
import type {
  DHTClientOptions,
  DHTClient as IDHTClient
} from './types';

const debug = Debug('dig-nat-tools:dht');

// Constants
const K = 8; // Kademlia k-bucket size (max nodes per bucket)
const ANNOUNCE_INTERVAL = 15 * 60 * 1000; // 15 minutes (ms)
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes (ms)

// Import DHTNode type from local file since we need to export it
export interface DHTNode {
  id: string;
  address: string;
  port: number;
  lastSeen?: number;
  token?: string;
  source?: string;
}

/**
 * DHT options for Gun-based implementation
 */
export interface DHTOptions extends DHTClientOptions {
  gun: GunInstance; // Required Gun instance
  dhtSpace?: string; // Gun.js namespace for DHT data (default: 'dht')
  externalIp?: string; // Optional external IP address
}

/**
 * Kademlia DHT client implementation using Gun.js
 */
export class DHT extends EventEmitter implements IDHTClient {
  private options: Required<DHTOptions>;
  private nodeId: Buffer;
  private routingTable: Map<string, DHTNode> = new Map();
  private announceTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private persistenceInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private peerCache: LRUCache<string, DiscoveryPeer[]>;
  private nodeType: NODE_TYPE;
  private sharding: boolean;
  private infoHashes: Set<string> = new Set();
  private started: boolean = false;
  
  // Gun.js specific properties
  private gun: GunInstance;
  private dhtSpace: any; // Gun.js space for DHT data
  private routingTableSpace: any; // Gun.js space for routing table
  private contentSpace: any; // Gun.js space for content announcements
  
  /**
   * Create a new DHT client
   * @param options - Client options
   */
  constructor(options: DHTOptions) {
    super();
    
    if (!options.gun) {
      throw new Error('Gun instance is required for DHT');
    }
    
    // Set node type
    this.nodeType = options.nodeType || NODE_TYPE.STANDARD;
    
    // Generate a random node ID if not provided
    const nodeId = options.nodeId || 
      crypto.randomBytes(20).toString('hex');
    this.nodeId = Buffer.from(nodeId, 'hex');
    
    // Set maximum cache sizes based on node type
    const maxCachedHashes = options.maxCachedHashes || (
      this.nodeType === NODE_TYPE.LIGHT ? 50 :
      this.nodeType === NODE_TYPE.STANDARD ? 200 :
      this.nodeType === NODE_TYPE.SUPER ? 1000 : 200
    );
    
    const maxCachedPeersPerHash = options.maxCachedPeersPerHash || (
      this.nodeType === NODE_TYPE.LIGHT ? 20 :
      this.nodeType === NODE_TYPE.STANDARD ? 50 :
      this.nodeType === NODE_TYPE.SUPER ? 200 : 50
    );
    
    const ttl = options.ttl || (
      this.nodeType === NODE_TYPE.LIGHT ? 15 * 60 * 1000 : // 15 minutes
      this.nodeType === NODE_TYPE.STANDARD ? 30 * 60 * 1000 : // 30 minutes
      this.nodeType === NODE_TYPE.SUPER ? 60 * 60 * 1000 : // 1 hour
      30 * 60 * 1000 // default: 30 minutes
    );
    
    this.options = {
      ...options,
      dhtSpace: options.dhtSpace || 'dht',
      maxCachedHashes,
      maxCachedPeersPerHash,
      ttl,
      updateAgeOnGet: options.updateAgeOnGet || true,
      shardPrefixes: options.shardPrefixes || [],
      enablePersistence: options.enablePersistence !== undefined ? options.enablePersistence : true,
      persistenceDir: options.persistenceDir || './.dig-nat-tools'
    } as Required<DHTOptions>;
    
    this.sharding = this.options.shardPrefixes.length > 0;
    this.gun = this.options.gun;
    
    // Initialize Gun spaces
    this.dhtSpace = this.gun.get(this.options.dhtSpace);
    this.routingTableSpace = this.dhtSpace.get('routing');
    this.contentSpace = this.dhtSpace.get('content');
    
    // Initialize peer cache with LRU
    this.peerCache = new LRUCache<string, DiscoveryPeer[]>({
      max: this.options.maxCachedHashes,
      ttl: this.options.ttl,
      updateAgeOnGet: this.options.updateAgeOnGet
    });
    
    debug(`Created DHT client with node ID ${this.nodeId.toString('hex').substring(0, 6)}...`);
  }
  
  /**
   * Start the DHT client
   */
  public async start(): Promise<void> {
    if (this.started) {
      debug('DHT client already started');
      return;
    }
    
    debug('Starting DHT client...');
    
    // If persistence is enabled, load cached data
    if (this.options.enablePersistence) {
      try {
        fs.ensureDirSync(this.options.persistenceDir);
        this._loadCachedData();
      } catch (err) {
        debug(`Error initializing persistence: ${(err as Error).message}`);
      }
    }
    
    // Announce our node to the network
    this._announceNode();
    
    // Subscribe to routing table updates
    this.routingTableSpace.map().on((data: any, key: string) => {
      if (key === '_' || key === this.nodeId.toString('hex')) return;
      
      if (data && data.id && data.address && data.port) {
        const node: DHTNode = {
          id: data.id,
          address: data.address,
          port: data.port,
          lastSeen: data.lastSeen || Date.now()
        };
        
        this._addNodeToRoutingTable(node);
      }
    });
    
    // Subscribe to content announcements
    this.contentSpace.map().on((data: any, infoHash: string) => {
      if (infoHash === '_') return;
      
      // Check if we're tracking this hash
      if (this.infoHashes.has(infoHash)) {
        // Process the peers for this hash
        this._processPeersUpdate(infoHash, data);
      }
    });
    
    // Start persistence interval if enabled
    if (this.options.enablePersistence) {
      this.persistenceInterval = setInterval(() => {
        this._saveCachedData();
      }, CLEANUP_INTERVAL); // Every 5 minutes
    }
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this._cleanupStaleData();
    }, CLEANUP_INTERVAL);
    
    this.started = true;
    debug('DHT client started');
  }
  
  /**
   * Stop the DHT client
   */
  public async stop(): Promise<void> {
    if (!this.started) {
      return;
    }
    
    debug('Stopping DHT client...');
    
    // Save data before stopping if persistence is enabled
    if (this.options.enablePersistence) {
      this._saveCachedData();
    }
    
    // Clear intervals
    if (this.persistenceInterval) {
      clearInterval(this.persistenceInterval);
      this.persistenceInterval = null;
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // Clear announce timeouts
    for (const timeout of this.announceTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.announceTimeouts.clear();
    
    // Unsubscribe from Gun data
    this.routingTableSpace.off();
    this.contentSpace.off();
    
    this.started = false;
    debug('DHT client stopped');
  }
  
  /**
   * Load cached routing table and peers from disk
   * @private
   */
  private _loadCachedData(): void {
    if (!this.options.enablePersistence) return;
    
    const routingTablePath = path.join(this.options.persistenceDir, 'dht-routing-table.json');
    const peersPath = path.join(this.options.persistenceDir, 'dht-peers.json');
    
    try {
      // Load routing table
      if (fs.existsSync(routingTablePath)) {
        const data = fs.readJSONSync(routingTablePath);
        if (Array.isArray(data)) {
          for (const node of data) {
            this._addNodeToRoutingTable(node);
          }
        }
        debug(`Loaded ${this.routingTable.size} nodes from routing table`);
      }
      
      // Load peer cache
      if (fs.existsSync(peersPath)) {
        const data = fs.readJSONSync(peersPath);
        if (data && typeof data === 'object') {
          for (const [infoHash, peers] of Object.entries(data)) {
            if (Array.isArray(peers)) {
              this.peerCache.set(infoHash, peers as DiscoveryPeer[]);
            }
          }
        }
        debug(`Loaded peer cache with ${this.peerCache.size} info hashes`);
      }
    } catch (err) {
      debug(`Error loading cached data: ${(err as Error).message}`);
    }
  }
  
  /**
   * Save routing table and peers to disk
   * @private
   */
  private _saveCachedData(): void {
    if (!this.options.enablePersistence) return;
    
    const routingTablePath = path.join(this.options.persistenceDir, 'dht-routing-table.json');
    const peersPath = path.join(this.options.persistenceDir, 'dht-peers.json');
    
    try {
      // Save routing table (up to 1000 most recently seen nodes)
      const nodes = Array.from(this.routingTable.values())
        .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
        .slice(0, 1000);
      
      fs.writeJSONSync(routingTablePath, nodes);
      
      // Save peer cache
      const peerCache: Record<string, DiscoveryPeer[]> = {};
      for (const infoHash of this.peerCache.keys()) {
        const peers = this.peerCache.get(infoHash);
        if (peers) {
          peerCache[infoHash] = peers;
        }
      }
      
      fs.writeJSONSync(peersPath, peerCache);
      
      debug('Saved DHT data to disk');
    } catch (err) {
      debug(`Error saving cached data: ${(err as Error).message}`);
    }
  }
  
  /**
   * Clean up stale routing table entries and peer data
   * @private
   */
  private _cleanupStaleData(): void {
    const now = Date.now();
    const staleTime = this.options.ttl;
    
    // Clean up routing table
    for (const [id, node] of this.routingTable.entries()) {
      if (now - (node.lastSeen || 0) > staleTime) {
        this.routingTable.delete(id);
      }
    }
    
    // LRU cache handles peer cleanup automatically based on TTL
  }
  
  /**
   * Process peers update from Gun.js
   * @private
   * @param infoHash The info hash
   * @param data The peer data from Gun
   */
  private _processPeersUpdate(infoHash: string, data: any): void {
    if (!data || typeof data !== 'object') return;
    
    // Get current peers for this hash
    const currentPeers = this.peerCache.get(infoHash) || [];
    const now = Date.now();
    const updatedPeers = [...currentPeers];
    let changed = false;
    
    // Process each peer in the data
    Object.entries(data).forEach(([nodeId, peerData]: [string, any]) => {
      if (nodeId === '_' || !peerData || typeof peerData !== 'object') return;
      
      // Skip our own node
      if (nodeId === this.nodeId.toString('hex')) return;
      
      // Validate peer data
      if (!peerData.address || !peerData.port || !peerData.timestamp) return;
      
      // Check if peer is too old
      if (now - peerData.timestamp > this.options.ttl) return;
      
      // Create peer object
      const peer: DiscoveryPeer = {
        id: nodeId,
        address: peerData.address,
        port: peerData.port,
        source: 'dht',
        confidence: 0.9,
        infoHashes: [infoHash]
      };
      
      // Check if we already have this peer
      const existingIndex = updatedPeers.findIndex(p => p.id === nodeId);
      if (existingIndex >= 0) {
        updatedPeers[existingIndex] = peer;
      } else {
        updatedPeers.push(peer);
        
        // Emit discovery event
        this.emit('peer-discovered', peer);
        debug(`Discovered peer ${peer.address}:${peer.port} for hash ${infoHash.substring(0, 6)}...`);
      }
      
      changed = true;
    });
    
    // Update cache if peers changed
    if (changed) {
      this.peerCache.set(infoHash, updatedPeers);
    }
  }
  
  /**
   * Announce our node to the DHT network
   * @private
   */
  private _announceNode(): void {
    const nodeData = {
      id: this.nodeId.toString('hex'),
      address: this.options.externalIp || this._getLocalIP(),
      port: this.options.udpPort || 0,
      lastSeen: Date.now(),
      nodeType: this.nodeType
    };
    
    // Announce using our node ID as the key
    this.routingTableSpace.get(this.nodeId.toString('hex')).put(nodeData);
    debug('Announced node to DHT network');
  }
  
  /**
   * Get the local IP address
   * @private
   */
  private _getLocalIP(): string {
    // Simplified version - in production you'd use a proper IP detection
    return '127.0.0.1';
  }
  
  /**
   * Find nodes close to a target ID
   * @param targetId - Target ID to find nodes for
   * @returns Promise resolving to found nodes
   */
  public async findNode(targetId: string): Promise<DHTNode[]> {
    if (!this.started) {
      await this.start();
    }
    
    debug(`Finding nodes close to ${targetId.substring(0, 6)}...`);
    
    // Find the closest nodes in our routing table
    const closestNodes = this._findClosestNodes(targetId, K);
    
    debug(`Found ${closestNodes.length} nodes close to ${targetId.substring(0, 6)}...`);
    return closestNodes;
  }
  
  /**
   * Find peers for an info hash
   * @param infoHash - Info hash to find peers for
   * @param maxPeers - Maximum number of peers to return (default: 100)
   * @returns Promise resolving to found peers
   */
  public async findPeers(infoHash: string, maxPeers: number = 100): Promise<DiscoveryPeer[]> {
    // Normalize the info hash
    infoHash = infoHash.toLowerCase();
    
    // Check if we're using sharding and if this hash belongs to our shard
    if (this.sharding && !this._isResponsibleForHash(infoHash)) {
      debug(`Limited search for ${infoHash.substring(0, 6)}... (not in our shard)`);
      return this._limitedFindPeers(infoHash, maxPeers);
    }
    
    if (!this.started) {
      await this.start();
    }
    
    // Check if we have cached peers for this info hash
    const cachedPeers = this.peerCache.get(infoHash);
    if (cachedPeers && cachedPeers.length > 0) {
      debug(`Found ${cachedPeers.length} cached peers for ${infoHash.substring(0, 6)}...`);
      return cachedPeers.slice(0, maxPeers);
    }
    
    debug(`Finding peers for ${infoHash.substring(0, 6)}...`);
    
    // Query for peers in Gun.js
    try {
      const peers: DiscoveryPeer[] = [];
      
      // Create a promise that resolves after receiving peer data or times out
      await new Promise<void>((resolve) => {
        // Set a timeout of 2 seconds to gather peer data
        const timeout = setTimeout(() => {
          resolve();
        }, 2000);
        
        // Query Gun for peers
        this.contentSpace.get(infoHash).once((data: any) => {
          if (data && typeof data === 'object') {
            // Process peer data
            Object.entries(data).forEach(([nodeId, peerData]: [string, any]) => {
              if (nodeId === '_' || !peerData || typeof peerData !== 'object') return;
              
              // Skip our own node
              if (nodeId === this.nodeId.toString('hex')) return;
              
              // Validate peer data
              if (!peerData.address || !peerData.port) return;
              
              // Create peer object
              const peer: DiscoveryPeer = {
                id: nodeId,
                address: peerData.address,
                port: peerData.port,
                source: 'dht',
                confidence: 0.9,
                infoHashes: [infoHash]
              };
              
              peers.push(peer);
            });
          }
          
          clearTimeout(timeout);
          resolve();
        });
      });
      
      // Cache the results if we found any
      if (peers.length > 0) {
        this.peerCache.set(infoHash, peers);
      }
      
      debug(`Found ${peers.length} peers for ${infoHash.substring(0, 6)}...`);
      return peers.slice(0, maxPeers);
    } catch (err) {
      debug(`Error finding peers: ${(err as Error).message}`);
      return [];
    }
  }
  
  /**
   * Limited peer search for non-shard hashes
   * @private
   * @param infoHash Info hash to search for
   * @param maxPeers Maximum peers to return
   */
  private async _limitedFindPeers(infoHash: string, maxPeers: number): Promise<DiscoveryPeer[]> {
    // Check if we have cached peers first
    const cachedPeers = this.peerCache.get(infoHash);
    if (cachedPeers && cachedPeers.length > 0) {
      debug(`Found ${cachedPeers.length} cached peers for ${infoHash.substring(0, 6)}... (limited search)`);
      return cachedPeers.slice(0, maxPeers);
    }
    
    // Do a quick Gun.js lookup without subscribing
    try {
      const peers: DiscoveryPeer[] = [];
      
      await new Promise<void>((resolve) => {
        // Set a timeout of 1 second for limited search
        const timeout = setTimeout(() => {
          resolve();
        }, 1000);
        
        // Query Gun for peers
        this.contentSpace.get(infoHash).once((data: any) => {
          if (data && typeof data === 'object') {
            // Process peer data (same as in findPeers)
            Object.entries(data).forEach(([nodeId, peerData]: [string, any]) => {
              if (nodeId === '_' || !peerData || typeof peerData !== 'object') return;
              if (nodeId === this.nodeId.toString('hex')) return;
              if (!peerData.address || !peerData.port) return;
              
              const peer: DiscoveryPeer = {
                id: nodeId,
                address: peerData.address,
                port: peerData.port,
                source: 'dht',
                confidence: 0.8, // Lower confidence for non-shard content
                infoHashes: [infoHash]
              };
              
              peers.push(peer);
              
              if (peers.length >= maxPeers) {
                clearTimeout(timeout);
                resolve();
              }
            });
          }
          
          clearTimeout(timeout);
          resolve();
        });
      });
      
      // Cache the results if we found any
      if (peers.length > 0) {
        this.peerCache.set(infoHash, peers);
      }
      
      debug(`Found ${peers.length} peers for ${infoHash.substring(0, 6)}... (limited search)`);
      return peers.slice(0, maxPeers);
    } catch (err) {
      debug(`Error in limited find peers: ${(err as Error).message}`);
      return [];
    }
  }
  
  /**
   * Announce that we have a peer for an info hash
   * @param infoHash - Info hash to announce
   * @param port - Port that the peer is listening on
   * @param interval - Announce interval in minutes (0 to announce once)
   * @returns Promise that resolves when the announce is complete
   */
  public async announcePeer(infoHash: string, port: number, interval: number = ANNOUNCE_INTERVAL / 60000): Promise<void> {
    // Check if we're responsible for this hash when using sharding
    if (this.sharding && !this._isResponsibleForHash(infoHash)) {
      debug(`Not announcing ${infoHash.substring(0, 6)}... (not in our shard)`);
      return;
    }
    
    if (!this.started) {
      await this.start();
    }
    
    // Clear any existing timeout for this info hash
    if (this.announceTimeouts.has(infoHash)) {
      clearTimeout(this.announceTimeouts.get(infoHash)!);
      this.announceTimeouts.delete(infoHash);
    }
    
    debug(`Announcing peer for ${infoHash.substring(0, 6)}... on port ${port}`);
    
    // Create the announcement data
    const announcement = {
      address: this.options.externalIp || this._getLocalIP(),
      port,
      timestamp: Date.now(),
      nodeType: this.nodeType
    };
    
    // Announce to Gun.js
    try {
      this.contentSpace.get(infoHash).get(this.nodeId.toString('hex')).put(announcement);
      
      // Set up periodic announcement if interval > 0
      if (interval > 0) {
        const timeoutId = setTimeout(() => {
          this.announcePeer(infoHash, port, interval).catch(err => {
            debug(`Error in periodic announce: ${(err as Error).message}`);
          });
        }, interval * 60 * 1000); // Convert minutes to milliseconds
        
        this.announceTimeouts.set(infoHash, timeoutId);
      }
      
      debug(`Announced peer for ${infoHash.substring(0, 6)}... on port ${port}`);
    } catch (err) {
      debug(`Error announcing peer: ${(err as Error).message}`);
      throw err;
    }
  }
  
  /**
   * Add an info hash to announce and maintain
   * @param infoHash The info hash to add
   */
  public addInfoHash(infoHash: string): void {
    if (!this._validateInfoHash(infoHash)) {
      throw new Error('Invalid info hash');
    }
    
    this.infoHashes.add(infoHash);
    
    // Start announcing
    if (this.options.udpPort) {
      this.announcePeer(infoHash, this.options.udpPort).catch(err => {
        debug(`Error announcing info hash ${infoHash}: ${err.message}`);
      });
    }
    
    // Subscribe to updates for this hash
    this.contentSpace.get(infoHash).map().on((data: any, nodeId: string) => {
      if (nodeId === '_' || nodeId === this.nodeId.toString('hex')) return;
      
      // Process this peer
      if (data && data.address && data.port && data.timestamp) {
        const now = Date.now();
        
        // Check if the peer is too old
        if (now - data.timestamp > this.options.ttl) return;
        
        const peer: DiscoveryPeer = {
          id: nodeId,
          address: data.address,
          port: data.port,
          source: 'dht',
          confidence: 0.9,
          infoHashes: [infoHash]
        };
        
        // Add to cache
        const peers = this.peerCache.get(infoHash) || [];
        const existingIndex = peers.findIndex(p => p.id === nodeId);
        
        if (existingIndex >= 0) {
          peers[existingIndex] = peer;
        } else {
          peers.push(peer);
          
          // Emit discovery event
          this.emit('peer-discovered', peer);
          debug(`Discovered peer ${peer.address}:${peer.port} for hash ${infoHash.substring(0, 6)}...`);
        }
        
        this.peerCache.set(infoHash, peers);
      }
    });
  }
  
  /**
   * Remove an info hash from announcements
   * @param infoHash The info hash to remove
   */
  public removeInfoHash(infoHash: string): void {
    this.infoHashes.delete(infoHash);
    
    // Remove our announcement
    this.contentSpace.get(infoHash).get(this.nodeId.toString('hex')).put(null);
    
    // Unsubscribe from updates
    this.contentSpace.get(infoHash).off();
    
    // Clear announce timeout
    const timeout = this.announceTimeouts.get(infoHash);
    if (timeout) {
      clearTimeout(timeout);
      this.announceTimeouts.delete(infoHash);
    }
  }
  
  /**
   * Remove a peer for an info hash
   * @param peerId The peer ID to remove
   * @param infoHash The info hash to remove the peer from
   */
  public removePeer(peerId: string, infoHash: string): void {
    const peers = this.peerCache.get(infoHash);
    if (peers) {
      const filtered = peers.filter(p => p.id !== peerId);
      if (filtered.length !== peers.length) {
        this.peerCache.set(infoHash, filtered);
      }
    }
  }
  
  /**
   * Find the closest nodes to a target ID
   * @param targetId - Target ID to find nodes for
   * @param count - Number of nodes to return
   * @returns Array of closest nodes
   * @private
   */
  private _findClosestNodes(targetId: string, count: number): DHTNode[] {
    const targetBuf = Buffer.from(targetId, 'hex');
    const closest = Array.from(this.routingTable.values())
      .sort((a, b) => {
        const distA = this._calculateDistance(Buffer.from(a.id, 'hex'), targetBuf);
        const distB = this._calculateDistance(Buffer.from(b.id, 'hex'), targetBuf);
        return Buffer.compare(distA, distB);
      })
      .slice(0, count);
    
    return closest;
  }
  
  /**
   * Calculate XOR distance between two node IDs
   * @private
   */
  private _calculateDistance(id1: string | Buffer, id2: string | Buffer): Buffer {
    const buf1 = Buffer.isBuffer(id1) ? id1 : Buffer.from(id1, 'hex');
    const buf2 = Buffer.isBuffer(id2) ? id2 : Buffer.from(id2, 'hex');
    const result = Buffer.alloc(20);

    for (let i = 0; i < 20; i++) {
      result[i] = buf1[i] ^ buf2[i];
    }

    return result;
  }
  
  /**
   * Check if this node is responsible for a hash in sharded mode
   * @param infoHash - The info hash to check
   * @returns True if this node is responsible for the hash
   * @private
   */
  private _isResponsibleForHash(infoHash: string): boolean {
    if (!this.sharding) return true;
    
    // If we have any prefix match, we're responsible for this hash
    return this.options.shardPrefixes.some(prefix => 
      infoHash.startsWith(prefix)
    );
  }
  
  /**
   * Add a node to the routing table
   * @private
   * @param node The node to add
   */
  private _addNodeToRoutingTable(node: DHTNode): void {
    if (!node.id || !this._validateNodeId(node.id)) {
      debug(`Invalid node ID for ${node.address}:${node.port}`);
      return;
    }

    try {
      // Update lastSeen if node exists
      const existingNode = this.routingTable.get(node.id);
      if (existingNode) {
        existingNode.lastSeen = Date.now();
        return;
      }

      // Add new node
      node.lastSeen = Date.now();
      this.routingTable.set(node.id, node);

      // Prune old nodes if we exceed K
      if (this.routingTable.size > K * 20) { // Allow more nodes in Gun implementation
        let oldest: DHTNode | null = null;
        let oldestTime = Infinity;

        for (const [, n] of this.routingTable) {
          if (n.lastSeen && n.lastSeen < oldestTime) {
            oldest = n;
            oldestTime = n.lastSeen;
          }
        }

        if (oldest) {
          this.routingTable.delete(oldest.id);
        }
      }

      debug(`Added node ${node.id.substring(0, 6)}... to routing table`);
    } catch (err) {
      debug(`Error adding node to routing table: ${(err as Error).message}`);
    }
  }
  
  /**
   * Validate a node ID
   * @private
   * @param nodeId The node ID to validate
   * @returns True if valid, false otherwise
   */
  private _validateNodeId(nodeId: string): boolean {
    // Check length (20 bytes = 40 hex chars)
    if (nodeId.length !== 40) {
      return false;
    }
    
    // Check if valid hex
    return /^[0-9a-f]{40}$/i.test(nodeId);
  }
  
  /**
   * Validate an info hash
   * @private
   * @param infoHash The info hash to validate
   * @returns True if valid, false otherwise
   */
  private _validateInfoHash(infoHash: string): boolean {
    // Check length (20 bytes = 40 hex chars for SHA-1, 32 bytes = 64 hex chars for SHA-256)
    if (infoHash.length !== 40 && infoHash.length !== 64) {
      return false;
    }
    
    // Check if valid hex
    return /^[0-9a-f]+$/i.test(infoHash);
  }
}

/**
 * Create a new DHT client with the specified options
 */
export default function createDHT(options: DHTOptions): DHT {
  return new DHT(options);
} 
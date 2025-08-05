/**
 * Gun.js Discovery Implementation
 * 
 * This module provides peer discovery functionality using Gun.js, 
 * a decentralized graph database that can be used for real-time peer discovery.
 */

import Debug from 'debug';
import { EventEmitter } from 'events';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';
import { validatePeerId, validatePeerAddress } from '../../../utils/security';
import { getPreferredIPs } from '../../../utils/ip-helper';
import { PEER_SOURCES } from '../../../discovery/types';

// Import types from local types file - using type-only imports
import type {
  DiscoveryPeer,
  DiscoveryEvents,
  Events,
  GunPeer,
  GunDiscoveryOptions,
  GunPeerData,
  GunContentMapData,
  HashData,
  GunInstance,
  GunPeerMapData,
  GunDiscovery as IGunDiscovery
} from './types';

const debug = Debug('dig-nat-tools:gun-discovery');

// Helper type guards for Gun data
function isGunPeerData(data: unknown): data is GunPeerData {
  return data !== null && 
         typeof data === 'object' && 
         'ip' in data && 
         'port' in data &&
         typeof (data as any).ip === 'string' &&
         typeof (data as any).port === 'number';
}

function isGunContentMapData(data: unknown): data is GunContentMapData {
  return data !== null && 
         typeof data === 'object' && 
         'hash' in data && 
         typeof (data as any).hash === 'string';
}

function isGunPeerMapData(data: unknown): data is GunPeerMapData {
  return data !== null && typeof data === 'object';
}

export declare interface GunDiscovery {
  on<E extends keyof Events>(event: E, listener: (...args: Events[E]) => void): this;
  off<E extends keyof Events>(event: E, listener: (...args: Events[E]) => void): this;
  emit<E extends keyof Events>(event: E, ...args: Events[E]): boolean;
}

/**
 * GunDiscovery - Uses Gun.js for real-time peer discovery
 */
export class GunDiscovery extends EventEmitter implements IGunDiscovery {
  public readonly gun: GunInstance;
  private options: GunDiscoveryOptions;
  private infoHashes: Set<string> = new Set();
  private highPriorityHashes: Set<string> = new Set();
  private contentHashMap: Map<string, string> = new Map();
  private knownPeers: Map<string, GunPeer> = new Map();
  private announceTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private started: boolean = false;
  private nodeId: string;
  private externalIp: string | null = null;
  private externalPort: number | null = null;
  private persistenceDir: string;
  
  /**
   * Create a new GunDiscovery instance
   * @param options - Gun discovery options
   */
  constructor(options: GunDiscoveryOptions) {
    super();
    
    this.options = {
      gun: options.gun,
      nodeId: options.nodeId || this._generateNodeId(),
      announceInterval: options.announceInterval || 60000, // 1 minute default
      announcePort: options.announcePort || 0,
      enablePersistence: options.enablePersistence !== undefined ? options.enablePersistence : true,
      persistenceDir: options.persistenceDir || './.dig-nat-tools',
      peerTTL: options.peerTTL || 3600000, // 1 hour default
      cleanupInterval: options.cleanupInterval || 300000, // 5 minutes default
      externalIp: options.externalIp || null,
      externalPort: options.externalPort || null
    };
    
    this.gun = this.options.gun;
    this.nodeId = this.options.nodeId;
    this.persistenceDir = this.options.persistenceDir;
    this.externalIp = this.options.externalIp;
    this.externalPort = this.options.externalPort;
    
    debug(`GunDiscovery created with node ID: ${this.nodeId}`);
  }
  
  /**
   * Start the Gun discovery service
   */
  public async start(): Promise<void> {
    if (this.started) {
      debug('GunDiscovery already started');
      return;
    }
    
    debug('Starting GunDiscovery...');
    
    // Make sure Gun instance is initialized
    if (!this.gun) {
      throw new Error('Gun instance not provided. Please initialize Gun before starting discovery.');
    }
    
    // Load cached data if persistence is enabled
    if (this.options.enablePersistence) {
      await this._loadCachedData();
    }
    
    // Set up Gun.js for peer discovery
    this._setupGunPeerDiscovery();
    
    // Start announcing
    this._startAnnouncing();
    
    // Start cleanup timer
    this._startCleanupTimer();
    
    this.started = true;
    debug('GunDiscovery started');
  }
  
  /**
   * Stop the Gun discovery service
   */
  public async stop(): Promise<void> {
    if (!this.started) {
      return;
    }
    
    debug('Stopping GunDiscovery...');
    
    // Clear timers
    if (this.announceTimer) {
      clearInterval(this.announceTimer);
      this.announceTimer = null;
    }
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    // Save cached data if persistence is enabled
    if (this.options.enablePersistence) {
      await this._saveCachedData();
    }
    
    this.started = false;
    debug('GunDiscovery stopped');
  }
  
  /**
   * Add an info hash to be announced and tracked
   * @param infoHash - The SHA-256 hash to announce and track
   * @param highPriority - Whether this hash should be prioritized
   */
  public addInfoHash(infoHash: string, highPriority: boolean = false): void {
    if (!infoHash) {
      debug('Cannot add empty info hash');
      return;
    }
    
    debug(`Adding info hash: ${infoHash}${highPriority ? ' (high priority)' : ''}`);
    
    this.infoHashes.add(infoHash);
    
    if (highPriority) {
      this.highPriorityHashes.add(infoHash);
    }
    
    // Immediately announce
    if (this.started) {
      this._announceHash(infoHash);
    }
  }
  
  /**
   * Remove an info hash from being announced and tracked
   * @param infoHash - The SHA-256 hash to stop announcing and tracking
   */
  public removeInfoHash(infoHash: string): void {
    if (!infoHash) {
      return;
    }
    
    debug(`Removing info hash: ${infoHash}`);
    
    this.infoHashes.delete(infoHash);
    this.highPriorityHashes.delete(infoHash);
    
    // Remove announcement from Gun
    if (this.started && this.gun) {
      try {
        this.gun.get('dig-peers').get(infoHash).get(this.nodeId).put(null);
      } catch (err) {
        debug(`Error removing hash announcement: ${(err as Error).message}`);
      }
    }
  }
  
  /**
   * Find peers that have announced a specific info hash
   * @param infoHash - The SHA-256 hash to find peers for
   * @param maxPeers - Maximum number of peers to return
   * @param timeout - Timeout in milliseconds for the search
   * @returns Promise resolving to array of discovered peers
   */
  public async findPeers(infoHash: string, maxPeers: number = 100, timeout: number = 5000): Promise<DiscoveryPeer[]> {
    if (!this.started) {
      throw new Error('GunDiscovery not started');
    }
    
    debug(`Finding peers for hash: ${infoHash}`);
    
    // Check if we have a content ID mapping
    const mappedHash = this.getHashForContent(infoHash);
    if (mappedHash) {
      debug(`Found content mapping: ${infoHash} -> ${mappedHash}`);
      infoHash = mappedHash;
    }
    
    // First, check our known peers cache
    const cachedPeers: DiscoveryPeer[] = [];
    this.knownPeers.forEach(gunPeer => {
      if (gunPeer.infoHashes.includes(infoHash)) {
        // Convert our internal GunPeer to a DiscoveredPeer
        cachedPeers.push({
          id: gunPeer.id,
          address: gunPeer.address,
          port: gunPeer.port,
          source: gunPeer.source,
          confidence: gunPeer.confidence || 0.9, // High confidence for Gun discovered peers
          infoHashes: [infoHash]
        });
      }
    });
    
    if (cachedPeers.length >= maxPeers) {
      return cachedPeers.slice(0, maxPeers);
    }
    
    // If we don't have enough cached peers, query Gun
    return new Promise((resolve) => {
      const peers: DiscoveryPeer[] = [...cachedPeers];
      const timeoutId = setTimeout(() => {
        resolve(peers);
      }, timeout);
      
      try {
        // Query Gun for peers that have this hash
        this.gun.get('dig-peers').get(infoHash).once((data: unknown, _key: string) => {
          clearTimeout(timeoutId);
          
          // Type guard for the data
          if (!isGunPeerMapData(data)) {
            resolve(peers);
            return;
          }
          
          // Process peer data and remove own node
          Object.entries(data).forEach(([nodeId, peerInfoUntyped]) => {
            if (nodeId === '_' || nodeId === this.nodeId) return;
            
            // Type guard for peer info
            if (!isGunPeerData(peerInfoUntyped)) {
              return;
            }
            
            const peerInfo = peerInfoUntyped;
            
            // Skip local peers
            if (this._isLocalIP(peerInfo.ip)) {
              debug(`Skipping local peer ${peerInfo.ip}`);
              return;
            }
            
            const now = Date.now();
            const timestamp = peerInfo.timestamp || now;
            
            // Check if the peer announcement is too old
            if (timestamp && now - timestamp > this.options.peerTTL!) {
              return;
            }
            
            // Create standardized DiscoveredPeer for the event
            const discoveredPeer: DiscoveryPeer = {
              id: nodeId,
              address: peerInfo.ip,
              port: peerInfo.port,
              source: PEER_SOURCES.GUN,
              confidence: 0.9,
              infoHashes: [infoHash]
            };
            
            // Add to peers if not already there
            if (!peers.some(p => p.id === nodeId)) {
              peers.push(discoveredPeer);
              
              // Create and store internal GunPeer representation
              const gunPeer: GunPeer = {
                id: nodeId,
                address: peerInfo.ip,
                port: peerInfo.port,
                source: PEER_SOURCES.GUN,
                confidence: 0.9,
                metadata: {
                  lastSeen: timestamp
                },
                infoHashes: [infoHash]
              };
              
              // Update existing peer or add new
              const existingPeer = this.knownPeers.get(nodeId);
              if (existingPeer) {
                // Update last seen time
                existingPeer.metadata.lastSeen = Math.max(existingPeer.metadata.lastSeen, gunPeer.metadata.lastSeen);
                
                // Add hash if not already there
                if (!existingPeer.infoHashes.includes(infoHash)) {
                  existingPeer.infoHashes.push(infoHash);
                }
              } else {
                this.knownPeers.set(nodeId, gunPeer);
              }
              
              // Emit discovery event with the standardized peer
              this.emit('peer-discovered', discoveredPeer);
              debug(`Discovered peer ${discoveredPeer.address}:${discoveredPeer.port} for hash ${infoHash}`);
            }
          });
          
          resolve(peers.slice(0, maxPeers));
        });
      } catch (err) {
        debug(`Error finding peers: ${(err as Error).message}`);
        clearTimeout(timeoutId);
        resolve(peers);
      }
    });
  }
  
  /**
   * Add a content mapping (human-readable ID to hash)
   * @param contentId - Human-readable content identifier
   * @param infoHash - SHA-256 hash of the content
   */
  public addContentMapping(contentId: string, infoHash: string): void {
    if (!contentId || !infoHash) {
      return;
    }
    
    debug(`Adding content mapping: ${contentId} -> ${infoHash}`);
    
    this.contentHashMap.set(contentId, infoHash);
    
    // Store in Gun
    if (this.started && this.gun) {
      try {
        const contentMapData: GunContentMapData = {
          hash: infoHash
        };
        this.gun.get('dig-content-maps').get(contentId).put(contentMapData);
      } catch (err) {
        debug(`Error storing content mapping: ${(err as Error).message}`);
      }
    }
  }
  
  /**
   * Remove a content mapping
   * @param contentId - Human-readable content identifier to remove
   */
  public removeContentMapping(contentId: string): void {
    if (!contentId) {
      return;
    }
    
    debug(`Removing content mapping: ${contentId}`);
    
    this.contentHashMap.delete(contentId);
    
    // Remove from Gun
    if (this.started && this.gun) {
      try {
        this.gun.get('dig-content-maps').get(contentId).put(null);
      } catch (err) {
        debug(`Error removing content mapping: ${(err as Error).message}`);
      }
    }
  }
  
  /**
   * Get a hash by content ID
   * @param contentId - Human-readable content identifier
   * @returns SHA-256 hash or undefined if not found
   */
  public getHashForContent(contentId: string): string | undefined {
    // First check our local map
    const hash = this.contentHashMap.get(contentId);
    if (hash) {
      return hash;
    }
    
    // If not found locally, try to get from Gun
    // This will be async, but we'll just return undefined for now
    // and query Gun in the background to update our local map
    if (this.started && this.gun) {
      try {
        this.gun.get('dig-content-maps').get(contentId).once((data: unknown, _key: string) => {
          // Type guard for content map data
          if (isGunContentMapData(data)) {
            this.contentHashMap.set(contentId, data.hash);
          }
        });
      } catch (err) {
        debug(`Error getting content hash: ${(err as Error).message}`);
      }
    }
    
    return undefined;
  }
  
  /**
   * Get a content ID for a hash (reverse lookup)
   * @param infoHash - SHA-256 hash
   * @returns Content ID or undefined if not found
   */
  public getContentForHash(infoHash: string): string | undefined {
    // Check our local map with a reverse lookup
    for (const [contentId, hash] of this.contentHashMap.entries()) {
      if (hash === infoHash) {
        return contentId;
      }
    }
    
    // If not found locally, try to get from Gun
    // This will be async, but we'll just return undefined for now
    if (this.started && this.gun) {
      try {
        this.gun.get('dig-content-maps').map().on((data: unknown, key: string) => {
          // Type guard for content map data
          if (isGunContentMapData(data)) {
            if (data.hash === infoHash) {
              this.contentHashMap.set(key, infoHash);
            }
          }
        });
      } catch (err) {
        debug(`Error getting content id: ${(err as Error).message}`);
      }
    }
    
    return undefined;
  }
  
  /**
   * Announce a peer for an info hash
   * @param infoHash - The info hash to announce for
   * @param peerId - The peer ID to announce
   */
  public announce(infoHash: string, peerId: string): void {
    if (!this.started || !this.gun) {
      debug('Cannot announce: Gun discovery not started');
      return;
    }

    const ip = this.externalIp || this._getLocalIP();
    const port = this.externalPort || this.options.announcePort || 0;

    if (!ip || port === null) {
      debug('Cannot announce without IP and port');
      return;
    }

    try {
      const timestamp = Date.now();
      
      // Announce our presence for this hash
      const peerData: GunPeerData = {
        ip,
        port,
        timestamp,
        ver: '1.0' // Version for future compatibility
      };
      
      this.gun.get('dig-peers').get(infoHash).get(peerId).put(peerData);
      
      debug(`Announced peer ${peerId} for hash ${infoHash} with ${ip}:${port}`);
    } catch (err) {
      debug(`Error announcing peer: ${(err as Error).message}`);
    }
  }
  
  /**
   * Set up Gun.js for peer discovery
   * @private
   */
  private _setupGunPeerDiscovery(): void {
    if (!this.gun) {
      debug('Gun instance not available');
      return;
    }
    
    try {
      // Listen for peer announcements
      this.gun.get('dig-peers').map().on((data: unknown, key: string) => {
        // key is the infoHash, data is the node information
        if (!isGunPeerMapData(data) || key === '_') {
          return;
        }
        
        const infoHash = key;
        
        if (!this.infoHashes.has(infoHash)) {
          // We're only interested in hashes we're tracking
          return;
        }
        
        // Process the peers for this hash
        Object.entries(data).forEach(([nodeId, peerInfoUntyped]) => {
          if (nodeId === '_' || nodeId === this.nodeId) {
            return; // Skip metadata and self
          }
          
          // Type guard for peer info
          if (!isGunPeerData(peerInfoUntyped)) {
            return;
          }
          
          const peerInfo = peerInfoUntyped;
          
          const now = Date.now();
          const timestamp = peerInfo.timestamp || now;
          
          // Skip local peers
          if (this._isLocalIP(peerInfo.ip)) {
            debug(`Skipping local peer ${peerInfo.ip}`);
            return;
          }
          
          // Check if the peer announcement is too old
          if (timestamp && now - timestamp > this.options.peerTTL!) {
            return;
          }
          
          // Create standardized DiscoveryPeer for the event
          const discoveredPeer: DiscoveryPeer = {
            id: nodeId,
            address: peerInfo.ip,
            port: peerInfo.port,
            source: PEER_SOURCES.GUN,
            confidence: 0.9,
            infoHashes: [infoHash]
          };
          
          // Create internal GunPeer object for tracking
          const gunPeer: GunPeer = {
            id: nodeId,
            address: peerInfo.ip,
            port: peerInfo.port,
            source: PEER_SOURCES.GUN,
            confidence: 0.9,
            metadata: {
              lastSeen: timestamp
            },
            infoHashes: [infoHash]
          };
          
          // Update existing peer data or add new
          const existingPeer = this.knownPeers.get(nodeId);
          if (existingPeer) {
            existingPeer.metadata.lastSeen = Math.max(existingPeer.metadata.lastSeen, gunPeer.metadata.lastSeen);
            
            // Add hash if not already there
            if (!existingPeer.infoHashes.includes(infoHash)) {
              existingPeer.infoHashes.push(infoHash);
            }
          } else {
            this.knownPeers.set(nodeId, gunPeer);
            
            // Emit discovery event with standardized peer object
            this.emit('peer-discovered', discoveredPeer);
            debug(`Discovered peer ${discoveredPeer.address}:${discoveredPeer.port} for hash ${infoHash}`);
          }
        });
      });
      
      // Listen for content mapping updates
      this.gun.get('dig-content-maps').map().on((data: unknown, key: string) => {
        if (!isGunContentMapData(data) || key === '_') {
          return;
        }
        
        // Update our content map
        this.contentHashMap.set(key, data.hash);
        debug(`Updated content mapping: ${key} -> ${data.hash}`);
      });
      
    } catch (err) {
      debug(`Error setting up Gun peer discovery: ${(err as Error).message}`);
    }
  }
  
  /**
   * Start announcing hashes at regular intervals
   * @private
   */
  private _startAnnouncing(): void {
    // Immediately announce what we have
    this._announceAll();
    
    // Set up regular announcements
    this.announceTimer = setInterval(() => {
      this._announceAll();
    }, this.options.announceInterval!);
  }
  
  /**
   * Announce all tracked hashes
   * @private
   */
  private _announceAll(): void {
    // First announce high priority hashes
    for (const hash of this.highPriorityHashes) {
      this._announceHash(hash);
    }
    
    // Then announce regular hashes
    for (const hash of this.infoHashes) {
      if (!this.highPriorityHashes.has(hash)) {
        this._announceHash(hash);
      }
    }
  }
  
  /**
   * Announce a single hash
   * @param infoHash - Info hash to announce
   * @private
   */
  private _announceHash(infoHash: string): void {
    if (!this.gun) {
      return;
    }
    
    // Get the best IP and port to announce
    const ip = this.externalIp || this._getLocalIP();
    const port = this.externalPort || this.options.announcePort || 0;
    
    if (!ip || port === null) {
      debug('Cannot announce without IP and port');
      return;
    }
    
    try {
      const timestamp = Date.now();
      
      // Announce our presence for this hash
      const peerData: GunPeerData = {
        ip,
        port,
        timestamp,
        ver: '1.0' // Version for future compatibility
      };
      
      this.gun.get('dig-peers').get(infoHash).get(this.nodeId).put(peerData);
      
      debug(`Announced hash ${infoHash} with ${ip}:${port}`);
    } catch (err) {
      debug(`Error announcing hash ${infoHash}: ${(err as Error).message}`);
    }
  }
  
  /**
   * Start the peer cleanup timer
   * @private
   */
  private _startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this._cleanupStaleData();
    }, this.options.cleanupInterval!);
  }
  
  /**
   * Clean up stale peer data
   * @private
   */
  private _cleanupStaleData(): void {
    const now = Date.now();
    const stale = this.options.peerTTL!;
    
    // Remove stale peers
    for (const [nodeId, peer] of this.knownPeers.entries()) {
      if (now - peer.metadata.lastSeen > stale) {
        this.knownPeers.delete(nodeId);
        debug(`Removed stale peer: ${nodeId}`);
      }
    }
    
    // Also clean up from Gun.js by re-posting with null for our own expired announcements
    if (this.gun) {
      try {
        for (const hash of this.infoHashes) {
          this.gun.get('dig-peers').get(hash).get(this.nodeId).once((data: unknown) => {
            if (isGunPeerData(data) && data.timestamp) {
              if (now - data.timestamp > stale * 1.5) {
                // Our announcement is stale, remove it
                this.gun.get('dig-peers').get(hash).get(this.nodeId).put(null);
              }
            }
          });
        }
      } catch (err) {
        debug(`Error cleaning up stale data: ${(err as Error).message}`);
      }
    }
  }
  
  /**
   * Load cached data (persisted peer and hash information)
   * @private
   */
  private async _loadCachedData(): Promise<void> {
    if (!this.options.enablePersistence) {
      return;
    }
    
    try {
      // Create directory if it doesn't exist
      await fs.ensureDir(this.persistenceDir);
      
      // Load peers
      const peersPath = path.join(this.persistenceDir, 'gun-discovery-peers.json');
      if (await fs.pathExists(peersPath)) {
        const peersData = await fs.readJson(peersPath);
        if (peersData && Array.isArray(peersData)) {
          for (const peer of peersData) {
            this.knownPeers.set(peer.id, peer);
          }
        }
        debug(`Loaded ${this.knownPeers.size} peers from disk`);
      }
      
      // Load hash data
      const hashesPath = path.join(this.persistenceDir, 'gun-discovery-hashes.json');
      if (await fs.pathExists(hashesPath)) {
        const hashData = await fs.readJson(hashesPath) as HashData;
        
        // Load info hashes
        if (hashData.infoHashes) {
          hashData.infoHashes.forEach((hash: string) => {
            this.infoHashes.add(hash);
          });
        }
        
        // Load high priority hashes
        if (hashData.highPriorityHashes) {
          hashData.highPriorityHashes.forEach((hash: string) => {
            this.highPriorityHashes.add(hash);
          });
        }
        
        // Load content hash map
        if (hashData.contentHashMap) {
          Object.entries(hashData.contentHashMap).forEach(([contentId, hash]) => {
            this.contentHashMap.set(contentId, hash);
          });
        }
        
        debug(`Loaded ${this.infoHashes.size} hashes and ${this.contentHashMap.size} content mappings from disk`);
      }
    } catch (err) {
      debug(`Error loading cached data: ${(err as Error).message}`);
    }
  }
  
  /**
   * Save cached data (persisted peer and hash information)
   * @private
   */
  private async _saveCachedData(): Promise<void> {
    if (!this.options.enablePersistence) {
      return;
    }
    
    try {
      // Ensure directory exists
      await fs.ensureDir(this.persistenceDir);
      
      // Save peers
      const peersPath = path.join(this.persistenceDir, 'gun-discovery-peers.json');
      await fs.writeJson(peersPath, Array.from(this.knownPeers.values()));
      
      // Save hash data
      const hashesPath = path.join(this.persistenceDir, 'gun-discovery-hashes.json');
      const contentHashMapObj: Record<string, string> = {};
      
      this.contentHashMap.forEach((hash, contentId) => {
        contentHashMapObj[contentId] = hash;
      });
      
      await fs.writeJson(hashesPath, {
        infoHashes: Array.from(this.infoHashes),
        highPriorityHashes: Array.from(this.highPriorityHashes),
        contentHashMap: contentHashMapObj
      });
      
      debug(`Saved ${this.knownPeers.size} peers, ${this.infoHashes.size} hashes, and ${this.contentHashMap.size} content mappings to disk`);
    } catch (err) {
      debug(`Error saving cached data: ${(err as Error).message}`);
    }
  }
  
  /**
   * Generate a random node ID
   * @private
   */
  private _generateNodeId(): string {
    const randomBytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  
  /**
   * Get the best local IP address
   * @private
   */
  private _getLocalIP(): string {
    try {
      const interfaces = os.networkInterfaces();
      let bestIp = '';
      
      // First try to find a non-internal IPv4 address
      for (const [_, addrs] of Object.entries(interfaces)) {
        if (!addrs) continue;
        
        for (const addr of addrs) {
          if (addr.family === 'IPv4' && !addr.internal) {
            return addr.address;
          }
        }
      }
      
      // Fall back to any IPv4 address
      for (const [_, addrs] of Object.entries(interfaces)) {
        if (!addrs) continue;
        
        for (const addr of addrs) {
          if (addr.family === 'IPv4') {
            bestIp = addr.address;
          }
        }
      }
      
      return bestIp || '127.0.0.1';
    } catch (err) {
      debug(`Error getting local IP: ${(err as Error).message}`);
      return '127.0.0.1';
    }
  }
  
  /**
   * Check if an IP is local
   * @param ip - IP address to check
   * @private
   */
  private _isLocalIP(ip: string): boolean {
    // Check if it's localhost
    if (ip === '127.0.0.1' || ip === '::1') {
      return true;
    }
    
    // Check if it's in private IP ranges
    if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) {
      return true;
    }
    
    // Check if it matches any local interface
    try {
      const interfaces = os.networkInterfaces();
      for (const [_name, addrs] of Object.entries(interfaces)) {
        if (!addrs) continue;
        
        for (const addr of addrs) {
          if (addr.address === ip) {
            return true;
          }
          
          // Check if it's in the same subnet
          if (addr.family === 'IPv4' && addr.netmask) {
            // Simplistic subnet check
            const ipParts = ip.split('.').map(Number);
            const addrParts = addr.address.split('.').map(Number);
            const maskParts = addr.netmask.split('.').map(Number);
            
            let inSubnet = true;
            for (let i = 0; i < 4; i++) {
              if ((ipParts[i] & maskParts[i]) !== (addrParts[i] & maskParts[i])) {
                inSubnet = false;
                break;
              }
            }
            
            if (inSubnet) {
              return true;
            }
          }
        }
      }
    } catch (err) {
      debug(`Error checking local IP: ${(err as Error).message}`);
    }
    
    return false;
  }

  public on<E extends keyof DiscoveryEvents>(event: E, listener: (...args: DiscoveryEvents[E]) => void): this {
    return super.on(event as string, listener);
  }

  public off<E extends keyof DiscoveryEvents>(event: E, listener: (...args: DiscoveryEvents[E]) => void): this {
    return super.off(event as string, listener);
  }

  public emit<E extends keyof DiscoveryEvents>(event: E, ...args: DiscoveryEvents[E]): boolean {
    return super.emit(event as string, ...args);
  }

  protected emitPeerDiscovered(peer: DiscoveryPeer): void {
    super.emit('peer-discovered', peer);
  }
}

export default GunDiscovery; 
/**
 * Peer Discovery Manager integrates multiple peer discovery mechanisms
 * Combines DHT, PEX, and Local Discovery for comprehensive peer finding
 */

import Debug from 'debug';
import { EventEmitter } from 'events';
import { DHTClient } from './dht';
import { PexManager } from './pex';
import { LocalDiscovery } from './local-discovery';
import LRUCache from 'lru-cache';
import * as fs from 'fs-extra';
import * as path from 'path';
import { GunDiscovery } from './gun-discovery';
import type { GunDiscoveryOptions } from './gun-discovery';
import { SimpleBloomFilter } from './utils';
import { validatePeerId, validatePeerAddress } from '../../utils/security';
import { getPreferredIPs } from '../../utils/ip-helper';
import { PEER_SOURCES } from '../../../types/constants';
import { PeerContentStatus } from '../../../types/common';
import { NODE_TYPE } from './types';
import type { BloomFilter, DiscoveredPeer, PeerDiscoveryOptions, DiscoveryEvents, DiscoveryComponent, DiscoveryPeer } from './types';
import { AnnouncePriority } from './types';

const debug = Debug('dig-nat-tools:peer-discovery');

/**
 * Manages multiple peer discovery mechanisms
 */
export class PeerDiscoveryManager extends EventEmitter implements DiscoveryComponent {
  private options: Required<PeerDiscoveryOptions>;
  private dht: DHTClient | null = null;
  private pex: PexManager | null = null;
  private local: LocalDiscovery | null = null;
  private gun: GunDiscovery | null = null;
  private discoveredPeers: Map<string, DiscoveredPeer> = new Map();
  private peerCache: LRUCache<string, DiscoveredPeer[]>;
  private infoHashes: Set<string> = new Set();
  private highPriorityHashes: Set<string> = new Set();
  private hashFilter: BloomFilter | null = null;
  private started: boolean = false;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private saveInterval: NodeJS.Timeout | null = null;
  private nodeType: NODE_TYPE;
  private peersByInfoHash: Map<string, Map<string, DiscoveredPeer>> = new Map();
  private contentHashMap: Map<string, string> = new Map();
  
  /**
   * Create a new peer discovery manager
   * @param options - Configuration options
   */
  constructor(options: PeerDiscoveryOptions = {}) {
    super();
    
    // Set node type
    this.nodeType = options.nodeType || NODE_TYPE.STANDARD;
    
    // Generate a node ID if not provided
    const nodeId = options.nodeId || this._generateNodeId();
    
    // Configure options with defaults based on node type
    this.options = {
      enableDHT: options.enableDHT !== undefined ? options.enableDHT : true,
      enablePEX: options.enablePEX !== undefined ? options.enablePEX : true,
      enableLocal: options.enableLocal !== undefined ? options.enableLocal : true,
      enableGun: options.enableGun !== undefined ? options.enableGun : false, // Disabled by default
      enableIPv6: options.enableIPv6 !== undefined ? options.enableIPv6 : false, // Default to IPv4 for backward compatibility
      dhtOptions: {
        ...options.dhtOptions,
        nodeType: this.nodeType,
        enablePersistence: options.enablePersistence,
        persistenceDir: options.persistenceDir,
        enableIPv6: options.enableIPv6 // Pass IPv6 option to DHT client
      },
      pexOptions: options.pexOptions || {},
      localOptions: options.localOptions || {},
      gunOptions: options.gunOptions || {},
      gun: options.gun || null,
      deduplicate: options.deduplicate !== undefined ? options.deduplicate : true,
      announcePort: options.announcePort || 0,
      maxPeers: options.maxPeers || (
        this.nodeType === NODE_TYPE.LIGHT ? 100 :
        this.nodeType === NODE_TYPE.STANDARD ? 1000 :
        this.nodeType === NODE_TYPE.SUPER ? 10000 : 1000
      ),
      nodeType: this.nodeType,
      enablePersistence: options.enablePersistence || false,
      persistenceDir: options.persistenceDir || './.dig-nat-tools',
      useBloomFilter: options.useBloomFilter !== undefined ? options.useBloomFilter : 
        this.nodeType === NODE_TYPE.SUPER ? true : false,
      nodeId: nodeId
    };
    
    // Set up LRU cache for peers with appropriate size based on node type
    const maxCachedHashes = (
      this.nodeType === NODE_TYPE.LIGHT ? 50 :
      this.nodeType === NODE_TYPE.STANDARD ? 200 :
      this.nodeType === NODE_TYPE.SUPER ? 1000 : 200
    );
    
    const ttl = (
      this.nodeType === NODE_TYPE.LIGHT ? 15 * 60 * 1000 : // 15 minutes
      this.nodeType === NODE_TYPE.STANDARD ? 30 * 60 * 1000 : // 30 minutes
      this.nodeType === NODE_TYPE.SUPER ? 60 * 60 * 1000 : // 1 hour
      30 * 60 * 1000 // Default: 30 minutes
    );
    
    this.peerCache = new LRUCache<string, DiscoveredPeer[]>({
      max: maxCachedHashes,
      ttl: ttl,
      updateAgeOnGet: true
    });
    
    // Set up Bloom filter for hash tracking if enabled
    if (this.options.useBloomFilter) {
      // Create a Bloom filter with 0.1% false positive rate
      // and capacity for hash tracking
      const bloomCapacity = (
        this.nodeType === NODE_TYPE.LIGHT ? 10000 :
        this.nodeType === NODE_TYPE.STANDARD ? 100000 :
        this.nodeType === NODE_TYPE.SUPER ? 1000000 : 100000
      );
      this.hashFilter = new SimpleBloomFilter(bloomCapacity, 0.001);
    } else {
      this.hashFilter = null;
    }
    
    // If persistence is enabled, create directory and load data
    if (this.options.enablePersistence) {
      try {
        fs.ensureDirSync(this.options.persistenceDir);
        this._loadCachedData();
      } catch (err) {
        debug(`Error initializing persistence: ${(err as Error).message}`);
      }
    }
    
    debug(`Created peer discovery manager (node type: ${this.nodeType})`);
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
   * Load cached peer discovery data from disk
   * @private
   */
  private _loadCachedData(): void {
    if (!this.options.enablePersistence) return;
    
    const peersPath = path.join(this.options.persistenceDir, 'peer-discovery-peers.json');
    const hashesPath = path.join(this.options.persistenceDir, 'peer-discovery-hashes.json');
    
    try {
      // Load peers
      if (fs.existsSync(peersPath)) {
        const peerData = fs.readJSONSync(peersPath);
        for (const [key, peer] of Object.entries<DiscoveredPeer>(peerData)) {
          this.discoveredPeers.set(key, peer);
        }
        debug(`Loaded ${this.discoveredPeers.size} peers from disk`);
      }
      
      // Load hash tracking data
      if (fs.existsSync(hashesPath)) {
        const hashData = fs.readJSONSync(hashesPath);
        
        // Add high priority hashes to the Set
        if (Array.isArray(hashData.highPriority)) {
          hashData.highPriority.forEach((hash: string) => {
            this.highPriorityHashes.add(hash);
          });
        }
        
        // Add regular hashes to the Set or Bloom filter
        if (Array.isArray(hashData.regular)) {
          if (this.hashFilter) {
            hashData.regular.forEach((hash: string) => {
              this.hashFilter.add(hash);
            });
          } else {
            hashData.regular.forEach((hash: string) => {
              this.infoHashes.add(hash);
            });
          }
        }
        
        debug(`Loaded hash data (high priority: ${this.highPriorityHashes.size}, regular: ${hashData.regular?.length || 0})`);
      }
    } catch (err) {
      debug(`Error loading cached data: ${(err as Error).message}`);
    }
  }
  
  /**
   * Save peer discovery data to disk
   * @private
   */
  private _saveCachedData(): void {
    if (!this.options.enablePersistence) return;
    
    const peersPath = path.join(this.options.persistenceDir, 'peer-discovery-peers.json');
    const hashesPath = path.join(this.options.persistenceDir, 'peer-discovery-hashes.json');
    
    try {
      // Save peers
      const peerData: Record<string, DiscoveredPeer> = {};
      for (const [key, peer] of this.discoveredPeers.entries()) {
        peerData[key] = peer;
      }
      fs.writeJSONSync(peersPath, peerData);
      
      // Save hash tracking data
      const hashData: {
        highPriority: string[];
        regular: string[];
      } = {
        highPriority: Array.from(this.highPriorityHashes),
        regular: this.hashFilter 
          ? [] // We can't serialize the Bloom filter directly
          : Array.from(this.infoHashes)
      };
      fs.writeJSONSync(hashesPath, hashData);
      
      debug('Saved peer discovery data to disk');
    } catch (err) {
      debug(`Error saving cached data: ${(err as Error).message}`);
    }
  }
  
  /**
   * Start the peer discovery manager
   */
  public async start(): Promise<void> {
    if (this.started) {
      debug('Peer discovery already started');
      return;
    }
    
    debug('Starting peer discovery manager');
    
    // Start DHT if enabled
    if (this.options.enableDHT) {
      try {
        this.dht = new DHTClient(this.options.dhtOptions);
        await this.dht.start();
        
        // Listen for peer discovery events
        this.dht.on('peer:discovered', (peer) => {
          this._handleDiscoveredPeer({
            ...peer,
            source: 'dht'
          });
        });
        
        debug('DHT started successfully');
      } catch (err) {
        debug(`Failed to start DHT: ${(err as Error).message}`);
        this.dht = null;
      }
    }
    
    // Start PEX if enabled
    if (this.options.enablePEX) {
      try {
        this.pex = new PexManager({
          ...this.options.pexOptions,
          gun: this.options.gun,
          nodeId: this.options.nodeId,
          port: this.options.announcePort
        });
        await this.pex.start();
        
        // Listen for peer discovery events
        this.pex.on('peer-discovered', (peer: DiscoveryPeer) => {
          this._handleDiscoveredPeer({
            ...peer,
            source: PEER_SOURCES.PEX,
            confidence: 0.7,
            lastSeen: Date.now()
          });
        });
        
        debug('PEX started successfully');
      } catch (err) {
        debug(`Failed to start PEX: ${(err as Error).message}`);
        this.pex = null;
      }
    }
    
    // Start local discovery if enabled
    if (this.options.enableLocal) {
      try {
        this.local = new LocalDiscovery({
          ...this.options.localOptions,
          port: this.options.announcePort,
          enableIPv6: this.options.enableIPv6
        });
        await this.local.start();
        
        // Listen for peer discovery events
        this.local.on('peer-discovered', (peer: DiscoveryPeer) => {
          this._handleDiscoveredPeer({
            ...peer,
            source: PEER_SOURCES.LOCAL,
            confidence: 0.9,
            lastSeen: Date.now()
          });
        });
        
        debug('Local discovery started successfully');
      } catch (err) {
        debug(`Failed to start local discovery: ${(err as Error).message}`);
        this.local = null;
      }
    }
    
    // Start Gun discovery if enabled
    if (this.options.enableGun) {
      try {
        // Check if we have a Gun instance
        if (!this.options.gun) {
          throw new Error('Gun instance is required for Gun discovery');
        }
        
        // Create GunDiscovery with our options
        const gunDiscoveryOptions: GunDiscoveryOptions = {
          gun: this.options.gun,
          nodeId: this.options.nodeId,
          announcePort: this.options.announcePort,
          ...this.options.gunOptions
        };
        
        this.gun = new GunDiscovery(gunDiscoveryOptions);
        await this.gun.start();
        
        // Listen for peer discovery events
        this.gun.on('peer-discovered', (peer: DiscoveryPeer) => {
          this._handleDiscoveredPeer({
            ...peer,
            source: PEER_SOURCES.GUN,
            confidence: 0.8,
            lastSeen: Date.now()
          });
        });
        
        debug('Gun discovery started successfully');
      } catch (err) {
        debug(`Failed to start Gun discovery: ${(err as Error).message}`);
        this.gun = null;
      }
    }
    
    // Set up cleanup interval
    this.cleanupInterval = setInterval(() => {
      this._cleanupPeers();
    }, 10 * 60 * 1000); // Clean up every 10 minutes
    
    // Set up save interval if persistence is enabled
    if (this.options.enablePersistence) {
      this.saveInterval = setInterval(() => {
        this._saveCachedData();
      }, 5 * 60 * 1000); // Save every 5 minutes
    }
    
    // Add all tracked hashes to discovery mechanisms
    for (const infoHash of this.highPriorityHashes) {
      await this.addInfoHash(infoHash, AnnouncePriority.HIGH);
    }
    
    if (!this.hashFilter) {
      for (const infoHash of this.infoHashes) {
        await this.addInfoHash(infoHash, AnnouncePriority.MEDIUM);
      }
    }
    
    this.started = true;
    debug('Peer discovery manager started');
  }
  
  /**
   * Stop the peer discovery manager
   */
  public async stop(): Promise<void> {
    if (!this.started) {
      return;
    }
    
    debug('Stopping peer discovery manager');
    
    // Clear intervals
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
    
    // Stop DHT if running
    if (this.dht) {
      await this.dht.stop();
      this.dht = null;
    }
    
    // Stop PEX if running
    if (this.pex) {
      await this.pex.stop();
      this.pex = null;
    }
    
    // Stop local discovery if running
    if (this.local) {
      await this.local.stop();
      this.local = null;
    }
    
    // Stop Gun discovery if running
    if (this.gun) {
      await this.gun.stop();
      this.gun = null;
    }
    
    // Save data if persistence is enabled
    if (this.options.enablePersistence) {
      await this._saveCachedData();
    }
    
    this.started = false;
    debug('Peer discovery manager stopped');
  }
  
  /**
   * Add an info hash to announce and search for
   * @param infoHash - Info hash to add
   * @param priority - Priority level for the announcement (default: medium)
   */
  public async addInfoHash(infoHash: string, priority: AnnouncePriority = AnnouncePriority.MEDIUM): Promise<void> {
    // Store based on priority
    if (priority === AnnouncePriority.HIGH) {
      // High priority hashes are always stored in memory
      this.highPriorityHashes.add(infoHash);
    } else {
      // Medium/low priority uses Bloom filter if available, otherwise Set
      if (this.hashFilter) {
        this.hashFilter.add(infoHash);
      } else {
        this.infoHashes.add(infoHash);
      }
    }
    
    if (!this.started) {
      debug(`Added info hash ${infoHash.substring(0, 6)}... (priority: ${priority}) (discovery not started)`);
      return;
    }
    
    // Announce on each available mechanism based on priority
    try {
      // High and medium priority announce to DHT
      if ((priority === AnnouncePriority.HIGH || priority === AnnouncePriority.MEDIUM) && this.dht) {
        debug(`Announcing info hash ${infoHash.substring(0, 6)}... on DHT`);
        await this.dht.announcePeer(infoHash, this.options.announcePort);
      }
      
      // All priorities announce to local discovery (cheap)
      if (this.local) {
        debug(`Announcing info hash ${infoHash.substring(0, 6)}... on local discovery`);
        this.local.addInfoHash(infoHash);
      }
      
      // High priority announces to Gun discovery
      if (priority === AnnouncePriority.HIGH && this.gun) {
        debug(`Announcing info hash ${infoHash.substring(0, 6)}... on Gun discovery`);
        this.gun.addInfoHash(infoHash);
      }
      
      debug(`Added info hash ${infoHash.substring(0, 6)}... (priority: ${priority})`);
      
    } catch (err) {
      debug(`Failed to announce info hash ${infoHash.substring(0, 6)}...: ${(err as Error).message}`);
    }
  }
  
  /**
   * Remove an info hash from announcements
   * @param infoHash - Info hash to remove
   */
  public removeInfoHash(infoHash: string): void {
    // Remove from high priority set
    this.highPriorityHashes.delete(infoHash);
    
    // Remove from regular set if not using Bloom filter
    // (Can't remove from Bloom filter)
    if (!this.hashFilter) {
      this.infoHashes.delete(infoHash);
    }
    
    if (!this.started) {
      return;
    }
    
    if (this.local) {
      this.local.removeInfoHash(infoHash);
    }
    
    if (this.gun) {
      this.gun.removeInfoHash(infoHash);
    }
    
    debug(`Removed info hash ${infoHash.substring(0, 6)}...`);

    // Emit content:removed event
    this.emit('content:removed', infoHash);
  }
  
  /**
   * Find peers for a specific info hash
   * @param infoHash - Info hash to find peers for
   * @param maxPeers - Maximum number of peers to return (default: 50)
   * @param timeout - Timeout in milliseconds (default: 5000)
   * @returns Array of discovered peers
   */
  public async findPeers(infoHash: string, maxPeers: number = 50, timeout: number = 5000): Promise<DiscoveredPeer[]> {
    if (!validatePeerId(infoHash)) {
      debug('Invalid info hash format');
      return [];
    }

    if (!this.started) {
      debug('Cannot find peers, discovery not started');
      return [];
    }
    
    // Check if we have cached peers for this info hash
    const cacheKey = `peers:${infoHash}`;
    const cachedPeers = this.peerCache.get(cacheKey);
    if (cachedPeers && cachedPeers.length > 0) {
      debug(`Found ${cachedPeers.length} cached peers for ${infoHash.substring(0, 6)}...`);
      // Return a copy to avoid mutations affecting our cache
      return cachedPeers.slice(0, maxPeers);
    }
    
    debug(`Finding peers for info hash ${infoHash.substring(0, 6)}...`);
    
    const peers: DiscoveredPeer[] = [];
    const sources: string[] = [];
    const peerKeys = new Set<string>();
    
    // Create a promise for each enabled discovery mechanism
    const promises: Promise<DiscoveredPeer[]>[] = [];
    
    // DHT search
    if (this.options.enableDHT && this.dht) {
      sources.push('dht');
      promises.push(
        this.dht.findPeers(infoHash, maxPeers)
          .then((dhtPeers) => {
            debug(`Found ${dhtPeers.length} peers via DHT for ${infoHash.substring(0, 6)}...`);
            return dhtPeers.map(dhtPeer => ({
              ...dhtPeer,
              source: PEER_SOURCES.DHT,
              confidence: 0.8,
              lastSeen: Date.now(),
              infoHash
            }));
          })
          .catch((err: Error) => {
            debug(`DHT peer search failed: ${err.message}`);
            return [] as DiscoveredPeer[];
          })
      );
    }
    
    // Local discovery search
    if (this.options.enableLocal && this.local) {
      sources.push('local');
      promises.push(
        this.local.findPeers(infoHash)
          .then((localPeers) => {
            debug(`Found ${localPeers.length} peers via local discovery for ${infoHash.substring(0, 6)}...`);
            return localPeers.map(localPeer => ({
              ...localPeer,
              source: PEER_SOURCES.LOCAL,
              confidence: 0.9,
              lastSeen: Date.now(),
              infoHash
            }));
          })
          .catch((err: Error) => {
            debug(`Local discovery search failed: ${err.message}`);
            return [] as DiscoveredPeer[];
          })
      );
    }
    
    // Gun discovery search
    if (this.options.enableGun && this.gun) {
      sources.push('gun');
      promises.push(
        this.gun.findPeers(infoHash)
          .then((gunPeers) => {
            debug(`Found ${gunPeers.length} peers via Gun for ${infoHash.substring(0, 6)}...`);
            return gunPeers.map(gunPeer => ({
              ...gunPeer,
              source: PEER_SOURCES.GUN,
              confidence: 0.8,
              lastSeen: Date.now(),
              infoHash
            }));
          })
          .catch((err: Error) => {
            debug(`Gun peer search failed: ${err.message}`);
            return [] as DiscoveredPeer[];
          })
      );
    }
    
    // Use a timeout to make sure we return results in a reasonable time
    const timeoutPromise = new Promise<DiscoveredPeer[]>((resolve) => {
      setTimeout(() => {
        debug(`Search timeout reached after ${timeout}ms for ${infoHash.substring(0, 6)}...`);
        resolve([]);
      }, timeout);
    });
    
    // Wait for all promises to resolve or timeout
    const results = await Promise.race([
      Promise.all(promises),
      timeoutPromise.then((): DiscoveredPeer[][] => promises.map((): DiscoveredPeer[] => []))
    ]);
    
    // Collect all peers and deduplicate
    for (let i = 0; i < results.length; i++) {
      const sourcePeers = results[i];
      for (const peer of sourcePeers) {
        const peerKey = this._getPeerKey(peer);
        if (!peerKeys.has(peerKey)) {
          peerKeys.add(peerKey);
          peers.push(peer);
        }
      }
    }
    
    // Sort by confidence
    peers.sort((a, b) => b.confidence - a.confidence);
    
    // Sort results by IP version preference
    const result = this._sortPeersByIPPreference(peers.slice(0, maxPeers));
    
    // Cache the results
    this.peerCache.set(cacheKey, result);
    
    debug(`Found ${result.length} total peers for ${infoHash.substring(0, 6)}... from ${sources.join(', ')}`);
    
    // Emit an event for application code to react to
    this.emit('peers-found', infoHash, result);

    // Emit content:announced when starting search
    this.emit('content:announced', infoHash);

    // Handle failed peers
    for (const sourcePeers of results) {
      for (const peer of sourcePeers) {
        if (!peer.address || !peer.port) {
          this.emit('peer-failed', peer, infoHash);
        }
      }
    }

    return result;
  }
  
  /**
   * Get all discovered peers
   * @returns Array of all discovered peers
   */
  public getAllPeers(): DiscoveredPeer[] {
    return Array.from(this.discoveredPeers.values());
  }
  
  /**
   * Get peers discovered through a specific source
   * @param source - Source to filter by (e.g., 'dht', 'pex', 'local')
   * @returns Array of peers from that source
   */
  public getPeersBySource(source: string): DiscoveredPeer[] {
    return Array.from(this.discoveredPeers.values())
      .filter(peer => peer.source === source);
  }
  
  /**
   * Get peers for a specific info hash
   * @param infoHash - Info hash to get peers for
   * @returns Array of peers with that info hash
   */
  public getPeersForInfoHash(infoHash: string): DiscoveredPeer[] {
    return Array.from(this.discoveredPeers.values())
      .filter(peer => peer.infoHash === infoHash);
  }
  
  /**
   * Add a peer to the list of connected peers (for PEX)
   * @param peer - Peer that we're connected to
   */
  public addConnectedPeer(peer: DiscoveredPeer): void {
    if (!validatePeerAddress(peer.address)) {
      debug('Invalid peer address');
      return;
    }

    // Track the peer
    this._addPeer(peer);
    
    // Add to PEX if available
    if (this.pex) {
      this.pex.addPeer(peer.id || '', peer.infoHash || '');
    }
  }
  
  /**
   * Remove a peer from the list of connected peers
   * @param peer - Peer that we've disconnected from
   */
  public removeConnectedPeer(peer: DiscoveredPeer): void {
    if (!validatePeerAddress(peer.address)) {
      debug('Invalid peer address');
      return;
    }

    // Remove from PEX if available
    if (this.pex && peer.id && peer.infoHash) {
      this.pex.removePeer(peer.id, peer.infoHash);
      // Emit peer-removed event
      this.emit('peer-removed', peer.id, peer.infoHash);
    }
  }
  
  /**
   * Add a peer to our tracked peers
   * @private
   * @param peer - Peer to add
   */
  private _addPeer(peer: DiscoveredPeer): void {
    // Skip if we're at max capacity and this is a low-confidence peer
    if (this.discoveredPeers.size >= this.options.maxPeers && peer.confidence < 0.7) {
      return;
    }

    // Validate peer data
    if (!validatePeerAddress(peer.address)) {
      debug(`Invalid peer address: ${peer.address}`);
      return;
    }

    if (peer.id && !validatePeerId(peer.id)) {
      debug(`Invalid peer ID: ${peer.id}`);
      return;
    }

    // Get preferred IP configuration
    const preferredIPs = getPreferredIPs({
      enableIPv6: this.options.enableIPv6,
      preferIPv6: true,
      includeInternal: false,
      includePrivate: true // Allow private IPs for local peers
    });

    // Use the best available IP based on preferences
    const bestIP = this.options.enableIPv6 && preferredIPs.ipv6 ? preferredIPs.ipv6 : preferredIPs.ipv4;
    if (!bestIP) {
      debug('No valid IP address available for peer');
      return;
    }

    const peerWithPreferredIP = {
      ...peer,
      address: bestIP
    };

    const peerKey = this._getPeerKey(peerWithPreferredIP);
    const existingPeer = this.discoveredPeers.get(peerKey);
    
    if (existingPeer) {
      // Update existing peer
      existingPeer.lastSeen = Date.now();
      // Take the higher confidence value
      existingPeer.confidence = Math.max(existingPeer.confidence, peer.confidence);
      // Update info hash if it wasn't known before
      if (peer.infoHash && !existingPeer.infoHash) {
        existingPeer.infoHash = peer.infoHash;
      }
      // Merge additional data if any
      if (peer.additionalData) {
        existingPeer.additionalData = {
          ...existingPeer.additionalData,
          ...peer.additionalData
        };
      }
      
      this.discoveredPeers.set(peerKey, existingPeer);
      
      // Also add to cache if we have an info hash
      if (peer.infoHash) {
        this._addPeerToCache(existingPeer);
      }
      
      this.emit('peer-updated', existingPeer);
    } else {
      // Add new peer with preferred IP
      this.discoveredPeers.set(peerKey, peerWithPreferredIP);
      
      // Add to cache if we have an info hash
      if (peer.infoHash) {
        this._addPeerToCache(peerWithPreferredIP);
      }
      
      // If we're over capacity, remove the oldest peer
      if (this.discoveredPeers.size > this.options.maxPeers) {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;
        
        for (const [key, p] of this.discoveredPeers.entries()) {
          if (p.lastSeen && p.lastSeen < oldestTime) {
            oldestTime = p.lastSeen;
            oldestKey = key;
          }
        }
        
        if (oldestKey) {
          this.discoveredPeers.delete(oldestKey);
        }
      }
      
      this.emit('peer-discovered', peerWithPreferredIP);
    }
  }
  
  /**
   * Get a unique key for a peer
   * @private
   * @param peer - Peer to get key for
   * @returns Unique key for the peer
   */
  private _getPeerKey(peer: Pick<DiscoveredPeer, 'address' | 'port' | 'source'>): string {
    return `${peer.source}:${peer.address}:${peer.port}`;
  }
  
  /**
   * Add a peer to the cache for fast lookup
   * @param peer - Peer to add to cache
   * @private
   */
  private _addPeerToCache(peer: DiscoveredPeer): void {
    if (!peer.infoHash) return;
    
    const cacheKey = `peers:${peer.infoHash}`;
    let cachedPeers = this.peerCache.get(cacheKey) || [];
    
    // Check if peer already exists
    const peerExists = cachedPeers.some(p => 
      p.address === peer.address && p.port === peer.port
    );
    
    if (!peerExists) {
      cachedPeers = [...cachedPeers, peer];
      
      // Sort by confidence
      cachedPeers.sort((a, b) => b.confidence - a.confidence);
      
      // Limit the number of peers per hash based on node type
      const maxPeersPerHash = (
        this.nodeType === NODE_TYPE.LIGHT ? 20 :
        this.nodeType === NODE_TYPE.STANDARD ? 50 :
        this.nodeType === NODE_TYPE.SUPER ? 200 : 50
      );
      
      if (cachedPeers.length > maxPeersPerHash) {
        cachedPeers = cachedPeers.slice(0, maxPeersPerHash);
      }
      
      this.peerCache.set(cacheKey, cachedPeers);
    }
  }
  
  /**
   * Cleanup old peers
   * @private
   */
  private _cleanupPeers(): void {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes
    let count = 0;
    
    for (const [key, peer] of this.discoveredPeers.entries()) {
      if (peer.lastSeen && now - peer.lastSeen > maxAge) {
        this.discoveredPeers.delete(key);
        if (peer.id && peer.infoHash) {
          // Emit peer-removed event
          this.emit('peer-removed', peer.id, peer.infoHash);
        }
        count++;
      }
    }
    
    if (count > 0) {
      debug(`Cleaned up ${count} old peers`);
    }
  }

  /**
   * Add a manual peer to the discovery manager
   * This allows directly specifying a peer without relying on discovery
   * 
   * @param peerId - The unique identifier of the peer
   * @param address - The IP address of the peer
   * @param port - The port number the peer is listening on
   * @param infoHash - Optional info hash that this peer has (if known)
   * @returns The added peer information
   */
  public addManualPeer(peerId: string, address: string, port: number, infoHash?: string): DiscoveredPeer {
    const peer: DiscoveredPeer = {
      id: peerId,
      address,
      port,
      source: 'manual',
      lastSeen: Date.now(),
      confidence: 1.0 // High confidence since it's manually added
    };
    
    // Store the peer in our discovered peers map
    this.discoveredPeers.set(peerId, peer);
    
    // If an info hash was provided, associate this peer with that content
    if (infoHash) {
      if (!this.infoHashes.has(infoHash)) {
        this.infoHashes.add(infoHash);
      }
      
      // Add to the announcement tracking if needed
      this.hashFilter?.add(infoHash);
      
      // Associate this peer with the info hash
      if (!this.peersByInfoHash.has(infoHash)) {
        this.peersByInfoHash.set(infoHash, new Map());
      }
      this.peersByInfoHash.get(infoHash)?.set(peerId, peer);
    }
    
    // Emit the event for any listeners
    this.emit('peer-discovered', peer);
    
    return peer;
  }

  /**
   * Add a mapping between content ID and SHA-256 hash
   * @param contentId - Content identifier
   * @param sha256 - SHA-256 hash for verification
   */
  public addContentMapping(contentId: string, sha256: string): void {
    this.contentHashMap.set(contentId, sha256);
    debug(`Added content mapping: ${contentId} -> ${sha256}`);
  }
  
  /**
   * Get SHA-256 hash for a content ID
   * @param contentId - Content identifier
   * @returns SHA-256 hash or undefined if not found
   */
  public getHashForContent(contentId: string): string | undefined {
    return this.contentHashMap.get(contentId);
  }
  
  /**
   * Get content ID for a SHA-256 hash (reverse lookup)
   * @param sha256 - SHA-256 hash
   * @returns Content ID or undefined if not found
   */
  public getContentForHash(sha256: string): string | undefined {
    // Iterate through the map to find a matching hash
    for (const [contentId, hash] of this.contentHashMap.entries()) {
      if (hash === sha256) {
        return contentId;
      }
    }
    return undefined;
  }

  /**
   * Handle a discovered peer from any source
   * @param peer - The discovered peer
   * @private
   */
  private _handleDiscoveredPeer(peer: DiscoveredPeer): void {
    if (!peer.address || !peer.port) {
      debug('Ignoring peer with missing address or port');
      if (peer.infoHash) {
        this.emit('peer-failed', peer, peer.infoHash);
      }
      return;
    }

    if (!validatePeerAddress(peer.address)) {
      debug(`Invalid peer address: ${peer.address}`);
      if (peer.infoHash) {
        this.emit('peer-failed', peer, peer.infoHash);
      }
      return;
    }

    if (peer.id && !validatePeerId(peer.id)) {
      debug(`Invalid peer ID: ${peer.id}`);
      if (peer.infoHash) {
        this.emit('peer-failed', peer, peer.infoHash);
      }
      return;
    }
    
    // Generate a unique key for this peer
    const peerKey = this._getPeerKey(peer);
    
    // Check if we already know this peer
    const existingPeer = this.discoveredPeers.get(peerKey);
    
    if (existingPeer) {
      // Update the last seen timestamp
      existingPeer.lastSeen = Date.now();
      
      // Update confidence if the new confidence is higher
      if (peer.confidence && peer.confidence > existingPeer.confidence) {
        existingPeer.confidence = peer.confidence;
      }
      
      // Add to cache if we have an info hash
      if (peer.infoHash) {
        this._addPeerToCache(peer);
        // Emit peer-added event
        this.emit('peer-added', existingPeer, peer.infoHash);
      }
      
      // Emit status change if applicable
      if (peer.infoHash) {
        this.emit('peer-statusChanged', {
          peerId: existingPeer.id || peerKey,
          infoHash: peer.infoHash,
          previousStatus: PeerContentStatus.UNAVAILABLE,
          status: PeerContentStatus.AVAILABLE
        });
      }
      
      // Emit verification needed if confidence is high
      if (peer.confidence > 0.8 && peer.infoHash) {
        this.emit('verification:needed', existingPeer.id || peerKey, peer.infoHash);
      }
      
    } else {
      // This is a new peer, add it
      this.discoveredPeers.set(peerKey, peer);
      
      // Add to cache if we have an info hash
      if (peer.infoHash) {
        this._addPeerToCache(peer);
        // Emit peer-discovered event
        this.emit('peer-discovered', peer);
        // Emit peer-added event
        this.emit('peer-added', peer, peer.infoHash);
      } else {
        // Just emit peer-discovered if no info hash
        this.emit('peer-discovered', peer);
      }
      
      debug(`Discovered new peer: ${peer.address}:${peer.port} (source: ${peer.source})`);
    }
  }

  /**
   * Sort peers by IP version preference (IPv6 > IPv4)
   * @param peers - Array of peers to sort
   * @returns Sorted array with preferred IPs first
   */
  private _sortPeersByIPPreference(peers: DiscoveredPeer[]): DiscoveredPeer[] {
    // Group peers by address family
    const peersByAddress = new Map<string, DiscoveredPeer[]>();
    
    for (const peer of peers) {
      if (!validatePeerAddress(peer.address)) {
        debug(`Invalid peer address: ${peer.address}`);
        continue;
      }

      // Get preferred IPs with IPv6 preference
      const preferredIPs = getPreferredIPs({
        enableIPv6: this.options.enableIPv6,
        preferIPv6: true,
        includeInternal: false,
        includePrivate: true // Allow private IPs for local peers
      });
      
      // Try IPv6 first, then fall back to IPv4
      let bestIP = this.options.enableIPv6 && preferredIPs.ipv6 ? preferredIPs.ipv6 : null;
      if (!bestIP) {
        bestIP = preferredIPs.ipv4;
        if (!bestIP) {
          debug(`No valid IP address available for peer ${peer.address}`);
          continue;
        }
      }
      
      const peerWithPreferredIP = {
        ...peer,
        address: bestIP
      };
      
      const group = peersByAddress.get(bestIP) || [];
      group.push(peerWithPreferredIP);
      peersByAddress.set(bestIP, group);
    }
    
    // Flatten and sort by IP preference
    return Array.from(peersByAddress.values())
      .flat()
      .sort((a, b) => {
        const isIPv6A = a.address.includes(':');
        const isIPv6B = b.address.includes(':');
        
        // Always prefer IPv6 if enabled
        if (this.options.enableIPv6) {
          if (isIPv6A && !isIPv6B) return -1;
          if (!isIPv6A && isIPv6B) return 1;
        }
        
        // If same IP version, sort by:
        // 1. Confidence
        // 2. Last seen (more recent first)
        if (a.confidence !== b.confidence) {
          return b.confidence - a.confidence;
        }
        
        if (a.lastSeen && b.lastSeen) {
          return b.lastSeen - a.lastSeen;
        }
        
        return 0;
      });
  }

  /**
   * Add event listener
   */
  public on<E extends keyof DiscoveryEvents>(
    event: E,
    listener: (...args: DiscoveryEvents[E]) => void
  ): this {
    return super.on(event, listener);
  }

  /**
   * Remove event listener
   */
  public off<E extends keyof DiscoveryEvents>(
    event: E,
    listener: (...args: DiscoveryEvents[E]) => void
  ): this {
    return super.off(event, listener);
  }
}

// Update LocalDiscovery method interface
/**
 * Extension to LocalDiscovery class interface
 */
declare module './local-discovery' {
  interface LocalDiscovery {
    /**
     * Get peers for a specific info hash
     * @param infoHash - Info hash to find peers for
     * @returns Promise<DiscoveryPeer[]> Array of peers with this info hash
     */
    findPeers(infoHash: string): Promise<DiscoveryPeer[]>;
    
    /**
     * Start the local discovery process
     * @param port - Optional port to announce
     */
    start(): Promise<void>;
  }
}

/**
 * Re-export types for backward compatibility
 */
export { NODE_TYPE, AnnouncePriority };
export type { DiscoveredPeer, PeerDiscoveryOptions, BloomFilter };

export default PeerDiscoveryManager; 
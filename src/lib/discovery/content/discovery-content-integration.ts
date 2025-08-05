/**
 * Discovery-Content Integration Module
 * 
 * This module integrates the ContentAvailabilityManager with peer discovery systems 
 * (DHT, PEX, and Gun.js) to ensure consistent content availability information across 
 * all discovery mechanisms.
 */

import Debug from 'debug';
import { EventEmitter } from 'events';
import { ContentAvailabilityManager } from './content-availability-manager';
import type { ContentAvailabilityOptions } from './content-availability-manager';
import { PeerContentStatus } from '../../../types/common';
import type { 
  DHTClient,
  PEXManager,
  GunDiscovery,
  DiscoveryPeer,
  PeerVerificationCallback
} from '../../../types/discovery';
import { isIPv6, isIP } from 'net';

const debug = Debug('dig:discovery-content-integration');

/**
 * Integration configuration interface
 */
export interface DiscoveryContentIntegrationOptions extends ContentAvailabilityOptions {
  // Additional configuration for integration
  verificationTimeout?: number; // Timeout for peer verification (ms)
  verificationRetryDelay?: number; // Delay between verification attempts (ms)
  enableDHTIntegration?: boolean; // Whether to integrate with DHT
  enablePEXIntegration?: boolean; // Whether to integrate with PEX
  enableGunIntegration?: boolean; // Whether to integrate with Gun.js
  preferIPv6?: boolean; // Whether to prefer IPv6 over IPv4 (default: true)
  maxVerificationAttempts?: number; // Maximum number of verification attempts per peer
  maxQueueSize?: number; // Maximum size of verification queue
  securityLevel?: 'low' | 'medium' | 'high'; // Security level for verification checks
}

/**
 * Result of a content verification attempt
 */
export interface VerificationResult {
  peerId: string;
  infoHash: string;
  hasContent: boolean;
  timestamp: number;
  responseTime?: number; // Time taken to verify (ms)
  error?: string; // Error message if verification failed
  attempts?: number; // Number of verification attempts made
  securityChecks?: { // Results of security checks
    addressValid: boolean;
    portValid: boolean;
    hashValid: boolean;
    peerIdValid: boolean;
  };
}

/**
 * Integrates ContentAvailabilityManager with peer discovery systems
 */
export class DiscoveryContentIntegration extends EventEmitter {
  private contentManager: ContentAvailabilityManager;
  private options: DiscoveryContentIntegrationOptions;
  private dhtClient?: DHTClient;
  private pexManager?: PEXManager;
  private gunDiscovery?: GunDiscovery;
  private verificationQueue: Array<{ peerId: string, infoHash: string }> = [];
  private isVerifying = false;
  private verificationCallbacks: Map<string, PeerVerificationCallback> = new Map();
  private verificationAttempts: Map<string, number> = new Map();
  
  /**
   * Creates a new DiscoveryContentIntegration
   * 
   * @param options Configuration options
   */
  constructor(options: DiscoveryContentIntegrationOptions) {
    super();
    
    this.options = {
      ...options,
      verificationTimeout: options.verificationTimeout || 10000, // 10 seconds
      verificationRetryDelay: options.verificationRetryDelay || 30000, // 30 seconds
      enableDHTIntegration: options.enableDHTIntegration !== false,
      enablePEXIntegration: options.enablePEXIntegration !== false,
      enableGunIntegration: options.enableGunIntegration !== false,
      preferIPv6: options.preferIPv6 !== false, // Default to true
      maxVerificationAttempts: options.maxVerificationAttempts || 3, // Default to 3
      maxQueueSize: options.maxQueueSize || 1000, // Default to 1000
      securityLevel: options.securityLevel || 'medium' // Default to medium
    };
    
    // Create content availability manager
    this.contentManager = new ContentAvailabilityManager(options);
    
    debug(`Created DiscoveryContentIntegration with nodeId: ${options.nodeId}`);
  }
  
  /**
   * Starts the integration
   */
  public async start(): Promise<void> {
    debug('Starting DiscoveryContentIntegration');
    
    // Start content availability manager
    await this.contentManager.start();
    
    // Set up event listeners
    this._setupEventListeners();
    
    debug('DiscoveryContentIntegration started');
  }
  
  /**
   * Stops the integration
   */
  public async stop(): Promise<void> {
    debug('Stopping DiscoveryContentIntegration');
    
    // Stop content availability manager
    await this.contentManager.stop();
    
    debug('DiscoveryContentIntegration stopped');
  }
  
  /**
   * Registers a DHT client for integration
   * 
   * @param dhtClient DHT client instance
   */
  public registerDHTClient(dhtClient: DHTClient): void {
    if (!this.options.enableDHTIntegration) {
      return;
    }
    
    this.dhtClient = dhtClient;
    debug('Registered DHT client');
    
    // Hook into DHT events
    dhtClient.on('peer-discovered', (peer: DiscoveryPeer) => {
      // Perform security checks
      const securityChecks = this._performSecurityChecks(peer, peer.infoHashes?.[0] || '');
      
      // Log security check results
      debug(`DHT peer security checks for ${peer.id || peer.address}:${peer.port}:`, securityChecks);
      
      // Skip peer if it fails security checks based on security level
      if (this.options.securityLevel === 'high' && (!securityChecks.addressValid || !securityChecks.portValid)) {
        debug(`DHT peer ${peer.id || peer.address}:${peer.port} failed high security checks`);
        return;
      }
      
      if (this.options.securityLevel === 'medium' && (!securityChecks.addressValid || !securityChecks.portValid || !securityChecks.peerIdValid)) {
        debug(`DHT peer ${peer.id || peer.address}:${peer.port} failed medium security checks`);
        return;
      }
      
      debug(`DHT discovered peer: ${peer.id || peer.address}:${peer.port}`);
    });
    
    // Listen for peer failures
    dhtClient.on('peer-failed', (peer: DiscoveryPeer, infoHash: string) => {
      if (peer && peer.id && infoHash) {
        debug(`DHT peer failed: ${peer.id} for hash ${infoHash}`);
        this.reportContentUnavailable(peer.id, infoHash);
      }
    });
  }
  
  /**
   * Registers a PEX manager for integration
   * 
   * @param pexManager PEX manager instance
   */
  public registerPEXManager(pexManager: PEXManager): void {
    if (!this.options.enablePEXIntegration) {
      return;
    }
    
    this.pexManager = pexManager;
    debug('Registered PEX manager');
    
    // Hook into PEX events
    pexManager.on('peer-added', (peer: DiscoveryPeer, infoHash: string) => {
      // Perform security checks
      const securityChecks = this._performSecurityChecks(peer, infoHash);
      
      // Log security check results
      debug(`PEX peer security checks for ${peer.id || peer.address}:${peer.port}:`, securityChecks);
      
      // Skip peer if it fails security checks based on security level
      if (this.options.securityLevel === 'high' && (!securityChecks.addressValid || !securityChecks.portValid)) {
        debug(`PEX peer ${peer.id || peer.address}:${peer.port} failed high security checks`);
        return;
      }
      
      if (this.options.securityLevel === 'medium' && (!securityChecks.addressValid || !securityChecks.portValid || !securityChecks.peerIdValid)) {
        debug(`PEX peer ${peer.id || peer.address}:${peer.port} failed medium security checks`);
        return;
      }
      
      debug(`PEX added peer: ${peer.id || peer.address}:${peer.port} for hash ${infoHash}`);
    });
    
    // Listen for peer removals
    pexManager.on('peer-removed', (peerId: string, infoHash: string) => {
      if (peerId && infoHash) {
        debug(`PEX removed peer: ${peerId} for hash ${infoHash}`);
        this.reportContentUnavailable(peerId, infoHash);
      }
    });
  }
  
  /**
   * Registers a Gun discovery instance for integration
   * 
   * @param gunDiscovery Gun discovery instance
   */
  public registerGunDiscovery(gunDiscovery: GunDiscovery): void {
    if (!this.options.enableGunIntegration) {
      return;
    }
    
    this.gunDiscovery = gunDiscovery;
    debug('Registered Gun discovery');
    
    // Set the gun instance for content manager if not already set
    if (gunDiscovery && gunDiscovery.gun && !this.contentManager['gun']) {
      this.contentManager['gun'] = gunDiscovery.gun;
    }
    
    // Hook into Gun discovery events
    gunDiscovery.on('peer-discovered', (peer: DiscoveryPeer) => {
      // Perform security checks
      const securityChecks = this._performSecurityChecks(peer, peer.infoHashes?.[0] || '');
      
      // Log security check results
      debug(`Gun peer security checks for ${peer.id || peer.address}:${peer.port}:`, securityChecks);
      
      // Skip peer if it fails security checks based on security level
      if (this.options.securityLevel === 'high' && (!securityChecks.addressValid || !securityChecks.portValid)) {
        debug(`Gun peer ${peer.id || peer.address}:${peer.port} failed high security checks`);
        return;
      }
      
      if (this.options.securityLevel === 'medium' && (!securityChecks.addressValid || !securityChecks.portValid || !securityChecks.peerIdValid)) {
        debug(`Gun peer ${peer.id || peer.address}:${peer.port} failed medium security checks`);
        return;
      }
      
      debug(`Gun discovered peer: ${peer.id || peer.address}:${peer.port}`);
    });
  }
  
  /**
   * Registers a verification callback for a specific content hash
   * 
   * @param infoHash The hash to register the callback for
   * @param callback Function to verify if a peer has the content
   */
  public registerVerificationCallback(
    infoHash: string,
    callback: PeerVerificationCallback
  ): void {
    this.verificationCallbacks.set(infoHash, callback);
    debug(`Registered verification callback for hash ${infoHash}`);
  }
  
  /**
   * Announces that local node has content available
   * (Proxy to ContentAvailabilityManager with integrated broadcasting)
   * 
   * @param infoHash The hash of the content
   * @param options Optional announcement options
   */
  public announceContentAvailable(
    infoHash: string, 
    options?: { 
      port?: number, 
      contentId?: string,
      ttl?: number 
    }
  ): void {
    // Use the content manager to announce
    this.contentManager.announceContentAvailable(infoHash, options);
    
    // Propagate to discovery mechanisms
    this._propagateContentAvailable(infoHash, options);
  }
  
  /**
   * Announces that local node no longer has content available
   * (Proxy to ContentAvailabilityManager with integrated broadcasting)
   * 
   * @param infoHash The hash of the content
   * @param contentId Optional content ID to remove mapping
   */
  public announceContentUnavailable(infoHash: string, contentId?: string): void {
    // Use the content manager to announce unavailability
    this.contentManager.announceContentUnavailable(infoHash, contentId);
    
    // Propagate to discovery mechanisms
    this._propagateContentUnavailable(infoHash);
  }
  
  /**
   * Reports that a peer does not have content it claimed to have
   * (Proxy to ContentAvailabilityManager with verification)
   * 
   * @param peerId The ID of the peer
   * @param infoHash The hash of the content
   * @param reporterNodeId The node ID of the reporter (defaults to local node)
   */
  public reportContentUnavailable(peerId: string, infoHash: string, reporterNodeId?: string): void {
    // First report to the content manager
    this.contentManager.reportContentUnavailable(peerId, infoHash, reporterNodeId);
    
    // Queue verification if we have a callback for this hash
    if (this.verificationCallbacks.has(infoHash)) {
      this._queueVerification(peerId, infoHash);
    }
  }
  
  /**
   * Gets peer content status
   * (Proxy to ContentAvailabilityManager)
   * 
   * @param peerId The ID of the peer
   * @param infoHash The hash of the content
   * @returns Content status for this peer
   */
  public getPeerContentStatus(peerId: string, infoHash: string): PeerContentStatus {
    return this.contentManager.getPeerContentStatus(peerId, infoHash);
  }
  
  /**
   * Determines if a peer should be considered for content
   * (Proxy to ContentAvailabilityManager)
   * 
   * @param peerId The ID of the peer
   * @param infoHash The hash of the content
   * @returns True if the peer should be considered, false otherwise
   */
  public shouldConsiderPeerForContent(peerId: string, infoHash: string): boolean {
    return this.contentManager.shouldConsiderPeerForContent(peerId, infoHash);
  }
  
  /**
   * Filters a list of peers based on their content status
   * 
   * @param peers Array of peers to filter
   * @param infoHash Hash to check availability for
   * @returns Filtered list of peers that likely have the content
   */
  public filterPeersByContentStatus<T extends { id: string }>(peers: T[], infoHash: string): T[] {
    return peers.filter(peer => this.shouldConsiderPeerForContent(peer.id, infoHash));
  }
  
  /**
   * Resets reports for a peer after successful content retrieval
   * (Proxy to ContentAvailabilityManager)
   * 
   * @param peerId The ID of the peer
   * @param infoHash The hash of the content
   */
  public resetPeerReports(peerId: string, infoHash: string): void {
    this.contentManager.resetPeerReports(peerId, infoHash);
  }
  
  /**
   * Updates peer reputation based on content availability
   * (Proxy to ContentAvailabilityManager)
   * 
   * @param peerId The ID of the peer
   * @param successful Whether the interaction was successful
   */
  public updatePeerReputation(peerId: string, successful: boolean): void {
    this.contentManager.updatePeerReputation(peerId, successful);
  }
  
  /**
   * Gets the hash for a content ID if it exists
   * (Proxy to ContentAvailabilityManager)
   * 
   * @param contentId The content ID
   * @returns The info hash, or undefined if not found
   */
  public getHashForContent(contentId: string): string | undefined {
    return this.contentManager.getHashForContent(contentId);
  }
  
  /**
   * Handles the result of a content verification attempt
   * 
   * @param peerId The ID of the peer
   * @param infoHash The hash of the content
   * @param hasContent Whether the peer has the content
   */
  public handleVerificationResult(peerId: string, infoHash: string, hasContent: boolean): void {
    debug(`Verification result: peer=${peerId}, infoHash=${infoHash}, hasContent=${hasContent}`);
    
    // Reset verification attempts regardless of result
    // This ensures we start fresh for next verification cycle
    this._resetVerificationAttempts(peerId, infoHash);
    
    if (hasContent) {
        // Content is actually available, reset reports
        this.resetPeerReports(peerId, infoHash);
        this.updatePeerReputation(peerId, true);
        
        // Emit status change event
        this.emit('peer-statusChanged', {
            peerId,
            infoHash,
            previousStatus: this.getPeerContentStatus(peerId, infoHash),
            status: PeerContentStatus.AVAILABLE
        });
    } else {
        // Content is unavailable, update reputation and report
        this.updatePeerReputation(peerId, false);
        
        // Report content as unavailable
        this.reportContentUnavailable(peerId, infoHash);
        
        // If max verification attempts reached, emit status change
        const maxAttempts = this.options.maxVerificationAttempts || 3;
        const attempts = this.verificationAttempts.get(`${peerId}:${infoHash}`) || 0;
        
        if (attempts >= maxAttempts) {
            this.emit('peer-statusChanged', {
                peerId,
                infoHash,
                previousStatus: this.getPeerContentStatus(peerId, infoHash),
                status: PeerContentStatus.UNAVAILABLE
            });
        }
    }
  }
  
  // Private methods
  
  /**
   * Sets up event listeners for the content manager
   */
  private _setupEventListeners(): void {
    // Listen for content status changes
    this.contentManager.on('peer-statusChanged', (data: any) => {
      debug(`Peer ${data.peerId} status for hash ${data.infoHash} changed: ${data.previousStatus} -> ${data.status}`);
      
      // Forward the event
      this.emit('peer-statusChanged', data);
      
      // If status changed to UNAVAILABLE, propagate to discovery mechanisms
      if (data.status === PeerContentStatus.UNAVAILABLE) {
        this._propagatePeerUnavailable(data.peerId, data.infoHash);
      }
    });
    
    // Listen for content announcements
    this.contentManager.on('content-announced', (infoHash: string) => {
      debug(`Content announced: ${infoHash}`);
      this.emit('content-announced', infoHash);
    });
    
    // Listen for content removals
    this.contentManager.on('content-removed', (infoHash: string) => {
      debug(`Content removed: ${infoHash}`);
      this.emit('content-removed', infoHash);
    });
  }
  
  /**
   * Validates a peer address
   * 
   * @param address The peer address to validate
   * @param port The peer port to validate
   * @returns True if the address is valid, false otherwise
   */
  private _validatePeerAddress(address: string, port?: number): boolean {
    // Check if address is valid IP
    const ipVersion = isIP(address);
    if (!ipVersion) {
      debug(`Invalid IP address: ${address}`);
      return false;
    }

    // Check IPv6 preference
    const isAddressIPv6 = isIPv6(address);
    if (this.options.preferIPv6 && !isAddressIPv6) {
      debug(`Non-IPv6 address when IPv6 preferred: ${address}`);
      return false;
    }

    // Validate port if provided
    if (port !== undefined) {
      if (port < 1 || port > 65535) {
        debug(`Invalid port number: ${port}`);
        return false;
      }
    }

    return true;
  }
  
  /**
   * Validates a peer ID
   * 
   * @param peerId The peer ID to validate
   * @returns True if the peer ID is valid, false otherwise
   */
  private _validatePeerId(peerId: string): boolean {
    // Check if peer ID is valid hex string
    const hexRegex = /^[0-9a-fA-F]{40}$/;
    if (!hexRegex.test(peerId)) {
      debug(`Invalid peer ID format: ${peerId}`);
      return false;
    }

    return true;
  }
  
  /**
   * Validates an info hash
   * 
   * @param infoHash The info hash to validate
   * @returns True if the info hash is valid, false otherwise
   */
  private _validateInfoHash(infoHash: string): boolean {
    // Check if info hash is valid SHA-1 or SHA-256
    const validLengths = [40, 64]; // SHA-1 and SHA-256 lengths
    if (!validLengths.includes(infoHash.length)) {
      debug(`Invalid info hash length: ${infoHash.length}`);
      return false;
    }

    // Check if info hash is valid hex string
    const hexRegex = /^[0-9a-fA-F]+$/;
    if (!hexRegex.test(infoHash)) {
      debug(`Invalid info hash format: ${infoHash}`);
      return false;
    }

    return true;
  }
  
  /**
   * Performs security checks on a peer
   * 
   * @param peer The peer to check
   * @param infoHash The info hash to validate
   * @returns Results of security checks
   */
  private _performSecurityChecks(peer: DiscoveryPeer, infoHash: string): VerificationResult['securityChecks'] {
    const addressValid = this._validatePeerAddress(peer.address, peer.port);
    const portValid = peer.port !== undefined && peer.port >= 1 && peer.port <= 65535;
    const hashValid = this._validateInfoHash(infoHash);
    const peerIdValid = peer.id ? this._validatePeerId(peer.id) : false;

    return {
      addressValid,
      portValid,
      hashValid,
      peerIdValid
    };
  }
  
  /**
   * Queues a peer for content verification with security checks
   * 
   * @param peerId The ID of the peer
   * @param infoHash The hash of the content
   */
  private _queueVerification(peerId: string, infoHash: string): void {
    // Validate inputs
    if (!this._validatePeerId(peerId) || !this._validateInfoHash(infoHash)) {
        debug(`Invalid peer ID or info hash, skipping verification`);
        return;
    }

    // Check queue size
    if (this.verificationQueue.length >= (this.options.maxQueueSize || 1000)) {
        debug(`Verification queue full, skipping verification`);
        return;
    }

    // Get current attempts for this peer/hash combination
    const key = `${peerId}:${infoHash}`;
    const attempts = this.verificationAttempts.get(key) || 0;

    // Check if we've exceeded max attempts
    if (attempts >= (this.options.maxVerificationAttempts || 3)) {
        debug(`Max verification attempts reached for ${key}`);
        return;
    }

    // Add to verification queue
    this.verificationQueue.push({ peerId, infoHash });
    debug(`Queued verification for peer: ${peerId} for hash ${infoHash}`);

    // Start processing queue if not already processing
    if (!this.isVerifying) {
        this._processVerificationQueue();
    }
  }

  /**
   * Processes the verification queue
   */
  private async _processVerificationQueue(): Promise<void> {
    if (this.isVerifying || this.verificationQueue.length === 0) {
        return;
    }

    this.isVerifying = true;
    debug('Started processing verification queue');

    try {
        while (this.verificationQueue.length > 0) {
            const { peerId, infoHash } = this.verificationQueue.shift()!;
            const key = `${peerId}:${infoHash}`;
            
            // Update attempt count
            const attempts = (this.verificationAttempts.get(key) || 0) + 1;
            this.verificationAttempts.set(key, attempts);
            
            debug(`Processing verification for ${key} (attempt ${attempts})`);

            // Emit verification needed event
            this.emit('verification:needed', peerId, infoHash);

            // Wait for a short delay before processing next item
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    } catch (err) {
        debug(`Error processing verification queue: ${(err as Error).message}`);
    } finally {
        this.isVerifying = false;
        debug('Finished processing verification queue');
    }
  }

  /**
   * Resets verification attempts for a peer/hash combination
   * 
   * @param peerId The ID of the peer
   * @param infoHash The hash of the content
   */
  private _resetVerificationAttempts(peerId: string, infoHash: string): void {
    const key = `${peerId}:${infoHash}`;
    this.verificationAttempts.delete(key);
    debug(`Reset verification attempts for ${key}`);
  }

  /**
   * Propagates content availability to discovery mechanisms
   * 
   * @param infoHash The hash of the content
   * @param options Optional announcement options
   */
  private _propagateContentAvailable(
    infoHash: string, 
    options?: { 
      port?: number, 
      contentId?: string 
    }
  ): void {
    // Validate info hash
    if (!this._validateInfoHash(infoHash)) {
      debug(`Invalid info hash format: ${infoHash}`);
      return;
    }

    // Propagate to DHT
    if (this.dhtClient && typeof this.dhtClient.addInfoHash === 'function') {
      this.dhtClient.addInfoHash(infoHash);
      debug(`Propagated content availability to DHT: ${infoHash}`);
    }
    
    // Propagate to PEX
    if (this.pexManager && typeof this.pexManager.addInfoHash === 'function') {
      this.pexManager.addInfoHash(infoHash);
      debug(`Propagated content availability to PEX: ${infoHash}`);
    }
    
    // Propagate to Gun Discovery
    if (this.gunDiscovery && typeof this.gunDiscovery.addInfoHash === 'function') {
      this.gunDiscovery.addInfoHash(infoHash);
      
      // Also add content mapping if provided
      if (options?.contentId && typeof this.gunDiscovery.addContentMapping === 'function') {
        // Validate content ID
        if (options.contentId.length > 0 && options.contentId.length <= 256) {
          this.gunDiscovery.addContentMapping(options.contentId, infoHash);
        } else {
          debug(`Invalid content ID length: ${options.contentId}`);
        }
      }
      
      debug(`Propagated content availability to Gun: ${infoHash}`);
    }
  }

  /**
   * Propagates content unavailability to discovery mechanisms
   * 
   * @param infoHash The hash of the content
   */
  private _propagateContentUnavailable(infoHash: string): void {
    // Validate info hash
    if (!this._validateInfoHash(infoHash)) {
      debug(`Invalid info hash format: ${infoHash}`);
      return;
    }

    // Propagate to DHT
    if (this.dhtClient && typeof this.dhtClient.removeInfoHash === 'function') {
      this.dhtClient.removeInfoHash(infoHash);
      debug(`Propagated content unavailability to DHT: ${infoHash}`);
    }
    
    // Propagate to PEX
    if (this.pexManager && typeof this.pexManager.removeInfoHash === 'function') {
      this.pexManager.removeInfoHash(infoHash);
      debug(`Propagated content unavailability to PEX: ${infoHash}`);
    }
    
    // Propagate to Gun Discovery
    if (this.gunDiscovery && typeof this.gunDiscovery.removeInfoHash === 'function') {
      this.gunDiscovery.removeInfoHash(infoHash);
      debug(`Propagated content unavailability to Gun: ${infoHash}`);
    }
  }

  /**
   * Propagates peer unavailability to discovery mechanisms
   * 
   * @param peerId The ID of the peer
   * @param infoHash The hash of the content
   */
  private _propagatePeerUnavailable(peerId: string, infoHash: string): void {
    // Validate inputs
    if (!this._validatePeerId(peerId) || !this._validateInfoHash(infoHash)) {
      debug(`Invalid peer ID or info hash format`);
      return;
    }

    // Propagate to DHT (if it has a method to remove a specific peer)
    if (this.dhtClient && typeof this.dhtClient.removePeer === 'function') {
      this.dhtClient.removePeer(peerId, infoHash);
      debug(`Propagated peer unavailability to DHT: ${peerId} for ${infoHash}`);
    }
    
    // Propagate to PEX
    if (this.pexManager && typeof this.pexManager.removePeer === 'function') {
      this.pexManager.removePeer(peerId, infoHash);
      debug(`Propagated peer unavailability to PEX: ${peerId} for ${infoHash}`);
    }
  }
}

/**
 * Factory function to create a DiscoveryContentIntegration
 * 
 * @param options Configuration options
 * @returns A new DiscoveryContentIntegration instance
 */
export function createDiscoveryContentIntegration(
  options: DiscoveryContentIntegrationOptions
): DiscoveryContentIntegration {
  return new DiscoveryContentIntegration(options);
}
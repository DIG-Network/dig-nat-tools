/**
 * Content Availability Manager
 * 
 * This module handles the tracking and verification of content availability across the network.
 * It implements mechanisms for both host-initiated and client-detected content unavailability,
 * with consensus mechanisms to prevent false reports.
 */

import { EventEmitter } from 'events';
import Debug from 'debug';
import type { GunInstance, GunChain } from '../../../types/gun';
import { PeerContentStatus } from '../../../types/common';
import type { ContentReport as BaseContentReport } from '../../../types/common';
import * as nodePersist from 'node-persist';
import { isIPv6 } from 'net';
import { timingSafeEqual } from 'crypto';
import * as path from 'path';

const debug = Debug('dig:content-availability-manager');
const storage = nodePersist;

// Configuration constants
export const DEFAULT_CONTENT_TTL = 3600000; // 1 hour in milliseconds
export const REANNOUNCE_INTERVAL = 1800000; // 30 minutes in milliseconds
export const REPORT_EXPIRATION_TIME = 7200000; // 2 hours in milliseconds
export const LOW_THRESHOLD = 2; // Number of reports to lower peer priority
export const MEDIUM_THRESHOLD = 3; // Number of reports to mark peer as suspect
export const HIGH_THRESHOLD = 5; // Number of reports to remove peer completely
export const MIN_UNIQUE_REPORTERS = 3; // Minimum number of unique reporters needed
export const VERIFICATION_RETRY_COUNT = 2; // Number of verification attempts
export const REPUTATION_FACTOR = 0.8; // How much reputation affects report weight

// Report types for graduated response
export enum ReportLevel {
  NONE = 'none',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

// Report data structure
interface ContentReport extends BaseContentReport {
  reportCount: number;
  weightedCount: number;
  lastReportTime: number;
  reporters: Set<string>;
  level: ReportLevel;
  verificationAttempts: number;
  lastVerificationTime: number;
}

// Interface for peer reputation storage
interface PeerReputation {
  successCount: number;
  failureCount: number;
  lastUpdateTime: number;
  reputationScore: number;
}

// Configuration options for the manager
export interface ContentAvailabilityOptions {
  nodeId: string;
  gun?: GunInstance;
  contentTTL?: number;
  reannounceInterval?: number;
  enableVerification?: boolean;
  persistenceEnabled?: boolean;
  persistenceDir?: string;
}

/**
 * Manages content availability tracking, reporting, and consensus
 * for the peer discovery network
 */
export class ContentAvailabilityManager extends EventEmitter {
  private nodeId: string;
  private gun?: GunInstance;
  private contentTTL: number;
  private reannounceInterval: number;
  private enableVerification: boolean;
  private persistenceEnabled: boolean;
  private persistenceDir: string;
  
  // Tracking structures
  private contentReports: Map<string, Map<string, ContentReport>> = new Map();
  private peerReputations: Map<string, PeerReputation> = new Map();
  private activeContent: Map<string, number> = new Map();
  private contentMappings: Map<string, string> = new Map();
  
  // Timers
  private reannounceTimer?: NodeJS.Timeout;

  constructor(options: ContentAvailabilityOptions) {
    super();
    
    this.nodeId = options.nodeId;
    this.gun = options.gun;
    this.contentTTL = options.contentTTL || DEFAULT_CONTENT_TTL;
    this.reannounceInterval = options.reannounceInterval || REANNOUNCE_INTERVAL;
    this.enableVerification = options.enableVerification !== false;
    this.persistenceEnabled = options.persistenceEnabled || false;
    this.persistenceDir = options.persistenceDir || './.dig-data';
    
    debug(`Created ContentAvailabilityManager with nodeId: ${this.nodeId}`);
  }

  /**
   * Starts the content availability manager
   */
  public async start(): Promise<void> {
    debug('Starting ContentAvailabilityManager');
    
    // Initialize persistence if enabled
    if (this.persistenceEnabled) {
      await storage.init({
        dir: path.join(this.persistenceDir, 'content-availability'),
        stringify: JSON.stringify,
        parse: JSON.parse,
        encoding: 'utf8',
        logging: false,
        ttl: false,
        forgiveParseErrors: false,
        writeQueue: true,
        writeQueueIntervalMs: 1000
      });
      
      await this._loadPersistedData();
    }
    
    // Set up reannouncement timer
    this._startReannouncements();
    
    // Set up listeners for Gun.js updates if available
    if (this.gun) {
      this._setupGunListeners();
    }
    
    debug('ContentAvailabilityManager started');
  }

  /**
   * Stops the content availability manager
   */
  public async stop(): Promise<void> {
    debug('Stopping ContentAvailabilityManager');
    
    // Clear reannouncement timer
    if (this.reannounceTimer) {
      clearInterval(this.reannounceTimer);
      this.reannounceTimer = undefined;
    }
    
    // Persist data if enabled
    if (this.persistenceEnabled) {
      await this._persistData();
    }
    
    debug('ContentAvailabilityManager stopped');
  }

  /**
   * Announces that local node has content available
   * 
   * @param infoHash The hash of the content
   * @param options Optional announcement options
   */
  public announceContentAvailable(
    infoHash: string, 
    options?: { 
      port?: number,
      address?: string,
      contentId?: string,
      ttl?: number 
    }
  ): void {
    const ttl = options?.ttl || this.contentTTL;
    const port = options?.port;
    const contentId = options?.contentId;
    const address = options?.address ? this._normalizeAddress(options.address) : undefined;
    
    debug(`Announcing content available: ${infoHash}, ttl: ${ttl}`);
    
    // Store the content ID mapping if provided
    if (contentId) {
      this.contentMappings.set(contentId, infoHash);
      debug(`Mapped content ID ${contentId} to hash ${infoHash}`);
    }
    
    // Track locally
    this.activeContent.set(infoHash, Date.now());
    
    // Announce to Gun.js network if available
    if (this.gun) {
      try {
        this.gun.get('dig-peers').get(infoHash).get(this.nodeId).put({
          available: true,
          timestamp: Date.now(),
          ttl: ttl,
          port: port,
          address: address
        });
        
        // Also announce content mapping if provided
        if (contentId) {
          this.gun.get('dig-content-maps').get(contentId).put({
            hash: infoHash,
            timestamp: Date.now()
          });
        }
      } catch (err) {
        debug(`Error announcing to Gun: ${(err as Error).message}`);
      }
    }
    
    // Emit event
    this.emit('content:announced', infoHash);
  }

  /**
   * Announces that local node no longer has content available
   * 
   * @param infoHash The hash of the content
   * @param contentId Optional content ID to remove mapping
   */
  public announceContentUnavailable(infoHash: string, contentId?: string): void {
    debug(`Announcing content unavailable: ${infoHash}`);
    
    // Remove from local tracking
    this.activeContent.delete(infoHash);
    
    // Remove content ID mapping if provided using constant-time comparison
    if (contentId) {
      const storedHash = this.contentMappings.get(contentId);
      if (storedHash && this._safeCompare(storedHash, infoHash)) {
        this.contentMappings.delete(contentId);
        debug(`Removed content ID mapping for ${contentId}`);
      }
    }
    
    // Announce to Gun.js network if available
    if (this.gun) {
      try {
        // Set the peer's announcement for this hash to null (removed)
        this.gun.get('dig-peers').get(infoHash).get(this.nodeId).put(null);
        
        // Remove content mapping if provided
        if (contentId) {
          this.gun.get('dig-content-maps').get(contentId).put(null);
        }
      } catch (err) {
        debug(`Error announcing removal to Gun: ${(err as Error).message}`);
      }
    }
    
    // Emit event
    this.emit('content:revoked', infoHash);
  }

  /**
   * Reports that a peer doesn't have content it claimed to have
   * 
   * @param peerId ID of the peer being reported
   * @param infoHash Hash of the content that is unavailable
   * @param reporterNodeId Optional ID of the reporting node (defaults to local node)
   */
  public reportContentUnavailable(peerId: string, infoHash: string, reporterNodeId?: string): void {
    const reporter = reporterNodeId || this.nodeId;
    
    debug(`Reporting content unavailable: peer=${peerId}, infoHash=${infoHash}, reporter=${reporter}`);
    
    // Get or create the report map for this info hash
    if (!this.contentReports.has(infoHash)) {
      this.contentReports.set(infoHash, new Map());
    }
    
    const peerReports = this.contentReports.get(infoHash)!;
    
    // Get or create the report for this peer
    if (!peerReports.has(peerId)) {
      peerReports.set(peerId, this._createReport(peerId, infoHash, reporter));
    }
    
    const report = peerReports.get(peerId)!;
    
    // Add the reporter
    report.reporters.add(reporter);
    report.reportCount++;
    report.lastReportTime = Date.now();
    
    // Calculate weighted count based on reporter reputation
    const reporterReputation = this._getPeerReputation(reporter);
    report.weightedCount += 1 * (1 + reporterReputation * REPUTATION_FACTOR);
    
    // Update report level and status
    this._updateReportLevel(infoHash, peerId, report);
    
    // Process the report
    this._processReport(infoHash, peerId, report);
    
    // If Gun.js is available, publish the report
    if (this.gun) {
      try {
        this.gun.get('dig-reports').get(infoHash).get(peerId).get(reporter).put({
          timestamp: Date.now(),
          status: report.status
        });
      } catch (err) {
        debug(`Error publishing report to Gun: ${(err as Error).message}`);
      }
    }
    
    debug(`Report processed: peer=${peerId}, infoHash=${infoHash}, level=${report.level}, status=${report.status}`);
  }

  /**
   * Updates the reputation of a peer based on content availability verification
   * 
   * @param peerId ID of the peer
   * @param successful Whether the verification was successful
   */
  public updatePeerReputation(peerId: string, successful: boolean): void {
    debug(`Updating peer reputation: ${peerId}, successful: ${successful}`);
    
    // Get or create the reputation entry
    if (!this.peerReputations.has(peerId)) {
      this.peerReputations.set(peerId, {
        successCount: 0,
        failureCount: 0,
        lastUpdateTime: 0,
        reputationScore: 0.5 // Start with neutral reputation
      });
    }
    
    const reputation = this.peerReputations.get(peerId)!;
    
    // Update counts
    if (successful) {
      reputation.successCount++;
    } else {
      reputation.failureCount++;
    }
    
    reputation.lastUpdateTime = Date.now();
    
    // Calculate new reputation score
    // Formula: successes / (successes + failures) with a damping factor
    const total = reputation.successCount + reputation.failureCount;
    if (total > 0) {
      // Use a damped formula to prevent extremes
      reputation.reputationScore = (
        reputation.successCount + 1
      ) / (total + 2);
    }
    
    debug(`Updated peer reputation: ${peerId}, score: ${reputation.reputationScore.toFixed(2)}`);
    
    // Emit reputation update event
    this.emit('peer:reputation', peerId, reputation.reputationScore);
  }

  /**
   * Gets the reputation score for a peer
   * 
   * @param peerId ID of the peer
   * @returns Reputation score (0-1)
   */
  public getPeerReputation(peerId: string): number {
    return this._getPeerReputation(peerId);
  }

  /**
   * Gets the content status for a peer
   * 
   * @param peerId ID of the peer
   * @param infoHash Hash of the content
   * @returns Content status (AVAILABLE, SUSPECT, UNAVAILABLE)
   */
  public getPeerContentStatus(peerId: string, infoHash: string): PeerContentStatus {
    const peerReports = this.contentReports.get(infoHash);
    
    if (!peerReports || !peerReports.has(peerId)) {
      return PeerContentStatus.AVAILABLE; // No reports, assume available
    }
    
    const report = peerReports.get(peerId)!;
    
    // If the report is old, consider it expired
    const reportAge = Date.now() - report.lastReportTime;
    if (reportAge > REPORT_EXPIRATION_TIME) {
      return PeerContentStatus.AVAILABLE;
    }
    
    return report.status;
  }

  /**
   * Determines if a peer should be considered for content download
   * 
   * @param peerId ID of the peer
   * @param infoHash Hash of the content
   * @returns Whether the peer should be considered
   */
  public shouldConsiderPeerForContent(peerId: string, infoHash: string): boolean {
    const status = this.getPeerContentStatus(peerId, infoHash);
    return status !== PeerContentStatus.UNAVAILABLE;
  }

  /**
   * Resets reports about a peer for a specific content hash
   * 
   * @param peerId ID of the peer
   * @param infoHash Hash of the content
   */
  public resetPeerReports(peerId: string, infoHash: string): void {
    debug(`Resetting peer reports: ${peerId}, infoHash=${infoHash}`);
    
    const peerReports = this.contentReports.get(infoHash);
    if (peerReports && peerReports.has(peerId)) {
      peerReports.delete(peerId);
    }
    
    // Update Gun.js data
    if (this.gun) {
      try {
        this.gun.get('dig-reports').get(infoHash).get(peerId).put(null);
      } catch (err) {
        debug(`Error resetting reports in Gun: ${(err as Error).message}`);
      }
    }
    
    // Emit reset event
    this.emit('report:reset', peerId, infoHash);
  }

  /**
   * Handle the result of a content verification
   * 
   * @param peerId ID of the peer
   * @param infoHash Hash of the content
   * @param hasContent Whether the peer has the content
   */
  public handleVerificationResult(peerId: string, infoHash: string, hasContent: boolean): void {
    debug(`Verification result: peer=${peerId}, infoHash=${infoHash}, hasContent=${hasContent}`);
    
    const peerReports = this.contentReports.get(infoHash);
    
    if (!peerReports || !peerReports.has(peerId)) {
      // No existing report, just update reputation if no content
      if (!hasContent) {
        this.updatePeerReputation(peerId, false);
      }
      return;
    }
    
    const report = peerReports.get(peerId)!;
    report.lastVerificationTime = Date.now();
    report.verificationAttempts++;
    
    if (hasContent) {
      // Content is actually available, reset reports
      this.resetPeerReports(peerId, infoHash);
      this.updatePeerReputation(peerId, true);
      
      // Broadcast that content is available
      this._broadcastPeerStatus(peerId, infoHash, PeerContentStatus.AVAILABLE);
    } else {
      // Content is unavailable, update reputation and report
      this.updatePeerReputation(peerId, false);
      
      // Add a report from this node
      this.reportContentUnavailable(peerId, infoHash);
      
      // If we've tried verification multiple times and still unavailable,
      // mark as definitely unavailable
      if (report.verificationAttempts >= VERIFICATION_RETRY_COUNT) {
        report.status = PeerContentStatus.UNAVAILABLE;
        this._broadcastPeerStatus(peerId, infoHash, PeerContentStatus.UNAVAILABLE);
      }
    }
  }

  /**
   * Verifies if a peer has content available
   * 
   * @param peerId ID of the peer
   * @param infoHash Hash of the content
   * @param verificationCallback Callback to perform verification
   * @returns Whether verification was successful
   */
  public async verifyPeerContent(
    peerId: string, 
    infoHash: string,
    verificationCallback: (peerId: string, infoHash: string) => Promise<boolean>
  ): Promise<boolean> {
    debug(`Verifying peer content: ${peerId}, infoHash=${infoHash}`);
    
    try {
      // Call the provided verification callback
      const hasContent = await verificationCallback(peerId, infoHash);
      
      // Handle the verification result
      this.handleVerificationResult(peerId, infoHash, hasContent);
      
      return hasContent;
    } catch (err) {
      debug(`Error during verification: ${(err as Error).message}`);
      
      // Handle as failure, but don't mark as definitely unavailable
      // since it could be a network error
      const peerReports = this.contentReports.get(infoHash);
      if (peerReports && peerReports.has(peerId)) {
        const report = peerReports.get(peerId)!;
        report.lastVerificationTime = Date.now();
        report.verificationAttempts++;
      }
      
      return false;
    }
  }

  /**
   * Gets the hash for a content ID
   * 
   * @param contentId Content ID
   * @returns The info hash, if known
   */
  public getHashForContent(contentId: string): string | undefined {
    // Find the hash using constant-time comparison to prevent timing attacks
    for (const [id, hash] of this.contentMappings.entries()) {
      if (this._safeCompare(id, contentId)) {
        return hash;
      }
    }
    return undefined;
  }

  /**
   * Gets all content IDs for a hash
   * 
   * @param infoHash Hash to lookup
   * @returns Array of content IDs
   */
  public getContentIdsForHash(infoHash: string): string[] {
    const contentIds: string[] = [];
    
    // Use constant-time comparison for hash verification
    for (const [contentId, hash] of this.contentMappings.entries()) {
      if (this._safeCompare(hash, infoHash)) {
        contentIds.push(contentId);
      }
    }
    
    return contentIds;
  }

  /**
   * Gets the reputation score for a peer (internal implementation)
   * 
   * @param peerId ID of the peer
   * @returns Reputation score (0-1)
   */
  private _getPeerReputation(peerId: string): number {
    if (!this.peerReputations.has(peerId)) {
      return 0.5; // Default neutral reputation
    }
    
    const reputation = this.peerReputations.get(peerId)!;
    
    // If the reputation is old, return to neutral
    const reputationAge = Date.now() - reputation.lastUpdateTime;
    if (reputationAge > REPORT_EXPIRATION_TIME * 3) {
      return 0.5;
    }
    
    return reputation.reputationScore;
  }

  /**
   * Updates the report level based on weighted count
   * 
   * @param infoHash Hash of the content
   * @param peerId ID of the peer
   * @param report The report to update
   */
  private _updateReportLevel(infoHash: string, peerId: string, report: ContentReport): void {
    const oldLevel = report.level;
    const oldStatus = report.status;
    
    // Only consider reports from enough unique reporters
    if (report.reporters.size < MIN_UNIQUE_REPORTERS) {
      // Less than minimum unique reporters, don't escalate beyond low
      if (report.level === ReportLevel.NONE && report.weightedCount >= LOW_THRESHOLD) {
        report.level = ReportLevel.LOW;
        report.status = PeerContentStatus.SUSPECT;
      }
    } else {
      // Enough unique reporters, apply full levels
      if (report.weightedCount >= HIGH_THRESHOLD) {
        report.level = ReportLevel.HIGH;
        report.status = PeerContentStatus.UNAVAILABLE;
      } else if (report.weightedCount >= MEDIUM_THRESHOLD) {
        report.level = ReportLevel.MEDIUM;
        report.status = PeerContentStatus.SUSPECT;
      } else if (report.weightedCount >= LOW_THRESHOLD) {
        report.level = ReportLevel.LOW;
        report.status = PeerContentStatus.SUSPECT;
      }
    }
    
    // If the level or status changed, emit an event
    if (report.level !== oldLevel || report.status !== oldStatus) {
      debug(`Report level changed: peer=${peerId}, infoHash=${infoHash}, level=${report.level}, status=${report.status}`);
      this.emit('report:updated', peerId, infoHash, report.level, report.status);
    }
  }

  /**
   * Processes a content availability report
   * 
   * @param infoHash Hash of the content
   * @param peerId ID of the peer
   * @param report The report to process
   */
  private _processReport(infoHash: string, peerId: string, report: ContentReport): void {
    // If report level is high enough, verify directly
    if ((report.level === ReportLevel.MEDIUM || report.level === ReportLevel.HIGH) && 
        this.enableVerification && 
        report.verificationAttempts < VERIFICATION_RETRY_COUNT) {
      
      // Let listeners know we need verification
      this.emit('verification:needed', peerId, infoHash);
    }
    
    // For high level reports, broadcast to the network
    if (report.level === ReportLevel.HIGH) {
      this._broadcastPeerStatus(peerId, infoHash, PeerContentStatus.UNAVAILABLE);
    } else if (report.level === ReportLevel.MEDIUM) {
      this._broadcastPeerStatus(peerId, infoHash, PeerContentStatus.SUSPECT);
    }
  }

  /**
   * Starts the reannouncement timer
   */
  private _startReannouncements(): void {
    debug(`Starting reannouncements every ${this.reannounceInterval}ms`);
    
    this.reannounceTimer = setInterval(() => {
      this._reannounceActiveContent();
    }, this.reannounceInterval);
  }

  /**
   * Reannounces active content
   */
  private _reannounceActiveContent(): void {
    const now = Date.now();
    
    // Reannounce all active content
    for (const [infoHash, announcedTime] of this.activeContent.entries()) {
      // Check if the announcement is still valid
      if (now - announcedTime <= this.contentTTL) {
        debug(`Reannouncing content: ${infoHash}`);
        
        // Find any content IDs for this hash
        const contentIds = this.getContentIdsForHash(infoHash);
        const contentId = contentIds.length > 0 ? contentIds[0] : undefined;
        
        // Reannounce
        this.announceContentAvailable(infoHash, { contentId });
      } else {
        // Content TTL expired, remove from active content
        debug(`Content TTL expired: ${infoHash}`);
        this.activeContent.delete(infoHash);
      }
    }
  }

  /**
   * Sets up Gun.js listeners for reputation and reports
   */
  private _setupGunListeners(): void {
    if (!this.gun) return;
    
    debug('Setting up Gun.js listeners');
    
    try {
      // Listen for content mappings
      (this.gun as unknown as GunChain).get('dig-content-maps').map().on((data: unknown, contentId: string) => {
        const mappingData = data as { hash: string; timestamp: number } | null;
        if (mappingData?.hash && mappingData.timestamp) {
          debug(`Received content mapping: ${contentId} -> ${mappingData.hash}`);
          this.contentMappings.set(contentId, mappingData.hash);
        }
      });

      // Listen for peer announcements
      (this.gun as unknown as GunChain).get('dig-peers').map().map().on((data: unknown, key: string) => {
        const peerData = data as { available: boolean; address: string; port: number } | null;
        if (peerData?.available && peerData.address) {
          // Normalize the address for IPv6 support
          const normalizedAddress = this._normalizeAddress(peerData.address);
          debug(`Received peer announcement: ${key} at ${normalizedAddress}:${peerData.port}`);
          
          // Update the data with normalized address
          if (normalizedAddress !== peerData.address) {
            (this.gun as unknown as GunChain)
              .get('dig-peers')
              .get(key)
              .get('address')
              .put(normalizedAddress);
          }
        }
      });
      
      // Listen for peer reports
      (this.gun as unknown as GunChain).get('dig-reports').map().map().map().on((data: unknown, key: string) => {
        const reportData = data as { timestamp: number; status: PeerContentStatus; address?: string } | null;
        if (reportData?.timestamp && reportData.status) {
          // Extract peerId and infoHash from the path
          const [peerId, infoHash] = key.split('/').slice(-2);
          
          // Use constant-time comparison for reporter ID to prevent timing attacks
          if (!this._safeCompare(key, this.nodeId)) {
            debug(`Received peer report: reporter=${key}, peer=${peerId}, infoHash=${infoHash}, status=${reportData.status}`);
            
            // If address is included, normalize it
            if (reportData.address) {
              reportData.address = this._normalizeAddress(reportData.address);
            }
            
            this.reportContentUnavailable(peerId, infoHash, key);
          }
        }
      });
      
      // Listen for peer status broadcasts
      (this.gun as unknown as GunChain).get('dig-peer-status').map().map().on((data: unknown, key: string) => {
        const statusData = data as { reporter: string; status: PeerContentStatus; timestamp: number } | null;
        if (statusData?.reporter && statusData.status) {
          // Extract peerId and infoHash from the path
          const [peerId, infoHash] = key.split('/').slice(-2);
          
          // Use constant-time comparison for reporter ID to prevent timing attacks
          if (!this._safeCompare(statusData.reporter, this.nodeId)) {
            debug(`Received peer status: reporter=${statusData.reporter}, peer=${peerId}, infoHash=${infoHash}, status=${statusData.status}`);
            
            if (statusData.status === PeerContentStatus.UNAVAILABLE) {
              this.reportContentUnavailable(peerId, infoHash, statusData.reporter);
            } else if (statusData.status === PeerContentStatus.AVAILABLE) {
              this.resetPeerReports(peerId, infoHash);
            }
          }
        }
      });
    } catch (err) {
      debug(`Error setting up Gun listeners: ${(err as Error).message}`);
    }
  }

  /**
   * Loads persisted peer reputation and content reports
   */
  private async _loadPersistedData(): Promise<void> {
    try {
      // Load peer reputations
      const reputations = await storage.getItem('peerReputations');
      if (reputations) {
        this.peerReputations = new Map(Object.entries(reputations));
      }
      
      // Load content reports
      const reports = await storage.getItem('contentReports');
      if (reports) {
        // Convert plain objects back to Maps
        this.contentReports = new Map();
        for (const [infoHash, peerReports] of Object.entries(reports)) {
          this.contentReports.set(infoHash, new Map(Object.entries(peerReports)));
        }
      }
      
      // Load content mappings
      const mappings = await storage.getItem('contentMappings');
      if (mappings) {
        this.contentMappings = new Map(Object.entries(mappings));
      }
      
      debug('Loaded persisted data');
    } catch (err) {
      debug(`Error loading persisted data: ${(err as Error).message}`);
      // Don't throw - continue with empty state
    }
  }

  /**
   * Persists peer reputation and content reports
   */
  private async _persistData(): Promise<void> {
    try {
      // Convert Maps to plain objects for storage
      const reputations = Object.fromEntries(this.peerReputations);
      const reports = Object.fromEntries(
        Array.from(this.contentReports.entries()).map(([hash, peerMap]) => [
          hash,
          Object.fromEntries(peerMap)
        ])
      );
      const mappings = Object.fromEntries(this.contentMappings);
      
      // Store data
      await Promise.all([
        storage.setItem('peerReputations', reputations),
        storage.setItem('contentReports', reports),
        storage.setItem('contentMappings', mappings)
      ]);
      
      debug('Persisted data');
    } catch (err) {
      debug(`Error persisting data: ${(err as Error).message}`);
      // Don't throw - continue without persistence
    }
  }

  /**
   * Safely compares two values in constant time
   */
  private _safeCompare(a: Buffer | string, b: Buffer | string): boolean {
    try {
      const bufA = Buffer.isBuffer(a) ? a : Buffer.from(String(a));
      const bufB = Buffer.isBuffer(b) ? b : Buffer.from(String(b));
      return timingSafeEqual(bufA, bufB);
    } catch {
      return false;
    }
  }

  /**
   * Validates and normalizes an IP address, preferring IPv6
   */
  private _normalizeAddress(address: string): string {
    // Remove any brackets from IPv6 address
    const cleanAddress = address.replace(/[\[\]]/g, '');
    
    // Try IPv6 first
    if (isIPv6(cleanAddress)) {
      return `[${cleanAddress}]`;
    }
    
    // Fallback to original address
    return address;
  }

  /**
   * Broadcasts peer status to the network with proper validation
   */
  private _broadcastPeerStatus(peerId: string, infoHash: string, status: PeerContentStatus): void {
    debug(`Broadcasting peer status: peer=${peerId}, infoHash=${infoHash}, status=${status}`);
    
    // Validate inputs
    if (!peerId || !infoHash || !Object.values(PeerContentStatus).includes(status)) {
      debug('Invalid broadcast parameters');
      return;
    }
    
    // Only broadcast to Gun.js for now
    if (this.gun) {
      try {
        const timestamp = Date.now();
        const data = {
          reporter: this.nodeId,
          status,
          timestamp
        };
        
        (this.gun as unknown as GunChain)
          .get('dig-peer-status')
          .get(infoHash)
          .get(peerId)
          .put(data);
      } catch (err) {
        debug(`Error broadcasting status to Gun: ${(err as Error).message}`);
      }
    }
  }

  // Update the createReport function to include all required fields
  private _createReport(peerId: string, infoHash: string, reporterId: string): ContentReport {
    return {
      reporterId,
      peerId,
      infoHash,
      timestamp: Date.now(),
      status: PeerContentStatus.AVAILABLE,
      reportCount: 0,
      weightedCount: 0,
      lastReportTime: Date.now(),
      reporters: new Set<string>(),
      level: ReportLevel.NONE,
      verificationAttempts: 0,
      lastVerificationTime: 0
    };
  }
}

/**
 * Creates a new ContentAvailabilityManager
 */
export function createContentAvailabilityManager(options: ContentAvailabilityOptions): ContentAvailabilityManager {
  return new ContentAvailabilityManager(options);
}

// Export the class as default
export default ContentAvailabilityManager; 
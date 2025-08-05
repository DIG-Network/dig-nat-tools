/**
 * Authenticated Content Availability Manager
 * 
 * Enhances the content availability manager with cryptographic verification
 * of content announcements and reports.
 */

import { EventEmitter } from 'events';
import { 
  createCryptoIdentity,
  signData, 
  verifySignedData
} from '../crypto/identity';
import type { 
  CryptoIdentity,
  SignedData,
  SignatureAlgorithm 
} from '../crypto/identity';
import NetworkManager from '../network-manager';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import type { GunInstance, GunChain } from '../types/gun';
import {
  PeerContentStatus,
  ReportLevel,
  VerificationResult
} from '../types/common';
import type {
  ContentAnnouncement,
  ContentReport,
  ContentRecord
} from '../types/common';

/**
 * Signed content announcement
 */
export type SignedContentAnnouncement = SignedData<ContentAnnouncement>;

/**
 * Signed content report
 */
export type SignedContentReport = SignedData<ContentReport>;

/**
 * Options for the authenticated content availability manager
 */
export interface AuthenticatedContentAvailabilityOptions {
  nodeId: string;
  privateKey: Buffer | string;
  publicKey?: Buffer | string;
  signatureAlgorithm?: SignatureAlgorithm;
  keyEncoding?: BufferEncoding;
  contentTTL?: number;
  reannounceInterval?: number;
  enableVerification?: boolean;
  verificationTimeout?: number;
  reportThresholds?: {
    low: number;
    medium: number;
    high: number;
    uniqueReporters: number;
  };
  gun?: GunInstance;
}

/**
 * Authenticated content availability manager
 */
export class AuthenticatedContentAvailabilityManager extends EventEmitter {
  private readonly nodeId: string;
  private readonly identity: CryptoIdentity;
  private readonly contentRecords: Map<string, Map<string, ContentRecord>>;
  private readonly contentTTL: number;
  private readonly reannounceInterval: number;
  private readonly enableVerification: boolean;
  private readonly verificationTimeout: number;
  private readonly reportThresholds: {
    low: number;
    medium: number;
    high: number;
    uniqueReporters: number;
  };
  private readonly gun?: GunInstance;
  private readonly reannounceTimers: Map<string, NodeJS.Timeout>;
  private readonly verificationInProgress: Set<string>;
  private readonly trustedPeers: Map<string, string>;
  private readonly networkManager: NetworkManager;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(options: AuthenticatedContentAvailabilityOptions) {
    super();
    
    this.nodeId = options.nodeId;
    this.identity = createCryptoIdentity({
      privateKey: options.privateKey,
      publicKey: options.publicKey,
      algorithm: options.signatureAlgorithm || 'ed25519',
      encoding: options.keyEncoding || 'hex',
      outputEncoding: 'hex'
    });
    
    this.contentRecords = new Map();
    this.contentTTL = options.contentTTL || 3600000; // 1 hour default
    this.reannounceInterval = options.reannounceInterval || (this.contentTTL / 2);
    this.enableVerification = options.enableVerification ?? true;
    this.verificationTimeout = options.verificationTimeout || 30000; // 30 seconds default
    this.reportThresholds = options.reportThresholds || {
      low: 2,
      medium: 3,
      high: 5,
      uniqueReporters: 3
    };
    this.gun = options.gun;
    this.reannounceTimers = new Map();
    this.verificationInProgress = new Set();
    this.trustedPeers = new Map();
    
    // Initialize NetworkManager
    this.networkManager = new NetworkManager({
      localId: options.nodeId,
      enableDHT: true,
      enableLocal: true,
      enablePEX: true,
      gunOptions: options.gun ? { instance: options.gun } : undefined
    });
  }

  /**
   * Start the manager
   */
  public async start(): Promise<void> {
    // Setup periodic cleanup
    this.cleanupInterval = setInterval(() => this.cleanupExpiredRecords(), this.contentTTL);
    
    // If using Gun.js, subscribe to announcements and reports
    if (this.gun) {
      this.subscribeToGunAnnouncements();
      this.subscribeToGunReports();
    }
    
    this.emit('started', { nodeId: this.nodeId });
  }

  /**
   * Stop the manager
   */
  public async stop(): Promise<void> {
    // Clear all timers
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    
    for (const timer of this.reannounceTimers.values()) {
      clearTimeout(timer);
    }
    
    this.reannounceTimers.clear();

    // Stop the network manager
    await this.networkManager.stop();
    
    // Unsubscribe from Gun if needed
    if (this.gun) {
      this.gun.get('contentAnnouncements').map().off();
      this.gun.get('contentReports').map().off();
    }
    
    this.emit('stopped', { nodeId: this.nodeId });
  }

  /**
   * Announce content availability
   */
  public async announceContentAvailable(
    hash: string, 
    options?: { port?: number; contentId?: string }
  ): Promise<void> {
    const announcement: ContentAnnouncement = {
      hash,
      port: options?.port,
      contentId: options?.contentId,
      available: true,
      peerId: this.nodeId
    };
    
    // Sign the announcement
    const signedAnnouncement = await signData(
      announcement,
      this.identity,
      this.getPublicKey()
    );
    
    // Update local records
    this.updateContentRecord(signedAnnouncement);
    
    // Publish to Gun if available
    if (this.gun) {
      await this.publishAnnouncementToGun(signedAnnouncement);
    }
    
    // Setup reannouncement timer
    this.setupReannounceTimer(hash);
    
    this.emit('content:available', {
      peerId: this.nodeId,
      hash,
      contentId: options?.contentId
    });
  }

  /**
   * Announce content unavailability
   */
  public async announceContentUnavailable(hash: string, contentId?: string): Promise<void> {
    const announcement: ContentAnnouncement = {
      hash,
      contentId,
      available: false,
      peerId: this.nodeId
    };
    
    // Sign the announcement
    const signedAnnouncement = await signData(
      announcement,
      this.identity,
      this.getPublicKey()
    );
    
    // Update local records (remove content)
    this.removeContentRecord(this.nodeId, hash);
    
    // Publish to Gun if available
    if (this.gun) {
      await this.publishAnnouncementToGun(signedAnnouncement);
    }
    
    // Clear reannounce timer
    const timerKey = `${this.nodeId}:${hash}`;
    if (this.reannounceTimers.has(timerKey)) {
      clearTimeout(this.reannounceTimers.get(timerKey)!);
      this.reannounceTimers.delete(timerKey);
    }
    
    this.emit('content:unavailable', {
      peerId: this.nodeId,
      hash,
      contentId
    });
  }

  /**
   * Report that content is unavailable from a peer
   */
  public async reportContentUnavailable(
    peerId: string, 
    hash: string, 
    reason?: string
  ): Promise<void> {
    if (peerId === this.nodeId) {
      console.warn('Cannot report own content as unavailable');
      return;
    }
    
    const report: ContentReport = {
      reporterId: this.nodeId,
      reportedPeerId: peerId,
      contentHash: hash,
      reason
    };
    
    // Sign the report
    const signedReport = await signData(
      report,
      this.identity,
      this.getPublicKey()
    );
    
    // Add to local records
    this.addReport(signedReport);
    
    // Publish to Gun if available
    if (this.gun) {
      await this.publishReportToGun(signedReport);
    }
    
    this.emit('content:reported', {
      reporterId: this.nodeId,
      reportedPeerId: peerId,
      hash
    });
  }

  /**
   * Get content status for a peer
   */
  public getContentStatus(peerId: string, hash: string): PeerContentStatus {
    if (!this.contentRecords.has(hash)) {
      return PeerContentStatus.UNAVAILABLE;
    }
    
    const peerRecords = this.contentRecords.get(hash)!;
    if (!peerRecords.has(peerId)) {
      return PeerContentStatus.UNAVAILABLE;
    }
    
    return peerRecords.get(peerId)!.status;
  }

  /**
   * Get all peers with content
   */
  public getPeersWithContent(hash: string): string[] {
    if (!this.contentRecords.has(hash)) {
      return [];
    }
    
    const peerRecords = this.contentRecords.get(hash)!;
    const availablePeers: string[] = [];
    
    for (const [peerId, record] of peerRecords.entries()) {
      if (record.status === PeerContentStatus.AVAILABLE) {
        availablePeers.push(peerId);
      }
    }
    
    return availablePeers;
  }

  /**
   * Add a trusted peer
   */
  public addTrustedPeer(peerId: string, publicKey: string): void {
    this.trustedPeers.set(peerId, publicKey);
  }

  /**
   * Remove a trusted peer
   */
  public removeTrustedPeer(peerId: string): void {
    this.trustedPeers.delete(peerId);
  }

  /**
   * Check if a peer is trusted
   */
  public isTrustedPeer(peerId: string, publicKey?: string): boolean {
    if (!this.trustedPeers.has(peerId)) {
      return false;
    }
    
    if (publicKey && this.trustedPeers.get(peerId) !== publicKey) {
      return false;
    }
    
    return true;
  }

  /**
   * Process a signed content announcement
   */
  public async processAnnouncement(signedAnnouncement: SignedContentAnnouncement): Promise<boolean> {
    // Verify signature using ed25519 as it's our default
    const tempIdentity = createCryptoIdentity({
      privateKey: '', // Not needed for verification
      publicKey: signedAnnouncement.publicKey,
      algorithm: 'ed25519',
      outputEncoding: 'hex'
    });
    
    const isValid = await verifySignedData(signedAnnouncement, tempIdentity);
    
    if (!isValid) {
      console.error('Invalid signature on content announcement');
      return false;
    }
    
    // Check if announcement is from a trusted peer
    if (this.trustedPeers.size > 0 && 
        !this.isTrustedPeer(signedAnnouncement.data.peerId, signedAnnouncement.publicKey)) {
      console.warn(`Announcement from untrusted peer: ${signedAnnouncement.data.peerId}`);
      // Still process it but with lower trust
    }
    
    // Process the announcement
    if (signedAnnouncement.data.available) {
      this.updateContentRecord(signedAnnouncement);
    } else {
      this.removeContentRecord(
        signedAnnouncement.data.peerId, 
        signedAnnouncement.data.hash
      );
    }
    
    return true;
  }

  /**
   * Process a signed content report
   */
  public async processReport(signedReport: SignedContentReport): Promise<boolean> {
    // Verify signature using ed25519 as it's our default
    const tempIdentity = createCryptoIdentity({
      privateKey: '', // Not needed for verification
      publicKey: signedReport.publicKey,
      algorithm: 'ed25519',
      outputEncoding: 'hex'
    });
    
    const isValid = await verifySignedData(signedReport, tempIdentity);
    
    if (!isValid) {
      console.error('Invalid signature on content report');
      return false;
    }
    
    // Add the report
    this.addReport(signedReport);
    
    return true;
  }

  /**
   * Update local content record
   */
  private updateContentRecord(signedAnnouncement: SignedContentAnnouncement): void {
    const { peerId, hash, contentId, port, available } = signedAnnouncement.data;
    
    if (!available) {
      this.removeContentRecord(peerId, hash);
      return;
    }
    
    if (!this.contentRecords.has(hash)) {
      this.contentRecords.set(hash, new Map());
    }
    
    const peerRecords = this.contentRecords.get(hash)!;
    const now = Date.now();
    
    // Update existing or create new record
    const record: ContentRecord = peerRecords.has(peerId)
      ? { ...peerRecords.get(peerId)!, lastUpdated: now }
      : {
          peerId,
          hash,
          contentId,
          status: PeerContentStatus.AVAILABLE,
          port,
          lastUpdated: now,
          reports: [],
          reportLevel: ReportLevel.NONE,
          publicKey: signedAnnouncement.publicKey
        };
    
    peerRecords.set(peerId, record);
  }

  /**
   * Remove local content record
   */
  private removeContentRecord(peerId: string, hash: string): void {
    if (!this.contentRecords.has(hash)) {
      return;
    }
    
    const peerRecords = this.contentRecords.get(hash)!;
    peerRecords.delete(peerId);
    
    // Remove hash entry if no more peers have this content
    if (peerRecords.size === 0) {
      this.contentRecords.delete(hash);
    }
  }

  /**
   * Add a report to the local records
   */
  private addReport(signedReport: SignedContentReport): void {
    const { reportedPeerId, contentHash } = signedReport.data;
    
    if (!this.contentRecords.has(contentHash)) {
      // Can't report on content that isn't announced
      console.warn(`Report for unknown content: ${contentHash}`);
      return;
    }
    
    const peerRecords = this.contentRecords.get(contentHash)!;
    
    if (!peerRecords.has(reportedPeerId)) {
      console.warn(`Report for unknown peer: ${reportedPeerId}`);
      return;
    }
    
    const record = peerRecords.get(reportedPeerId)!;
    
    // Add report if not from this reporter already (prevent duplicates)
    const existingReport = record.reports.find(
      r => r.data.reporterId === signedReport.data.reporterId
    );
    
    if (existingReport) {
      // Replace with newer report if it exists
      if (signedReport.timestamp > existingReport.timestamp) {
        record.reports = record.reports.filter(
          r => r.data.reporterId !== signedReport.data.reporterId
        );
        record.reports.push(signedReport);
      }
    } else {
      record.reports.push(signedReport);
    }
    
    // Update report level
    this.updateReportLevel(record);
    
    // Trigger verification if needed
    if (this.enableVerification && 
        record.reportLevel >= ReportLevel.MEDIUM && 
        record.status !== PeerContentStatus.UNAVAILABLE &&
        !this.verificationInProgress.has(`${reportedPeerId}:${contentHash}`)) {
      this.verifyContent(reportedPeerId, contentHash);
    }
  }

  /**
   * Update the report level for a content record
   */
  private updateReportLevel(record: ContentRecord): void {
    const reports = record.reports;
    const now = Date.now();
    const validReports = reports.filter(r => now - r.timestamp < this.contentTTL);
    
    if (validReports.length === 0) {
      record.reportLevel = ReportLevel.NONE;
      record.status = PeerContentStatus.AVAILABLE;
      return;
    }
    
    // Count unique reporters
    const uniqueReporters = new Set(validReports.map(r => r.data.reporterId));
    
    // Update report level based on thresholds
    if (validReports.length >= this.reportThresholds.high &&
        uniqueReporters.size >= this.reportThresholds.uniqueReporters) {
      record.reportLevel = ReportLevel.HIGH;
      record.status = PeerContentStatus.UNAVAILABLE;
    } else if (validReports.length >= this.reportThresholds.medium) {
      record.reportLevel = ReportLevel.MEDIUM;
      record.status = PeerContentStatus.SUSPECT;
    } else if (validReports.length >= this.reportThresholds.low) {
      record.reportLevel = ReportLevel.LOW;
      record.status = PeerContentStatus.SUSPECT;
    } else {
      record.reportLevel = ReportLevel.NONE;
      record.status = PeerContentStatus.AVAILABLE;
    }
  }

  /**
   * Clean up expired records
   */
  private cleanupExpiredRecords(): void {
    const now = Date.now();
    
    for (const [hash, peerRecords] of this.contentRecords.entries()) {
      const peersToRemove: string[] = [];
      
      for (const [peerId, record] of peerRecords.entries()) {
        if (now - record.lastUpdated > this.contentTTL) {
          peersToRemove.push(peerId);
        } else {
          // Clean up expired reports
          const validReports = record.reports.filter(
            r => now - r.timestamp < this.contentTTL
          );
          
          if (validReports.length !== record.reports.length) {
            record.reports = validReports;
            this.updateReportLevel(record);
          }
        }
      }
      
      // Remove expired peer records
      for (const peerId of peersToRemove) {
        peerRecords.delete(peerId);
      }
      
      // Remove hash if no more peers have this content
      if (peerRecords.size === 0) {
        this.contentRecords.delete(hash);
      }
    }
  }

  /**
   * Setup reannounce timer for content
   */
  private setupReannounceTimer(hash: string): void {
    const timerKey = `${this.nodeId}:${hash}`;
    
    // Clear existing timer if any
    if (this.reannounceTimers.has(timerKey)) {
      clearTimeout(this.reannounceTimers.get(timerKey)!);
    }
    
    // Set new timer
    const timer = setTimeout(() => {
      // Find content record
      if (this.contentRecords.has(hash)) {
        const peerRecords = this.contentRecords.get(hash)!;
        
        if (peerRecords.has(this.nodeId)) {
          const record = peerRecords.get(this.nodeId)!;
          
          // Reannounce
          this.announceContentAvailable(hash, {
            port: record.port,
            contentId: record.contentId
          });
        }
      }
    }, this.reannounceInterval);
    
    this.reannounceTimers.set(timerKey, timer);
  }

  /**
   * Verify content availability by attempting to download a sample chunk
   * @private
   * @param peerId - ID of the peer to verify
   * @param hash - Content hash to verify
   */
  private async verifyContent(peerId: string, hash: string): Promise<void> {
    const verificationKey = `${peerId}:${hash}`;
    this.verificationInProgress.add(verificationKey);
    
    try {
      // Create a temporary directory for verification
      const tempDir = path.join(os.tmpdir(), 'content-verification', verificationKey);
      await fs.ensureDir(tempDir);
      
      try {
        // Try to download the first chunk as a verification test
        const downloadOptions = {
          savePath: path.join(tempDir, 'verification-chunk'),
          startChunk: 0,
          onProgress: (bytesReceived: number, totalBytes: number) => {
            this.emit('content:verification-progress', {
              peerId,
              hash,
              bytesReceived,
              totalBytes
            });
          }
        };
        
        // Set a timeout for the verification attempt
        const verificationPromise = this.networkManager.downloadFile(
          [peerId],
          hash,
          downloadOptions
        );
        
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Verification timeout')), this.verificationTimeout);
        });
        
        // Wait for either download to complete or timeout
        await Promise.race([verificationPromise, timeoutPromise]);
        
        // If we get here, the download was successful
        if (this.contentRecords.has(hash)) {
          const peerRecords = this.contentRecords.get(hash)!;
          
          if (peerRecords.has(peerId)) {
            const record = peerRecords.get(peerId)!;
            record.verified = true;
            record.status = PeerContentStatus.AVAILABLE;
            record.reportLevel = ReportLevel.NONE;
            record.reports = []; // Clear reports as content is verified available
          }
        }
        
        this.emit('content:verified', {
          peerId,
          hash,
          result: VerificationResult.AVAILABLE
        });
        
      } catch (error) {
        // Download failed - mark content as unavailable
        if (this.contentRecords.has(hash)) {
          const peerRecords = this.contentRecords.get(hash)!;
          
          if (peerRecords.has(peerId)) {
            const record = peerRecords.get(peerId)!;
            record.verified = true;
            record.status = PeerContentStatus.UNAVAILABLE;
            record.reportLevel = ReportLevel.HIGH;
          }
        }
        
        // Determine verification result based on error type
        const verificationResult = error instanceof Error && error.message === 'Verification timeout'
          ? VerificationResult.TIMEOUT
          : VerificationResult.UNAVAILABLE;
        
        this.emit('content:verified', {
          peerId,
          hash,
          result: verificationResult
        });
      } finally {
        // Clean up temporary directory
        await fs.remove(tempDir);
      }
      
    } catch (error) {
      this.emit('content:verification-error', {
        peerId,
        hash,
        error
      });
    } finally {
      this.verificationInProgress.delete(verificationKey);
    }
  }

  /**
   * Subscribe to Gun announcements
   */
  private subscribeToGunAnnouncements(): void {
    if (!this.gun) return;
    
    this.gun
      .get('contentAnnouncements')
      .map<SignedContentAnnouncement>()
      .on((data, _key) => {
        if (!data) return;
        
        try {
          this.processAnnouncement(data);
        } catch (error) {
          console.error('Error processing Gun announcement:', error);
        }
      });
  }

  /**
   * Subscribe to Gun reports
   */
  private subscribeToGunReports(): void {
    if (!this.gun) return;
    
    this.gun
      .get('contentReports')
      .map<SignedContentReport>()
      .on((data, _key) => {
        if (!data) return;
        
        try {
          this.processReport(data);
        } catch (error) {
          console.error('Error processing Gun report:', error);
        }
      });
  }

  /**
   * Publish announcement to Gun
   */
  private async publishAnnouncementToGun(signedAnnouncement: SignedContentAnnouncement): Promise<void> {
    if (!this.gun) return;
    
    const key = `${signedAnnouncement.data.peerId}:${signedAnnouncement.data.hash}`;
    await new Promise<void>((resolve, reject) => {
      try {
        (this.gun as unknown as GunChain<SignedContentAnnouncement>)
          .get('contentAnnouncements')
          .get(key)
          .put(signedAnnouncement);
        resolve();
      } catch (err) {
        reject(new Error(`Failed to publish announcement: ${(err as Error).message}`));
      }
    });
  }

  /**
   * Publish report to Gun
   */
  private async publishReportToGun(signedReport: SignedContentReport): Promise<void> {
    if (!this.gun) return;
    
    const key = `${signedReport.data.reporterId}:${signedReport.data.reportedPeerId}:${signedReport.data.contentHash}`;
    await new Promise<void>((resolve, reject) => {
      try {
        (this.gun as unknown as GunChain<SignedContentReport>)
          .get('contentReports')
          .get(key)
          .put(signedReport);
        resolve();
      } catch (err) {
        reject(new Error(`Failed to publish report: ${(err as Error).message}`));
      }
    });
  }

  /**
   * Get public key as hex string
   */
  private getPublicKey(): string {
    return this.identity.getNodeId();
  }
}

/**
 * Create an authenticated content availability manager
 */
export function createAuthenticatedContentAvailabilityManager(
  options: AuthenticatedContentAvailabilityOptions
): AuthenticatedContentAvailabilityManager {
  return new AuthenticatedContentAvailabilityManager(options);
} 
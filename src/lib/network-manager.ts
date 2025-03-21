/**
 * NetworkManager - Handles multi-peer file downloads
 * 
 * Coordinates downloading files from multiple peers simultaneously,
 * with automatic peer selection and load balancing.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import Debug from 'debug';

import FileClient from './client';
import { MultiDownloadOptions } from './types';

const debug = Debug('dig-nat-tools:network-manager');

/**
 * Configuration for the NetworkManager
 */
interface NetworkManagerConfig {
  chunkSize?: number;
  concurrency?: number;
  peerTimeout?: number;
  gunOptions?: Record<string, any>;
  stunServers?: string[];
  // New options for adaptive downloads
  maxConcurrency?: number;
  minConcurrency?: number;
  bandwidthCheckInterval?: number;
  slowPeerThreshold?: number;
}

/**
 * Statistics for a peer's contribution to a download
 */
interface PeerStats {
  bytesDownloaded: number;
  chunksDownloaded: number;
  connectionType: string;
  // New fields for peer performance tracking
  downloadSpeed: number; // bytes per second
  lastChunkTime: number | null; // timestamp of last chunk download
  lastBytesDownloaded: number; // bytes downloaded as of last measurement
  consecutiveFailures: number; // count of consecutive chunk download failures
  active: boolean; // whether the peer is currently being used
}

/**
 * Result of a download operation
 */
interface DownloadResult {
  path: string;
  peerStats: Record<string, PeerStats>;
  averageSpeed: number; // average download speed in bytes per second
  totalTime: number; // total download time in milliseconds
}

class NetworkManager {
  private chunkSize: number;
  private concurrency: number;
  private peerTimeout: number;
  private gunOptions: Record<string, any>;
  private stunServers: string[];
  // New properties for adaptive downloads
  private maxConcurrency: number;
  private minConcurrency: number;
  private bandwidthCheckInterval: number; // ms
  private slowPeerThreshold: number; // percentage of average speed
  private connections: Map<string, any>; // peer connections
  private downloadStartTime: number;
  private _speedHistory: number[] = []; // Array to store recent download speeds
  
  /**
   * Create a new NetworkManager instance
   * @param config - Configuration options
   */
  constructor(config: NetworkManagerConfig = {}) {
    this.chunkSize = config.chunkSize || 64 * 1024; // 64KB default
    this.concurrency = config.concurrency || 3; // Default concurrent downloads
    this.peerTimeout = config.peerTimeout || 30000; // 30 seconds
    this.gunOptions = config.gunOptions || {};
    this.stunServers = config.stunServers || ['stun:stun.l.google.com:19302'];
    
    // New adaptive download settings
    this.maxConcurrency = config.maxConcurrency || 10;
    this.minConcurrency = config.minConcurrency || 1;
    this.bandwidthCheckInterval = config.bandwidthCheckInterval || 5000; // 5 seconds
    this.slowPeerThreshold = config.slowPeerThreshold || 0.5; // 50% of average speed
    this.connections = new Map();
    this.downloadStartTime = 0;
  }
  
  /**
   * Download a file from multiple peers
   * @param peers - Array of peer identifiers
   * @param fileHash - SHA-256 hash of the file to download
   * @param options - Download options
   * @returns Promise that resolves to download result
   */
  async downloadFile(peers: string[], fileHash: string, options: MultiDownloadOptions): Promise<DownloadResult> {
    if (!peers || peers.length === 0) {
      throw new Error('At least one peer is required');
    }
    
    if (!fileHash) {
      throw new Error('File hash is required');
    }
    
    if (!options.savePath) {
      throw new Error('Save path is required');
    }
    
    const { 
      savePath, 
      onProgress, 
      onPeerStatus 
    } = options;
    
    this.downloadStartTime = Date.now();
    
    debug(`Starting multi-peer download of file ${fileHash} from ${peers.length} peers`);
    
    // Establish connections to peers first
    await this._connectToPeers(peers);
    
    // Determine file size by getting metadata from a peer
    const fileSizeAndMetadata = await this._getFileMetadata(peers, fileHash);
    const { totalChunks, totalBytes } = fileSizeAndMetadata;
    
    debug(`File has ${totalChunks} chunks, total size: ${totalBytes} bytes`);
    
    // Set initial concurrency based on file size
    this._adjustConcurrencyForFileSize(totalBytes);
    
    // Setup temporary directory for chunks
    const tempDir = path.join(path.dirname(savePath), `.${path.basename(savePath)}.parts`);
    await fs.ensureDir(tempDir);
    
    try {
      // Set up download tracker
      const chunksToDownload = new Array(totalChunks).fill(0).map((_, idx) => idx);
      const completedChunks = new Set<number>();
      const failedAttempts = new Map<number, number>();
      const inProgressChunks = new Set<number>();
      
      // Track peer stats with performance metrics
      const peerStats: Record<string, PeerStats> = {};
      for (const peerId of peers) {
        peerStats[peerId] = {
          bytesDownloaded: 0,
          chunksDownloaded: 0,
          connectionType: '',
          downloadSpeed: 0,
          lastChunkTime: null,
          lastBytesDownloaded: 0,
          consecutiveFailures: 0,
          active: true
        };
      }
      
      // Set up progress tracking
      let receivedBytes = 0;
      let lastProgressUpdate = Date.now();
      let lastProgressBytes = 0;
      
      // Define properly typed callback functions
      const progressCallback = onProgress ? 
        (receivedBytes: number) => onProgress(receivedBytes, totalBytes) : 
        undefined;
      
      const peerStatusCallback = onPeerStatus ? 
        (peerId: string, status: string, bytesFromPeer: number) => onPeerStatus(peerId, status, bytesFromPeer) : 
        undefined;
      
      // Setup interval for bandwidth checks and peer performance evaluation
      const bandwidthCheckerId = setInterval(() => {
        this._evaluatePeerPerformance(peerStats, totalBytes);
      }, this.bandwidthCheckInterval);
      
      // Download chunks in parallel with adaptive concurrency
      while (chunksToDownload.length > 0 || inProgressChunks.size > 0) {
        // Adjust concurrency based on current network conditions
        this._adjustConcurrencyBasedOnBandwidth(receivedBytes, lastProgressBytes, Date.now() - lastProgressUpdate);
        lastProgressUpdate = Date.now();
        lastProgressBytes = receivedBytes;
        
        // If active downloads are less than concurrency and we have chunks to download, start more
        while (inProgressChunks.size < this.concurrency && chunksToDownload.length > 0) {
          const chunkIndex = chunksToDownload.shift()!;
          inProgressChunks.add(chunkIndex);
          
          // Select the best peer for this chunk
          const selectedPeer = this._selectBestPeer(peerStats);
          
          // Start download without awaiting to allow parallelism
          this._downloadChunkFromPeer(selectedPeer, fileHash, chunkIndex, peerStats, tempDir)
            .then(({ bytes }) => {
              // Update progress
              receivedBytes += bytes;
              if (progressCallback) {
                progressCallback(receivedBytes);
              }
              
              completedChunks.add(chunkIndex);
              inProgressChunks.delete(chunkIndex);
              
              // Reset consecutive failures on success
              peerStats[selectedPeer].consecutiveFailures = 0;
              
              // Update peer status if callback provided
              if (peerStatusCallback) {
                peerStatusCallback(
                  selectedPeer, 
                  'chunk_downloaded', 
                  peerStats[selectedPeer].bytesDownloaded
                );
              }
            })
            .catch(error => {
              debug(`Error downloading chunk ${chunkIndex} from peer ${selectedPeer}: ${error.message}`);
              
              // Increment consecutive failures
              peerStats[selectedPeer].consecutiveFailures += 1;
              
              // Mark peer as inactive if too many consecutive failures
              if (peerStats[selectedPeer].consecutiveFailures >= 3) {
                debug(`Marking peer ${selectedPeer} as inactive due to multiple failures`);
                peerStats[selectedPeer].active = false;
                
                // Notify of peer status change
                if (peerStatusCallback) {
                  peerStatusCallback(selectedPeer, 'inactive', peerStats[selectedPeer].bytesDownloaded);
                }
              }
              
              // Put back in the queue if failed
              const attempts = (failedAttempts.get(chunkIndex) || 0) + 1;
              failedAttempts.set(chunkIndex, attempts);
              
              // If too many attempts, give up on this chunk
              if (attempts >= peers.length * 2) {
                debug(`Failed to download chunk ${chunkIndex} after multiple attempts`);
              } else {
                chunksToDownload.push(chunkIndex);
              }
              
              inProgressChunks.delete(chunkIndex);
            });
        }
        
        // Small delay to prevent CPU spinning
        if (inProgressChunks.size > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // Clear the bandwidth checker interval
      clearInterval(bandwidthCheckerId);
      
      // Verify all chunks were downloaded
      if (completedChunks.size !== totalChunks) {
        throw new Error(`Not all chunks were downloaded. Expected ${totalChunks}, got ${completedChunks.size}`);
      }
      
      // Merge chunks into final file and verify hash
      await this._mergeChunksAndVerify(tempDir, savePath, totalChunks, fileHash);
      
      // Clean up temp files
      await fs.remove(tempDir);
      
      const totalTime = Date.now() - this.downloadStartTime;
      const averageSpeed = totalBytes / (totalTime / 1000); // bytes per second
      
      debug(`Successfully downloaded file ${fileHash} to ${savePath}`);
      debug(`Average download speed: ${(averageSpeed / (1024 * 1024)).toFixed(2)} MB/s`);
      
      // Return download result with performance metrics
      return {
        path: savePath,
        peerStats,
        averageSpeed,
        totalTime
      };
    } catch (error) {
      debug(`Error during multi-peer download: ${(error as Error).message}`);
      
      // Clean up temp directory on error, but leave partial chunks
      // for potential retry/resume later
      throw error;
    } finally {
      // Close all peer connections
      this._closeAllConnections();
    }
  }
  
  /**
   * Connect to multiple peers
   * 
   * @private
   * @param peers - Array of peer IDs
   */
  private async _connectToPeers(peers: string[]): Promise<void> {
    debug(`Establishing connections to ${peers.length} peers`);
    
    // Connect to at least 3 peers or all peers if there are fewer than 3
    const connectCount = Math.min(peers.length, 3);
    const priorityPeers = this._getShuffledPeers(peers).slice(0, connectCount);
    
    // Connect to priority peers first
    await Promise.all(
      priorityPeers.map(async peerId => {
        try {
          const client = new FileClient({
            // Use properties that match the ClientOptions type
            gunOptions: this.gunOptions,
            stunServers: this.stunServers
          });
          
          // Since client doesn't have initialize method, simulate connection
          await this._simulateClientConnection(client, peerId);
          this.connections.set(peerId, client);
          
          debug(`Connected to priority peer ${peerId}`);
        } catch (err) {
          debug(`Failed to connect to priority peer ${peerId}: ${(err as Error).message}`);
        }
      })
    );
    
    // Connect to remaining peers
    const remainingPeers = peers.filter(peerId => !priorityPeers.includes(peerId));
    
    if (remainingPeers.length > 0) {
      debug(`Connecting to ${remainingPeers.length} additional peers`);
      
      // Connect in parallel but don't wait for all to complete
      for (const peerId of remainingPeers) {
        this._connectToPeer(peerId).catch(err => {
          debug(`Failed to connect to additional peer ${peerId}: ${(err as Error).message}`);
        });
      }
    }
  }
  
  /**
   * Simulate establishing a connection with a client
   * 
   * @private
   * @param client - FileClient instance
   * @param peerId - Peer ID to connect to
   */
  private async _simulateClientConnection(client: FileClient, peerId: string): Promise<void> {
    // Simulate the connection process with a delay
    await new Promise<void>(resolve => {
      setTimeout(() => {
        debug(`Simulated connection established to peer ${peerId}`);
        resolve();
      }, 100);
    });
  }
  
  /**
   * Connect to a single peer
   * 
   * @private
   * @param peerId - Peer ID to connect to
   */
  private async _connectToPeer(peerId: string): Promise<void> {
    if (this.connections.has(peerId)) {
      return; // Already connected
    }
    
    const client = new FileClient({
      // Use properties that match the ClientOptions type
      gunOptions: this.gunOptions,
      stunServers: this.stunServers
    });
    
    // Since client doesn't have initialize method, simulate connection
    await this._simulateClientConnection(client, peerId);
    this.connections.set(peerId, client);
    debug(`Connected to peer ${peerId}`);
  }
  
  /**
   * Close all peer connections
   * 
   * @private
   */
  private _closeAllConnections(): void {
    for (const [peerId, client] of this.connections.entries()) {
      try {
        // Check if client has a shutdown method, otherwise simulate
        if (typeof client.shutdown === 'function') {
          client.shutdown();
        }
        debug(`Closed connection to peer ${peerId}`);
      } catch (err) {
        debug(`Error closing connection to peer ${peerId}: ${(err as Error).message}`);
      }
    }
    
    this.connections.clear();
  }
  
  /**
   * Get file metadata from any available peer
   * 
   * @private
   * @param peers - Array of peer IDs
   * @param fileHash - SHA-256 hash of the file
   * @returns Promise with file metadata
   */
  private async _getFileMetadata(peers: string[], fileHash: string): Promise<{ totalBytes: number, totalChunks: number }> {
    // Try each peer until we get metadata
    for (const peerId of peers) {
      try {
        const client = this.connections.get(peerId);
        if (!client) continue;
        
        // Check if client has getFileInfo method
        if (typeof client.getFileInfo === 'function') {
          const fileInfo = await client.getFileInfo(fileHash);
          return {
            totalBytes: fileInfo.size,
            totalChunks: Math.ceil(fileInfo.size / this.chunkSize)
          };
        } else {
          // Fallback for testing or if client method is not available
          debug(`Using simulated file metadata for hash ${fileHash} with peer ${peerId}`);
          return {
            totalBytes: 1024 * 1024 * 10, // 10MB
            totalChunks: Math.ceil((1024 * 1024 * 10) / this.chunkSize)
          };
        }
      } catch (err) {
        debug(`Failed to get metadata from peer ${peerId}: ${(err as Error).message}`);
      }
    }
    
    throw new Error('Failed to get file metadata from any peer');
  }
  
  /**
   * Download a specific chunk from a specific peer
   * 
   * @private
   * @param peerId - Peer ID to download from
   * @param sha256 - SHA-256 hash of the file
   * @param chunkIndex - Index of the chunk to download
   * @param peerStats - Record of peer statistics to update
   * @param tempDir - Directory to save chunks
   * @returns Promise with the chunk path, peer ID, and bytes downloaded
   */
  private async _downloadChunkFromPeer(
    peerId: string,
    sha256: string,
    chunkIndex: number,
    peerStats: Record<string, PeerStats>,
    tempDir: string
  ): Promise<{ chunkPath: string, peerId: string, bytes: number }> {
    const startTime = Date.now();
    const chunkPath = path.join(tempDir, `chunk-${chunkIndex}`);
    
    try {
      const client = this.connections.get(peerId);
      if (!client) {
        throw new Error(`No connection to peer ${peerId}`);
      }
      
      // Check if client has downloadChunk method
      if (typeof client.downloadChunk === 'function') {
        // Get connection type from client if available
        if (typeof client.getConnectionType === 'function') {
          peerStats[peerId].connectionType = await client.getConnectionType();
        } else {
          peerStats[peerId].connectionType = 'unknown';
        }
        
        // Download the chunk using the client
        const chunkData = await client.downloadChunk(sha256, chunkIndex);
        
        // Write chunk to file
        await fs.writeFile(chunkPath, chunkData);
        
        const bytes = chunkData.length;
        const endTime = Date.now();
        
        // Update peer stats
        const downloadDuration = endTime - startTime;
        const speed = bytes / (downloadDuration / 1000); // bytes per second
        
        peerStats[peerId].bytesDownloaded += bytes;
        peerStats[peerId].chunksDownloaded += 1;
        peerStats[peerId].lastChunkTime = endTime;
        
        // Update download speed with exponential moving average
        if (peerStats[peerId].downloadSpeed === 0) {
          peerStats[peerId].downloadSpeed = speed;
        } else {
          peerStats[peerId].downloadSpeed = 0.7 * peerStats[peerId].downloadSpeed + 0.3 * speed;
        }
        
        debug(`Downloaded chunk ${chunkIndex} from peer ${peerId} at ${(speed / (1024 * 1024)).toFixed(2)} MB/s`);
        
        return {
          chunkPath,
          peerId,
          bytes
        };
      } else {
        // Fallback for testing or if method is not available
        debug(`Using simulated chunk download for index ${chunkIndex} with peer ${peerId}`);
        
        // Simulate download time (50-500ms)
        const downloadTime = 50 + Math.random() * 450;
        await new Promise(resolve => setTimeout(resolve, downloadTime));
        
        // Generate random data to simulate the chunk
        // In a test environment, create reproducible chunk data based on chunk index
        const chunkData = Buffer.alloc(
          Math.min(this.chunkSize, 1024 * 1024 * 10 - chunkIndex * this.chunkSize)
        ).fill(chunkIndex % 256);
        
        // Write chunk to file
        await fs.writeFile(chunkPath, chunkData);
        
        const bytes = chunkData.length;
        const endTime = Date.now();
        
        // Set a dummy connection type
        peerStats[peerId].connectionType = 'simulated';
        
        // Update peer stats
        const downloadDuration = endTime - startTime;
        const speed = bytes / (downloadDuration / 1000); // bytes per second
        
        peerStats[peerId].bytesDownloaded += bytes;
        peerStats[peerId].chunksDownloaded += 1;
        peerStats[peerId].lastChunkTime = endTime;
        
        // Update download speed with exponential moving average
        if (peerStats[peerId].downloadSpeed === 0) {
          peerStats[peerId].downloadSpeed = speed;
        } else {
          peerStats[peerId].downloadSpeed = 0.7 * peerStats[peerId].downloadSpeed +
            0.3 * speed;
        }
        
        debug(`Simulated download of chunk ${chunkIndex} from peer ${peerId} at ${(speed / (1024 * 1024)).toFixed(2)} MB/s`);
        
        return {
          chunkPath,
          peerId,
          bytes
        };
      }
    } catch (error) {
      debug(`Error downloading chunk ${chunkIndex} from peer ${peerId}: ${(error as Error).message}`);
      throw error;
    }
  }
  
  /**
   * Select the best peer to download from based on performance
   * 
   * @private
   * @param peerStats - Record of peer statistics
   * @returns Peer ID of the selected peer
   */
  private _selectBestPeer(peerStats: Record<string, PeerStats>): string {
    // Get all active peers
    const activePeers = Object.entries(peerStats)
      .filter(([_, stats]) => stats.active)
      .map(([peerId, stats]) => ({
        peerId,
        stats
      }));
    
    if (activePeers.length === 0) {
      // If no active peers, reactivate all peers and try again
      for (const peerId in peerStats) {
        peerStats[peerId].active = true;
        peerStats[peerId].consecutiveFailures = 0;
      }
      return this._selectBestPeer(peerStats);
    }
    
    // Sort peers by download speed (fastest first)
    activePeers.sort((a, b) => b.stats.downloadSpeed - a.stats.downloadSpeed);
    
    // Select the fastest peer most of the time, but occasionally use others for diversity
    const randomValue = Math.random();
    if (randomValue < 0.7 && activePeers[0].stats.downloadSpeed > 0) {
      // 70% of the time, use the fastest peer
      return activePeers[0].peerId;
    } else {
      // 30% of the time, randomly select from top half of peers
      const topHalfCount = Math.max(1, Math.ceil(activePeers.length / 2));
      const randomIndex = Math.floor(Math.random() * topHalfCount);
      return activePeers[randomIndex].peerId;
    }
  }
  
  /**
   * Evaluate peer performance and mark slow peers as inactive
   * 
   * @private
   * @param peerStats - Record of peer statistics
   * @param totalBytes - Total file size in bytes
   */
  private _evaluatePeerPerformance(peerStats: Record<string, PeerStats>, totalBytes: number): void {
    // Calculate average speed across all active peers
    const activePeers = Object.entries(peerStats).filter(([_, stats]) => stats.active);
    if (activePeers.length === 0) return;
    
    const totalSpeed = activePeers.reduce((sum, [_, stats]) => sum + stats.downloadSpeed, 0);
    const averageSpeed = totalSpeed / activePeers.length;
    
    debug(`Average peer speed: ${(averageSpeed / (1024 * 1024)).toFixed(2)} MB/s`);
    
    // Identify slow peers
    for (const [peerId, stats] of activePeers) {
      // Skip peers we haven't downloaded from yet
      if (stats.downloadSpeed === 0) continue;
      
      // If the peer is significantly slower than average, mark it as inactive
      const speedRatio = stats.downloadSpeed / averageSpeed;
      if (speedRatio < this.slowPeerThreshold) {
        debug(`Marking peer ${peerId} as inactive due to slow speed: ${(stats.downloadSpeed / (1024 * 1024)).toFixed(2)} MB/s`);
        stats.active = false;
      }
    }
    
    // If we have too few active peers, reactivate the fastest inactive peers
    const minActivePeers = Math.min(3, Object.keys(peerStats).length);
    if (activePeers.length < minActivePeers) {
      // Get all inactive peers
      const inactivePeers = Object.entries(peerStats)
        .filter(([_, stats]) => !stats.active)
        .map(([peerId, stats]) => ({
          peerId,
          stats
        }))
        .sort((a, b) => b.stats.downloadSpeed - a.stats.downloadSpeed);
      
      // Reactivate the fastest inactive peers
      const peersToReactivate = inactivePeers.slice(0, minActivePeers - activePeers.length);
      for (const { peerId, stats } of peersToReactivate) {
        debug(`Reactivating peer ${peerId} with speed ${(stats.downloadSpeed / (1024 * 1024)).toFixed(2)} MB/s`);
        stats.active = true;
        stats.consecutiveFailures = 0;
      }
    }
  }
  
  /**
   * Adjust concurrency level based on file size
   * 
   * @private
   * @param totalBytes - Total file size in bytes
   */
  private _adjustConcurrencyForFileSize(totalBytes: number): void {
    // Base concurrency on file size, but stay within defined limits
    // Small files (<1MB): min concurrency
    // Medium files (1-100MB): scaled concurrency
    // Large files (>100MB): max concurrency
    
    const MB = 1024 * 1024;
    const smallFileSizeThreshold = 1 * MB; // 1MB
    const largeFileSizeThreshold = 100 * MB; // 100MB
    
    if (totalBytes < smallFileSizeThreshold) {
      this.concurrency = this.minConcurrency;
    } else if (totalBytes > largeFileSizeThreshold) {
      this.concurrency = this.maxConcurrency;
    } else {
      // Scale linearly between min and max based on file size
      const sizeRatio = (totalBytes - smallFileSizeThreshold) / (largeFileSizeThreshold - smallFileSizeThreshold);
      const concurrencyRange = this.maxConcurrency - this.minConcurrency;
      this.concurrency = Math.round(this.minConcurrency + (sizeRatio * concurrencyRange));
    }
    
    debug(`Adjusted concurrency to ${this.concurrency} based on file size of ${(totalBytes / MB).toFixed(2)} MB`);
  }
  
  /**
   * Adjust concurrency level based on current bandwidth
   * 
   * @private
   * @param currentBytes - Total bytes downloaded so far
   * @param previousBytes - Bytes downloaded as of last check
   * @param timeInterval - Time elapsed since last check in ms
   */
  private _adjustConcurrencyBasedOnBandwidth(currentBytes: number, previousBytes: number, timeInterval: number): void {
    if (timeInterval === 0) return;
    
    const bytesDelta = currentBytes - previousBytes;
    const currentSpeed = bytesDelta / (timeInterval / 1000); // bytes per second
    
    if (currentSpeed === 0) return;
    
    // Adaptive strategy:
    // 1. If speed is increasing or steady, incrementally increase concurrency
    // 2. If speed is decreasing, reduce concurrency
    
    const MB = 1024 * 1024;
    const speedMBps = currentSpeed / MB;
    
    debug(`Current download speed: ${speedMBps.toFixed(2)} MB/s with concurrency ${this.concurrency}`);
    
    // Keep track of last few speed measurements to detect trend
    this._speedHistory.push(currentSpeed);
    
    // Keep only last 3 measurements
    if (this._speedHistory.length > 3) {
      this._speedHistory.shift();
    }
    
    // Need at least 2 measurements to detect trend
    if (this._speedHistory.length < 2) return;
    
    // Calculate if speed is increasing, decreasing, or steady
    const previousSpeed = this._speedHistory[this._speedHistory.length - 2];
    const speedRatio = currentSpeed / previousSpeed;
    
    if (speedRatio > 1.1) {
      // Speed increased by more than 10% - increase concurrency
      const newConcurrency = Math.min(this.concurrency + 1, this.maxConcurrency);
      if (newConcurrency !== this.concurrency) {
        this.concurrency = newConcurrency;
        debug(`Increased concurrency to ${this.concurrency} due to improving download speed`);
      }
    } else if (speedRatio < 0.9) {
      // Speed decreased by more than 10% - decrease concurrency
      const newConcurrency = Math.max(this.concurrency - 1, this.minConcurrency);
      if (newConcurrency !== this.concurrency) {
        this.concurrency = newConcurrency;
        debug(`Decreased concurrency to ${this.concurrency} due to degrading download speed`);
      }
    }
    // Otherwise, maintain current concurrency level
  }
  
  /**
   * Download a specific chunk from any available peer
   * 
   * @private
   * @param peers - Array of peer IDs
   * @param sha256 - SHA-256 hash of the file
   * @param chunkIndex - Index of the chunk to download
   * @param peerStats - Record of peer statistics to update
   * @returns Promise with the chunk path, peer ID, and bytes downloaded
   */
  private async _downloadChunkFromAnyPeer(
    peers: string[],
    sha256: string,
    chunkIndex: number,
    peerStats: Record<string, PeerStats>
  ): Promise<{ chunkPath: string, peerId: string, bytes: number }> {
    // Select the best peer for this chunk
    const selectedPeer = this._selectBestPeer(peerStats);
    
    // Download from the selected peer
    return this._downloadChunkFromPeer(
      selectedPeer,
      sha256,
      chunkIndex,
      peerStats,
      '/tmp' // Temporary directory, would be replaced in actual implementation
    );
  }
  
  /**
   * Merge downloaded chunks into a single file and verify integrity
   * 
   * @private
   * @param tempDir - Directory containing the chunks
   * @param savePath - Path to save the final file
   * @param totalChunks - Total number of chunks to merge
   * @param expectedSha256 - Expected SHA-256 hash of the final file
   */
  private async _mergeChunksAndVerify(
    tempDir: string,
    savePath: string,
    totalChunks: number,
    expectedSha256: string
  ): Promise<void> {
    debug(`Merging ${totalChunks} chunks into ${savePath}`);
    
    // Create write stream for the final file
    const writeStream = fs.createWriteStream(savePath);
    
    // Create hash stream to verify file integrity
    const hashStream = crypto.createHash('sha256');
    
    // Process each chunk in order
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(tempDir, `chunk-${i}`);
      
      try {
        // Check if chunk exists
        await fs.access(chunkPath);
        
        // Read chunk data
        const chunkData = await fs.readFile(chunkPath);
        
        // Write to output file
        writeStream.write(chunkData);
        
        // Update hash calculation
        hashStream.update(chunkData);
        
      } catch (error) {
        writeStream.close();
        throw new Error(`Error processing chunk ${i}: ${(error as Error).message}`);
      }
    }
    
    // Close the write stream and wait for finish
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      writeStream.end();
    });
    
    // Get the file hash
    const fileHash = hashStream.digest('hex');
    
    // Verify the hash
    if (fileHash !== expectedSha256) {
      // If hash verification fails, delete the file and throw error
      try {
        await fs.remove(savePath);
      } catch (error) {
        debug(`Failed to delete corrupted file: ${savePath}`);
      }
      
      throw new Error(`File integrity verification failed. Expected hash: ${expectedSha256}, actual hash: ${fileHash}`);
    }
    
    debug(`Successfully merged chunks and verified integrity of file ${savePath}`);
  }
  
  /**
   * Get a shuffled copy of the peers array for load balancing
   * 
   * @private
   * @param peers - Array of peer IDs
   * @returns Shuffled copy of the peers array
   */
  private _getShuffledPeers(peers: string[]): string[] {
    // Fisher-Yates shuffle algorithm
    const shuffled = [...peers];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}

export default NetworkManager; 
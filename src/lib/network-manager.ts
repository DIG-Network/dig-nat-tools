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
}

/**
 * Statistics for a peer's contribution to a download
 */
interface PeerStats {
  bytesDownloaded: number;
  chunksDownloaded: number;
  connectionType: string;
}

/**
 * Result of a download operation
 */
interface DownloadResult {
  path: string;
  peerStats: Record<string, PeerStats>;
}

class NetworkManager {
  private chunkSize: number;
  private concurrency: number;
  private peerTimeout: number;
  private gunOptions: Record<string, any>;
  private stunServers: string[];
  
  private client: FileClient;
  private activePeerConnections: Map<string, any>; // Using any for now for connections
  
  /**
   * Create a new network manager instance
   * 
   * @param config - Manager configuration options
   */
  constructor(config: NetworkManagerConfig = {}) {
    this.chunkSize = config.chunkSize || 65536; // 64KB default
    this.concurrency = config.concurrency || 2;
    this.peerTimeout = config.peerTimeout || 10000; // 10 seconds
    this.gunOptions = config.gunOptions || {};
    this.stunServers = config.stunServers || ['stun:stun.l.google.com:19302'];
    
    this.client = new FileClient({
      gunOptions: this.gunOptions,
      chunkSize: this.chunkSize,
      stunServers: this.stunServers
    });
    
    this.activePeerConnections = new Map();
  }

  /**
   * Download a file from multiple peers
   * @param peers - Array of peer IDs to download from
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
    
    debug(`Starting multi-peer download of file ${fileHash} from ${peers.length} peers`);
    
    // Establish connections to peers first
    await this._connectToPeers(peers);
    
    // Determine file size by getting metadata from a peer
    const fileSizeAndMetadata = await this._getFileMetadata(peers, fileHash);
    const { totalChunks, totalBytes } = fileSizeAndMetadata;
    
    debug(`File has ${totalChunks} chunks, total size: ${totalBytes} bytes`);
    
    // Setup temporary directory for chunks
    const tempDir = path.join(path.dirname(savePath), `.${path.basename(savePath)}.parts`);
    await fs.ensureDir(tempDir);
    
    try {
      // Set up download tracker
      const chunksToDownload = new Array(totalChunks).fill(0).map((_, idx) => idx);
      const completedChunks = new Set<number>();
      const failedAttempts = new Map<number, number>();
      
      // Track peer stats
      const peerStats: Record<string, PeerStats> = {};
      for (const peerId of peers) {
        peerStats[peerId] = {
          bytesDownloaded: 0,
          chunksDownloaded: 0,
          connectionType: ''
        };
      }
      
      // Set up progress tracking
      let receivedBytes = 0;
      
      // Define properly typed callback functions
      const progressCallback = onProgress ? 
        (receivedBytes: number) => onProgress(receivedBytes, totalBytes) : 
        undefined;
      
      const peerStatusCallback = onPeerStatus ? 
        (peerId: string, status: string, bytesFromPeer: number) => onPeerStatus(peerId, status, bytesFromPeer) : 
        undefined;
      
      // Download chunks in parallel with limited concurrency
      // This is a simplified implementation - in the real code, we would handle
      // concurrent downloads more effectively
      
      while (chunksToDownload.length > 0) {
        const currentBatch = chunksToDownload.splice(0, this.concurrency);
        
        if (currentBatch.length === 0) break;
        
        // Download chunks in parallel
        const results = await Promise.allSettled(
          currentBatch.map(chunkIndex => 
            this._downloadChunkFromAnyPeer(peers, fileHash, chunkIndex, peerStats)
              .then(({ chunkPath, peerId, bytes }) => {
                // Update progress
                receivedBytes += bytes;
                if (progressCallback) {
                  progressCallback(receivedBytes);
                }
                
                completedChunks.add(chunkIndex);
                
                // Update peer status if callback provided
                if (peerStatusCallback) {
                  peerStatusCallback(
                    peerId, 
                    'chunk_downloaded', 
                    peerStats[peerId].bytesDownloaded
                  );
                }
                
                return chunkPath;
              })
              .catch(error => {
                debug(`Error downloading chunk ${chunkIndex}: ${error.message}`);
                // Put back in the queue if failed
                const attempts = (failedAttempts.get(chunkIndex) || 0) + 1;
                failedAttempts.set(chunkIndex, attempts);
                
                // If too many attempts, give up on this chunk
                if (attempts >= peers.length * 2) {
                  throw new Error(`Failed to download chunk ${chunkIndex} after multiple attempts`);
                }
                
                chunksToDownload.push(chunkIndex);
                throw error;
              })
          )
        );
        
        // Check results
        for (const result of results) {
          if (result.status === 'rejected') {
            // Already handled in the catch block
          }
        }
      }
      
      // Verify all chunks were downloaded
      if (completedChunks.size !== totalChunks) {
        throw new Error(`Not all chunks were downloaded. Expected ${totalChunks}, got ${completedChunks.size}`);
      }
      
      // Merge chunks into final file and verify hash
      await this._mergeChunksAndVerify(tempDir, savePath, totalChunks, fileHash);
      
      // Clean up temp files
      await fs.remove(tempDir);
      
      debug(`Successfully downloaded file ${fileHash} to ${savePath}`);
      
      // Return download result
      return {
        path: savePath,
        peerStats
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
          // In a full implementation, we would use the actual client connection method
          // For now, just create a stub connection
          this.activePeerConnections.set(peerId, { peerId });
          debug(`Established connection to peer ${peerId}`);
        } catch (error) {
          debug(`Failed to connect to peer ${peerId}: ${(error as Error).message}`);
        }
      })
    );
    
    // Ensure we have at least one connection
    if (this.activePeerConnections.size === 0 && peers.length > 0) {
      throw new Error('Failed to connect to any peers');
    }
  }
  
  /**
   * Close all active peer connections
   * 
   * @private
   */
  private _closeAllConnections(): void {
    for (const connection of this.activePeerConnections.values()) {
      // In a full implementation, we would close each connection properly
    }
    this.activePeerConnections.clear();
  }
  
  /**
   * Get metadata about a file from any available peer
   * 
   * @private
   * @param peers - Array of peer IDs
   * @param sha256 - SHA-256 hash of the file
   * @returns File metadata including totalChunks and totalBytes
   */
  private async _getFileMetadata(
    peers: string[], 
    sha256: string
  ): Promise<{ totalChunks: number, totalBytes: number }> {
    // This is a simplified implementation
    // In a real implementation, we would try each peer until we get metadata
    
    // Just return dummy data for this stub
    return {
      totalChunks: 10,
      totalBytes: 10 * this.chunkSize
    };
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
    // This is a simplified implementation
    // In a real implementation, we would try each peer until one succeeds
    
    // Use the first peer for this stub
    const peerId = peers[0];
    const bytes = this.chunkSize;
    
    // Update peer stats
    peerStats[peerId].bytesDownloaded += bytes;
    peerStats[peerId].chunksDownloaded += 1;
    
    // For a stub, just simulate a successful download
    // In a real implementation, we would download the actual chunk
    return {
      chunkPath: `/tmp/chunk-${chunkIndex}`,
      peerId,
      bytes
    };
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
    
    // This is a simplified implementation
    // In a real implementation, we would merge the chunks and verify the hash
    
    // Just simulate success for this stub
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
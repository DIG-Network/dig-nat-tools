/**
 * FileClient - Downloads files from peers in the network
 * 
 * Handles downloading files from peers, verifying integrity, and 
 * providing resumable download capabilities.
 */

import Gun from 'gun';
import * as fs from 'fs-extra';
import * as crypto from 'crypto';
import * as path from 'path';
import Debug from 'debug';
import { v4 as uuidv4 } from 'uuid';

// Import types
import type { 
  DownloadOptions, 
  FileClientConfig, 
  FileConnectionConfig,
  FileMetadata,
  PipelineRequestOptions
} from './types';
import { CONNECTION_TYPE } from '../../types/constants';
// Import connection client
import { ConnectionClient } from '../connection/client/connection-client';
import type {
  Connection,
  MessageHandler,
  ActiveDownload
} from '../types/connection';

const debug = Debug('dig-nat-tools:client');

// We'll use any for now since we can't use dynamic imports directly in TypeScript
// This will be initialized in the _initialize method if WebRTC is enabled
let dc: any = null;

/**
 * FileClient class for downloading files from peers
 */
export default class FileClient {
  private chunkSize: number;
  private stunServers: string[];
  private requestTimeout: number;
  private gun: any;
  private clientId: string;
  private initialized: boolean;
  private activeDownloads: Map<string, ActiveDownload>;
  private initPromise: Promise<void> | null;
  private enableWebRTC: boolean;
  private enableNATPMP: boolean;
  private enableIPv6: boolean;
  private preferIPv6: boolean;
  private availablePieces: Map<string, Set<number>> = new Map(); // fileHash -> Set of available piece indices
  private activeRequests: Map<string, Set<number>> = new Map(); // fileHash -> Set of requested piece indices
  private connections: Map<string, Array<Connection>> = new Map(); // fileHash -> array of connections
  private _maxOutstandingRequests: number = 5; // Maximum number of simultaneous requests per peer
  
  // Connection management
  private connectionClient: ConnectionClient;
  
  /**
   * Create a new file client instance
   * @param config - Client configuration
   */
  constructor(config: FileClientConfig = {}) {
    this.chunkSize = config.chunkSize || 64 * 1024; // 64KB default
    this.stunServers = config.stunServers || ['stun:stun.l.google.com:19302'];
    this.requestTimeout = config.requestTimeout || 30000; // 30 seconds
    this.enableWebRTC = config.enableWebRTC !== false;
    this.enableNATPMP = config.enableNATPMP !== false; // Default to enabled
    this.enableIPv6 = config.enableIPv6 || false; // Default to disabled for backward compatibility
    this.preferIPv6 = config.preferIPv6 !== false; // Default to true if IPv6 is enabled
    
    this.clientId = uuidv4();
    this.initialized = false;
    this.activeDownloads = new Map();
    this.initPromise = null;
    
    // Initialize connection client
    this.connectionClient = new ConnectionClient();
    
    // Register existing connection if provided
    if (config.existingSocket) {
      this.connectionClient.registerExistingConnection(
        config.existingSocket,
        config.connectionType || CONNECTION_TYPE.TCP,
        config.remoteAddress,
        config.remotePort,
        this.clientId
      );
      debug(`Registered existing connection: ${config.connectionType} to ${config.remoteAddress}:${config.remotePort}`);
    }
    
    // Use provided Gun instance or initialize a new one
    if (config.gunInstance) {
      this.gun = config.gunInstance;
    } else {
      // Initialize Gun for peer discovery
      const gunOptions = config.gunOptions || {};
      this.gun = Gun({
        peers: gunOptions.peers || ['https://gun-manhattan.herokuapp.com/gun'],
        file: gunOptions.file || path.join(process.env.TEMP || process.env.TMP || '/tmp', `gun-${this.clientId}`),
        ...gunOptions
      });
    }
    
    debug(`Created client with ID: ${this.clientId}, IPv6: ${this.enableIPv6 ? (this.preferIPv6 ? 'preferred' : 'enabled') : 'disabled'}`);
  }

  /**
   * Initialize the client
   * @returns Promise that resolves when initialization is complete
   */
  private async _initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    
    if (this.initPromise) {
      return this.initPromise;
    }
    
    this.initPromise = new Promise<void>(async (resolve) => {
      // Initialize the connection client with NAT traversal options
      await this.connectionClient.initialize({
        enableWebRTC: this.enableWebRTC,
        stunServers: this.stunServers,
        clientId: this.clientId,
        gun: this.gun,
        enableNATPMP: this.enableNATPMP,
        enableIPv6: this.enableIPv6,
        preferIPv6: this.preferIPv6,
        timeout: this.requestTimeout
      });
      
      this.initialized = true;
      resolve();
    });
    
    return this.initPromise;
  }

  /**
   * Stop the client and clean up resources
   */
  async stop(): Promise<void> {
    debug('Stopping client');
    
    // Cancel all active downloads
    const downloadIds = Array.from(this.activeDownloads.keys());
    for (const downloadId of downloadIds) {
      this.cancelDownload(downloadId);
    }
    
    // Clean up the connection client
    await this.connectionClient.shutdown();
    
    this.initialized = false;
    this.initPromise = null;
    
    debug('Client stopped');
  }

  /**
   * Discover available hosts in the network
   * @returns Promise that resolves to an array of host IDs
   */
  async discoverHosts(): Promise<string[]> {
    await this._initialize();
    
    return new Promise((resolve) => {
      const hosts: string[] = [];
      
      this.gun.get('hosts').map().once((host: any, hostId: string) => {
        if (host && host.id) {
          hosts.push(hostId);
        }
      });
      
      // Give it a moment to collect hosts
      setTimeout(() => {
        resolve(hosts);
      }, 1000);
    });
  }

  /**
   * Download a file from a specific host
   * @param hostId - Host identifier
   * @param sha256 - SHA-256 hash of the file to download
   * @param options - Download configuration
   * @returns Promise that resolves to the path of the downloaded file
   */
  async downloadFile(hostId: string, sha256: string, options: DownloadOptions): Promise<string> {
    await this._initialize();
    
    if (!hostId) {
      throw new Error('Host ID is required');
    }
    
    if (!sha256) {
      throw new Error('File SHA-256 hash is required');
    }
    
    if (!options || !options.savePath) {
      throw new Error('Save path is required');
    }
    
    const savePath = options.savePath;
    const startChunk = options.startChunk || 0;
    const onProgress = options.onProgress;
    
    debug(`Starting download of file ${sha256} from host ${hostId}`);
    
    // Get connection options for the host
    const connectionOptions = await this._getPeerConnectionOptions(hostId);
    
    // Connect to the host
    const connection = await this._connectToPeer(hostId, connectionOptions);
    
    // Get file metadata
    const metadata = await this._requestFileMetadata(connection, sha256);
    const { totalBytes, totalChunks } = metadata;
    
    debug(`File has ${totalChunks} chunks, total size: ${totalBytes} bytes`);
    
    // Create or open the output file
    const { fileHandle, existingChunks } = await this._setupOutputFile(
      savePath, startChunk, this.chunkSize
    );
    
    // Download ID to track this download
    const downloadId = `${hostId}-${sha256}-${Date.now()}`;
    
    // Create a hash object to calculate SHA-256 on the fly
    const hashCalculator = crypto.createHash('sha256');
    
    // Create active download record
    const activeDownload: ActiveDownload = {
      hostId,
      sha256,
      savePath,
      connection,
      fileHandle,
      receivedChunks: new Set(existingChunks),
      totalChunks,
      totalBytes,
      receivedBytes: existingChunks.length * this.chunkSize, // approximate
      chunkSize: this.chunkSize,
      onProgress,
      aborted: false,
      hashCalculator, // Add hash calculator
      portMappings: [] // Add empty port mappings array
    };
    
    this.activeDownloads.set(downloadId, activeDownload);
    
    try {
      // Create a promise that resolves when all chunks are received
      const allChunksPromise = new Promise<void>((resolve, reject) => {
        // Set up listener for chunk responses
        connection.on('chunk-response', async (response: any) => {
          if (activeDownload.aborted) return;
          
          const { sha256: fileSha256, startChunk, error, data } = response;
          
          // Ignore responses for other files
          if (fileSha256 !== sha256) return;
          
          if (error) {
            debug(`Error receiving chunk ${startChunk}: ${error}`);
            return;
          }
          
          if (!data || !Array.isArray(data)) {
            debug(`Invalid chunk data for chunk ${startChunk}`);
            return;
          }
          
          // Process the chunk data
          try {
            // Convert base64 data back to buffer
            const buffers = data.map(b => Buffer.from(b, 'base64'));
            
            // Write the chunk to the file
            if (fileHandle && buffers.length > 0) {
              let position = startChunk * activeDownload.chunkSize;
              
              for (const buffer of buffers) {
                await fileHandle.write(buffer, 0, buffer.length, position);
                position += buffer.length;
                
                // Update hash calculation with this chunk
                activeDownload.hashCalculator.update(buffer);
                
                // Update progress
                activeDownload.receivedBytes += buffer.length;
                if (activeDownload.onProgress) {
                  activeDownload.onProgress(activeDownload.receivedBytes, activeDownload.totalBytes);
                }
              }
              
              // Mark chunk as received
              activeDownload.receivedChunks.add(startChunk);
              
              // Check if all chunks are received
              if (activeDownload.receivedChunks.size === activeDownload.totalChunks) {
                resolve();
              }
            }
          } catch (err) {
            debug(`Error processing chunk ${startChunk}: ${(err as Error).message}`);
          }
        });
      });
      
      // Request chunks
      for (let i = startChunk; i < totalChunks; i++) {
        if (activeDownload.aborted) {
          break;
        }
        
        if (activeDownload.receivedChunks.has(i)) {
          // Skip chunks we already have
          continue;
        }
        
        // Request the chunk
        await connection.send('chunk', {
          sha256,
          startChunk: i
        });
        
        // For now, implement a simple sequential download
        // Improve this to be concurrent in a future version
        await new Promise(resolve => setTimeout(resolve, 50)); // Small delay between requests
      }
      
      // Wait for all chunks to be received
      await allChunksPromise;
      
      // Close the file when done
      if (fileHandle) {
        await fileHandle.close();
      }
      
      // Verify file hash
      const calculatedHash = activeDownload.hashCalculator.digest('hex');
      
      if (calculatedHash !== sha256) {
        debug(`Hash verification failed: expected ${sha256}, got ${calculatedHash}`);
        throw new Error(`File integrity verification failed: hash mismatch`);
      }
      
      debug(`Hash verification successful: ${calculatedHash}`);
      debug(`Download of file ${sha256} completed successfully`);
      return savePath;
    } catch (error) {
      // Clean up on error
      this.activeDownloads.delete(downloadId);
      
      if (fileHandle) {
        await fileHandle.close().catch(() => {}); // Ignore close errors
      }
      
      throw error;
    } finally {
      this.activeDownloads.delete(downloadId);
    }
  }

  /**
   * Connect to a peer
   * @param peerId - Peer identifier
   * @param connectionOptions - Connection options
   * @returns Promise that resolves to a connection object
   */
  private async _connectToPeer(peerId: string, connectionOptions: { type: CONNECTION_TYPE, address?: string, port?: number }[]): Promise<Connection> {
    // Validate inputs for security
    if (!peerId || typeof peerId !== 'string') {
      throw new Error('Invalid peer ID');
    }
    
    if (!Array.isArray(connectionOptions)) {
      throw new Error('Connection options must be an array');
    }
    
    debug(`Attempting to connect to peer ${peerId}`);
    
    // Let the connection client handle everything
    return this.connectionClient.connectToPeer(
      peerId,
      connectionOptions, 
      {
        requestTimeout: this.requestTimeout,
        preferIPv6: this.preferIPv6,
        stunServers: this.stunServers,
        enableWebRTC: this.enableWebRTC,
        clientId: this.clientId,
        gun: this.gun
      }
    );
  }
  
  /**
   * Get peer connection options
   * @param peerId - Peer identifier
   * @returns Promise that resolves to an array of connection options
   */
  private async _getPeerConnectionOptions(peerId: string): Promise<{ type: CONNECTION_TYPE, address?: string, port?: number }[]> {
    return new Promise((resolve, reject) => {
      const requestId = uuidv4();
      
      // Send handshake message to the peer
      this.gun.get('hosts').get(peerId).get('messages').set({
        type: 'handshake',
        clientId: this.clientId,
        requestId,
        timestamp: Date.now()
      });
      
      // Wait for response
      const timeoutId = setTimeout(() => {
        reject(new Error('Handshake timeout'));
      }, this.requestTimeout);
      
      // Set up one-time listener for the response
      this.gun.get('hosts').get(peerId).get('messages').map().once((message: any) => {
        if (message && message.requestId === requestId && message.response) {
          clearTimeout(timeoutId);
          
          const { connectionOptions } = message.response;
          if (Array.isArray(connectionOptions)) {
            resolve(connectionOptions);
          } else {
            reject(new Error('Invalid connection options'));
          }
        }
      });
    });
  }
  
  /**
   * Request file metadata from a connection
   * @param connection - Connection to the peer
   * @param sha256 - SHA-256 hash of the file
   * @returns Promise that resolves to file metadata
   */
  private async _requestFileMetadata(connection: Connection, sha256: string): Promise<{ totalBytes: number, totalChunks: number }> {
    // Validate parameters
    if (!connection) {
      throw new Error('Connection is required');
    }
    
    if (!sha256 || typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(sha256)) {
      throw new Error('Valid SHA-256 hash is required');
    }
    
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Metadata request timeout`));
      }, this.requestTimeout);
      
      const metadataHandler = (response: unknown) => {
        clearTimeout(timeoutId);
        
        // Type safety checks
        if (!response || typeof response !== 'object') {
          reject(new Error('Invalid metadata response'));
          return;
        }
        
        const typedResponse = response as { error?: string, sha256?: string, totalBytes?: number, totalChunks?: number };
        
        if (typedResponse.error) {
          reject(new Error(`Metadata error: ${typedResponse.error}`));
        } else if (typedResponse.sha256 === sha256 && 
                  typeof typedResponse.totalBytes === 'number' && 
                  typeof typedResponse.totalChunks === 'number') {
          resolve({
            totalBytes: typedResponse.totalBytes,
            totalChunks: typedResponse.totalChunks
          });
        } else {
          reject(new Error('Invalid metadata response format'));
        }
      };
      
      // Set up event handler
      connection.on('metadata-response', metadataHandler);
      
      // Send the request - handle both Promise and non-Promise returns
      try {
        const sendResult = connection.send('metadata', { sha256 });
        
        // If send returns a Promise, add error handling
        if (sendResult instanceof Promise) {
          sendResult.catch((error: Error) => {
            clearTimeout(timeoutId);
            connection.removeListener && 
              connection.removeListener('metadata-response', metadataHandler);
            reject(error);
          });
        }
      } catch (error) {
        clearTimeout(timeoutId);
        connection.removeListener && 
          connection.removeListener('metadata-response', metadataHandler);
        reject(error);
      }
      
      debug(`Sent metadata request for file ${sha256}`);
    });
  }

  /**
   * Set up the output file for download
   * @param savePath - Path to save the file
   * @param resumeFromChunk - Chunk index to resume from
   * @param chunkSize - Size of each chunk in bytes
   * @returns Promise that resolves to file handle and array of existing chunks
   */
  private async _setupOutputFile(
    savePath: string, 
    resumeFromChunk: number, 
    chunkSize: number
  ): Promise<{ fileHandle: fs.promises.FileHandle | null, existingChunks: number[] }> {
    const existingChunks: number[] = [];
    
    // Create directory if it doesn't exist
    await fs.ensureDir(path.dirname(savePath));
    
    let fileHandle: fs.promises.FileHandle | null = null;
    
    if (resumeFromChunk > 0 && fs.existsSync(savePath)) {
      // If resuming, open the file for read-write
      fileHandle = await fs.promises.open(savePath, 'r+');
      
      // Check which chunks we already have
      const stats = await fileHandle.stat();
      const completeChunks = Math.floor(stats.size / chunkSize);
      
      // Add complete chunks to our list
      for (let i = 0; i < completeChunks; i++) {
        existingChunks.push(i);
      }
      
      debug(`Resuming download from chunk ${resumeFromChunk}, ${existingChunks.length} chunks already downloaded`);
    } else {
      // Otherwise create or truncate the file
      fileHandle = await fs.promises.open(savePath, 'w');
      debug(`Created new file for download: ${savePath}`);
    }
    
    return { fileHandle, existingChunks };
  }

  /**
   * Get active downloads
   * @returns Array of active download IDs
   */
  getActiveDownloads(): string[] {
    return Array.from(this.activeDownloads.keys());
  }

  /**
   * Cancel an active download
   * @param downloadId - Download identifier
   * @returns true if the download was cancelled, false if not found
   */
  cancelDownload(downloadId: string): boolean {
    const download = this.activeDownloads.get(downloadId);
    
    if (!download) {
      return false;
    }
    
    download.aborted = true;
    
    // Close the file handle
    if (download.fileHandle) {
      download.fileHandle.close().catch(() => {});
    }
    
    // Close the connection
    download.connection.close();
    
    this.activeDownloads.delete(downloadId);
    
    debug(`Download ${downloadId} cancelled`);
    return true;
  }

  /**
   * Add pieces to the available pieces set for a file
   * @param fileHash - Hash of the file
   * @param pieces - Array of piece indices
   */
  public addAvailablePieces(fileHash: string, pieces: number[]): void {
    if (!this.availablePieces.has(fileHash)) {
      this.availablePieces.set(fileHash, new Set());
    }
    
    const pieceSet = this.availablePieces.get(fileHash)!;
    pieces.forEach(piece => pieceSet.add(piece));
    
    debug(`Added ${pieces.length} pieces to available pieces for file ${fileHash}`);
  }

  /**
   * Get the list of available pieces for a file
   * @param fileHash - Hash of the file
   * @returns Array of available piece indices or empty array if none
   */
  public getAvailablePieces(fileHash: string): Promise<number[]> {
    return new Promise((resolve) => {
      const pieces = this.availablePieces.get(fileHash);
      if (pieces) {
        resolve(Array.from(pieces));
      } else {
        resolve([]);
      }
    });
  }

  /**
   * Track a request for a piece
   * @param fileHash - Hash of the file
   * @param pieceIndex - Index of the requested piece
   */
  private _trackRequest(fileHash: string, pieceIndex: number): void {
    if (!this.activeRequests.has(fileHash)) {
      this.activeRequests.set(fileHash, new Set());
    }
    
    const requests = this.activeRequests.get(fileHash)!;
    requests.add(pieceIndex);
  }

  /**
   * Cancel a request for a piece
   * @param fileHash - Hash of the file
   * @param pieceIndex - Index of the piece to cancel
   */
  public async cancelRequest(fileHash: string, pieceIndex: number): Promise<void> {
    const requests = this.activeRequests.get(fileHash);
    if (requests && requests.has(pieceIndex)) {
      requests.delete(pieceIndex);
      debug(`Canceled request for piece ${pieceIndex} of file ${fileHash}`);
      
      // If we have a connection, send a cancel message
      const connections = this.connections.get(fileHash);
      if (connections && connections.length > 0) {
        // Try to send cancel message to all connections
        const cancelPromises = connections.map((connection: Connection) => {
          try {
            const result = connection.send('cancel', { fileHash, pieceIndex });
            if (result instanceof Promise) {
              return result.catch((err: Error) => {
                debug(`Error sending cancel message: ${err.message}`);
              });
            }
            return Promise.resolve();
          } catch (err) {
            debug(`Error sending cancel message: ${(err as Error).message}`);
            return Promise.resolve();
          }
        });
        
        await Promise.all(cancelPromises);
      }
    }
  }

  /**
   * Download multiple chunks in a pipelined manner for improved performance
   * @param sha256 - SHA-256 hash of the file
   * @param pieceIndices - Array of piece indices to download
   * @param options - Download options
   * @returns Promise with array of downloaded chunks
   */
  public async pipelineRequests(
    sha256: string, 
    pieceIndices: number[], 
    options: { timeout?: number } = {}
  ): Promise<Buffer[]> {
    // Validate parameters
    if (!sha256 || typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(sha256)) {
      throw new Error('Valid SHA-256 hash is required');
    }
    
    if (!Array.isArray(pieceIndices) || pieceIndices.length === 0) {
      throw new Error('Valid piece indices array is required');
    }
    
    if (!this.initialized) {
      await this._initialize();
    }

    const timeout = options.timeout || this.requestTimeout;
    const results: Buffer[] = new Array(pieceIndices.length).fill(null);
    const pendingIndices = new Set<number>();
    let nextIndexPosition = 0;

    debug(`Starting pipelined download of ${pieceIndices.length} chunks for file ${sha256}`);

    // Find or create connections for this file
    let connections = this.connections.get(sha256);
    if (!connections || connections.length === 0) {
      // Create a new connection for this file if needed
      try {
        debug(`No existing connections for file ${sha256}, creating new connection`);
        const connection = await this._createFileConnection(sha256);
        this.connections.set(sha256, [connection]);
        connections = [connection];
      } catch (err) {
        throw new Error(`Failed to establish connection for file ${sha256}: ${(err as Error).message}`);
      }
    }

    // Need at least one connection
    if (!connections || connections.length === 0) {
      throw new Error('Failed to establish connection for file transfer');
    }

    // Use the first connection for this example (could be enhanced to use multiple)
    const connection = connections[0];

    return new Promise((resolve, reject) => {
      let completedCount = 0;
      let timeoutId: NodeJS.Timeout | null = null;

      // Function to handle received pieces
      const handlePieceReceived = (data: unknown) => {
        // Type safety checks
        if (!data || typeof data !== 'object') {
          debug('Received invalid piece data');
          return;
        }
        
        const typedData = data as { index?: number, data?: Buffer };
        
        if (typeof typedData.index !== 'number' || !Buffer.isBuffer(typedData.data)) {
          debug('Received piece with invalid format');
          return;
        }
        
        const { index, data: pieceData } = typedData;
        
        // Check if this is one of our requested pieces
        const resultIndex = pieceIndices.indexOf(index);
        if (resultIndex >= 0 && pendingIndices.has(index)) {
          debug(`Received piece ${index} (${pieceData.length} bytes)`);
          
          // Save the piece data
          results[resultIndex] = pieceData;
          pendingIndices.delete(index);
          completedCount++;
          
          // Request next piece if available
          if (nextIndexPosition < pieceIndices.length) {
            requestNextPiece();
          }
          
          // If all pieces received, resolve the promise
          if (completedCount === pieceIndices.length) {
            cleanup();
            resolve(results);
          }
        }
      };

      // Function to request the next piece
      const requestNextPiece = () => {
        if (nextIndexPosition >= pieceIndices.length) return;
        
        const pieceIndex = pieceIndices[nextIndexPosition++];
        pendingIndices.add(pieceIndex);
        
        // Track this request
        this._trackRequest(sha256, pieceIndex);
        
        // Send request
        try {
          const result = connection.send('request', { 
            fileHash: sha256, 
            pieceIndex,
            timestamp: Date.now()
          });
          
          if (result instanceof Promise) {
            result.catch((err: Error) => {
              debug(`Error requesting piece ${pieceIndex}: ${err.message}`);
              handleRequestError(pieceIndex);
            });
          }
        } catch (err) {
          debug(`Error requesting piece ${pieceIndex}: ${(err as Error).message}`);
          handleRequestError(pieceIndex);
        }
        
        debug(`Requested piece ${pieceIndex} (${pendingIndices.size} pending)`);
      };
      
      // Handle request errors
      const handleRequestError = (pieceIndex: number) => {
        if (pendingIndices.has(pieceIndex)) {
          pendingIndices.delete(pieceIndex);
          // Put back in the queue at the beginning
          pieceIndices.splice(nextIndexPosition, 0, pieceIndex);
          nextIndexPosition++;
        }
      };

      // Function to clean up event listeners
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        connection.removeListener && connection.removeListener('piece', handlePieceReceived);
      };

      // Set up timeout
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Pipelined request timed out after ${timeout}ms`));
      }, timeout * 2); // Give extra time for pipelined requests

      // Listen for piece events
      connection.on('piece', handlePieceReceived);

      // Start requesting pieces up to the limit
      for (let i = 0; i < Math.min(this._maxOutstandingRequests, pieceIndices.length); i++) {
        requestNextPiece();
      }
    });
  }

  /**
   * Create a connection specifically for file transfers
   * @private
   * @param fileHash - Hash of the file to download
   * @returns Promise with a Connection object
   */
  private async _createFileConnection(fileHash: string): Promise<Connection> {
    return this.connectionClient.createFileConnectionForHash(fileHash);
  }
} 
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
// Use dynamic import for node-datachannel
// import * as dc from 'node-datachannel';
import * as dgram from 'dgram';
import * as net from 'net';
import { v4 as uuidv4 } from 'uuid';

import { ClientOptions, DownloadOptions } from './types';
import { CONNECTION_TYPE } from '../types/constants';
// Import NAT-PMP/PCP utilities
import { discoverPublicIPs, createPortMapping, deletePortMapping } from './utils';
// Import crypto utilities for hash verification
import { calculateSHA256 } from './utils/crypto';

const debug = Debug('dig-nat-tools:client');

// We'll use any for now since we can't use dynamic imports directly in TypeScript
// This will be initialized in the _initialize method if WebRTC is enabled
let dc: any = null;

// Interface for message handler
interface MessageHandler {
  (data: any): void;
}

// Interface for a connection object
interface Connection {
  type: CONNECTION_TYPE;
  peerId: string;
  messageHandlers: Map<string, MessageHandler>;
  send: (messageType: string, data: any) => Promise<void>;
  on: (messageType: string, handler: MessageHandler) => void;
  close: () => void;
}

// Interface for active download
interface ActiveDownload {
  hostId: string;
  sha256: string;
  savePath: string;
  connection: Connection;
  fileHandle: fs.promises.FileHandle | null;
  receivedChunks: Set<number>;
  totalChunks: number;
  totalBytes: number;
  receivedBytes: number;
  chunkSize: number;
  onProgress?: (receivedBytes: number, totalBytes: number) => void;
  aborted: boolean;
  // Add a hash object to calculate SHA-256 on the fly
  hashCalculator: crypto.Hash;
  // Add port mappings for NAT traversal
  portMappings: { protocol: 'TCP' | 'UDP', externalPort: number }[];
}

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
  private externalIPv4: string | null = null;
  private externalIPv6: string | null = null;
  private portMappingLifetime: number;
  private portMappings: { protocol: 'TCP' | 'UDP', externalPort: number }[] = [];
  // New fields for established connection from NAT traversal
  private existingSocket: net.Socket | dgram.Socket | null = null;
  private connectionType: CONNECTION_TYPE | null = null;
  private remoteAddress: string | null = null;
  private remotePort: number | null = null;
  private hasEstablishedConnection: boolean = false;
  
  /**
   * Create a new file client instance
   * @param config - Client configuration
   */
  constructor(config: ClientOptions = {}) {
    this.chunkSize = config.chunkSize || 64 * 1024; // 64KB default
    this.stunServers = config.stunServers || ['stun:stun.l.google.com:19302'];
    this.requestTimeout = config.requestTimeout || 30000; // 30 seconds
    this.enableWebRTC = config.enableWebRTC !== false;
    this.enableNATPMP = config.enableNATPMP !== false; // Default to enabled
    this.portMappingLifetime = config.portMappingLifetime || 3600; // Default to 1 hour
    
    this.clientId = uuidv4();
    this.initialized = false;
    this.activeDownloads = new Map();
    this.initPromise = null;
    
    // Store the existing socket from NAT traversal if provided
    if (config.existingSocket) {
      this.existingSocket = config.existingSocket;
      this.connectionType = config.connectionType || CONNECTION_TYPE.TCP; // Default to TCP if not specified
      this.remoteAddress = config.remoteAddress || null;
      this.remotePort = config.remotePort || null;
      this.hasEstablishedConnection = true;
      debug(`Using established ${this.connectionType} connection to ${this.remoteAddress}:${this.remotePort}`);
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
    
    debug(`Created client with ID: ${this.clientId}`);
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
      // Initialize node-datachannel if WebRTC is enabled
      if (this.enableWebRTC) {
        try {
          dc = await import('node-datachannel');
          dc.initLogger('error' as any);
          debug('node-datachannel module loaded');
        } catch (err) {
          debug(`Error loading node-datachannel: ${err}`);
          this.enableWebRTC = false;
        }
      }
      
      // Discover public IP addresses using NAT-PMP/PCP if enabled
      if (this.enableNATPMP) {
        try {
          debug('Discovering public IP addresses using NAT-PMP/PCP');
          const { ipv4, ipv6 } = await discoverPublicIPs({
            stunServers: this.stunServers,
            timeout: this.requestTimeout,
            useNATPMP: true
          });
          
          if (ipv4) {
            this.externalIPv4 = ipv4;
            debug(`Discovered external IPv4 address: ${ipv4}`);
            
            // Create port mappings for TCP and UDP protocols
            await this._createPortMappings();
          }
          
          if (ipv6) {
            this.externalIPv6 = ipv6;
            debug(`Discovered external IPv6 address: ${ipv6}`);
          }
        } catch (err) {
          debug(`Error discovering public IPs: ${(err as Error).message}`);
        }
      }
      
      this.initialized = true;
      resolve();
    });
    
    return this.initPromise;
  }

  /**
   * Create port mappings for NAT traversal
   * @private
   */
  private async _createPortMappings(): Promise<void> {
    if (!this.enableNATPMP) return;
    
    try {
      // Create a random port for TCP connections
      const tcpPort = Math.floor(Math.random() * (65535 - 10000)) + 10000;
      
      // Create TCP port mapping
      const tcpMapping = await createPortMapping({
        internalPort: tcpPort,
        protocol: 'TCP',
        lifetime: this.portMappingLifetime
      });
      
      if (tcpMapping.success && tcpMapping.externalPort) {
        debug(`Created TCP port mapping: internal ${tcpPort} -> external ${tcpMapping.externalPort}`);
        this.portMappings.push({
          protocol: 'TCP',
          externalPort: tcpMapping.externalPort
        });
      }
      
      // Create a random port for UDP connections
      const udpPort = Math.floor(Math.random() * (65535 - 10000)) + 10000;
      
      // Create UDP port mapping
      const udpMapping = await createPortMapping({
        internalPort: udpPort,
        protocol: 'UDP',
        lifetime: this.portMappingLifetime
      });
      
      if (udpMapping.success && udpMapping.externalPort) {
        debug(`Created UDP port mapping: internal ${udpPort} -> external ${udpMapping.externalPort}`);
        this.portMappings.push({
          protocol: 'UDP',
          externalPort: udpMapping.externalPort
        });
      }
    } catch (err) {
      debug(`Error creating port mappings: ${(err as Error).message}`);
    }
  }
  
  /**
   * Delete all port mappings
   * @private
   */
  private async _deletePortMappings(): Promise<void> {
    if (!this.enableNATPMP || this.portMappings.length === 0) return;
    
    for (const mapping of this.portMappings) {
      try {
        await deletePortMapping({
          externalPort: mapping.externalPort,
          protocol: mapping.protocol
        });
        debug(`Deleted ${mapping.protocol} port mapping for port ${mapping.externalPort}`);
      } catch (err) {
        debug(`Error deleting port mapping: ${(err as Error).message}`);
      }
    }
    
    this.portMappings = [];
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
   * Stop the client and clean up resources
   */
  async stop(): Promise<void> {
    debug('Stopping client');
    
    // Cancel all active downloads
    for (const downloadId of this.activeDownloads.keys()) {
      this.cancelDownload(downloadId);
    }
    
    // Delete all port mappings
    await this._deletePortMappings();
    
    this.initialized = false;
    this.initPromise = null;
    
    debug('Client stopped');
  }

  /**
   * Connect to a peer
   * @param peerId - Peer identifier
   * @param connectionOptions - Connection options
   * @returns Promise that resolves to a connection object
   */
  private async _connectToPeer(peerId: string, connectionOptions: { type: CONNECTION_TYPE, address?: string, port?: number }[]): Promise<Connection> {
    // If we already have an established socket from NAT traversal, use it
    if (this.hasEstablishedConnection && this.existingSocket && this.connectionType) {
      debug(`Using existing ${this.connectionType} connection from NAT traversal`);
      
      if (this.connectionType === CONNECTION_TYPE.TCP) {
        return this._createConnectionFromExistingTCPSocket(peerId, this.existingSocket as net.Socket);
      } else if (this.connectionType === CONNECTION_TYPE.UDP ||
                this.connectionType === CONNECTION_TYPE.UDP_HOLE_PUNCH) {
        return this._createConnectionFromExistingUDPSocket(peerId, this.existingSocket as dgram.Socket);
      }
    }
    
    // Continue with normal connection options
    if (!connectionOptions || connectionOptions.length === 0) {
      throw new Error(`No connection options available for peer ${peerId}`);
    }
    
    // Original connection logic...
    const natPmpOptions = connectionOptions.filter(opt => 
      (opt.type === CONNECTION_TYPE.TCP || opt.type === CONNECTION_TYPE.UDP) && 
      opt.address && opt.port
    );
    
    if (natPmpOptions.length > 0) {
      debug(`Attempting to connect using NAT-PMP/PCP mapped ports`);
      try {
        const option = natPmpOptions[0];
        if (option.type === CONNECTION_TYPE.TCP && option.address && typeof option.port === 'number') {
          return await this._createTCPConnection(peerId, option.address, option.port);
        } else if (option.type === CONNECTION_TYPE.UDP && option.address && typeof option.port === 'number') {
          return await this._createUDPConnection(peerId, option.address, option.port);
        }
      } catch (err) {
        debug(`NAT-PMP/PCP connection failed: ${(err as Error).message}`);
      }
    }
    
    // Try the original WebRTC option if available
    for (const option of connectionOptions) {
      try {
        debug(`Trying connection type: ${option.type}`);
        
        switch (option.type) {
          case CONNECTION_TYPE.TCP:
            if (option.address && typeof option.port === 'number') {
              return await this._createTCPConnection(peerId, option.address, option.port);
            }
            break;
            
          case CONNECTION_TYPE.UDP:
            if (option.address && typeof option.port === 'number') {
              return await this._createUDPConnection(peerId, option.address, option.port);
            }
            break;
            
          case CONNECTION_TYPE.WEBRTC:
            return await this._createWebRTCConnection(peerId);
            
          case CONNECTION_TYPE.GUN:
            return this._createGunRelayConnection(peerId);
        }
      } catch (err) {
        debug(`Connection attempt failed with type ${option.type}: ${(err as Error).message}`);
      }
    }
    
    // If all else fails, use Gun as a fallback
    try {
      debug('Falling back to Gun relay connection');
      return this._createGunRelayConnection(peerId);
    } catch (err) {
      throw new Error(`All connection methods failed: ${(err as Error).message}`);
    }
  }
  
  /**
   * Create connection from an existing TCP socket from NAT traversal
   * @param peerId - Peer identifier
   * @param socket - Existing TCP socket
   * @returns Connection object
   */
  private _createConnectionFromExistingTCPSocket(peerId: string, socket: net.Socket): Connection {
    debug(`Creating connection from existing TCP socket to ${socket.remoteAddress}:${socket.remotePort}`);
    
    const connection: Connection = {
      type: this.connectionType!,
      peerId,
      messageHandlers: new Map(),
      
      send: async (messageType, data) => {
        return new Promise<void>((resolveSend, rejectSend) => {
          const message = {
            type: messageType,
            clientId: this.clientId,
            ...data
          };
          
          socket.write(JSON.stringify(message), (err) => {
            if (err) {
              rejectSend(err);
            } else {
              resolveSend();
            }
          });
        });
      },
      
      on: (messageType, handler) => {
        connection.messageHandlers.set(messageType, handler);
      },
      
      close: () => {
        socket.destroy();
      }
    };
    
    // Handle incoming data
    socket.on('data', (data) => {
      try {
        const message = JSON.parse(data.toString('utf8'));
        const handler = connection.messageHandlers.get(message.type);
        if (handler) {
          handler(message);
        }
      } catch (err) {
        debug(`Error parsing TCP message: ${err}`);
      }
    });
    
    socket.on('error', (err) => {
      debug(`TCP socket error: ${err.message}`);
    });
    
    socket.on('close', () => {
      debug('TCP connection closed');
    });
    
    return connection;
  }

  /**
   * Create connection from an existing UDP socket from NAT traversal
   * @param peerId - Peer identifier
   * @param socket - Existing UDP socket
   * @returns Connection object
   */
  private _createConnectionFromExistingUDPSocket(peerId: string, socket: dgram.Socket): Connection {
    if (!this.remoteAddress || !this.remotePort) {
      throw new Error('Remote address and port are required for UDP connections');
    }
    
    debug(`Creating connection from existing UDP socket to ${this.remoteAddress}:${this.remotePort}`);
    
    // Create the connection object
    const connection: Connection = {
      type: this.connectionType!,
      peerId,
      messageHandlers: new Map(),
      
      send: async (messageType, data) => {
        return new Promise<void>((resolveSend, rejectSend) => {
          const message = {
            type: messageType,
            clientId: this.clientId,
            ...data
          };
          
          const buffer = Buffer.from(JSON.stringify(message));
          socket.send(buffer, this.remotePort!, this.remoteAddress!, (err) => {
            if (err) {
              rejectSend(err);
            } else {
              resolveSend();
            }
          });
        });
      },
      
      on: (messageType, handler) => {
        connection.messageHandlers.set(messageType, handler);
      },
      
      close: () => {
        socket.close();
      }
    };
    
    // Set up message handler for the UDP socket
    socket.on('message', (msg, rinfo) => {
      // Only process messages from the expected remote peer
      if (rinfo.address === this.remoteAddress && rinfo.port === this.remotePort) {
        try {
          const message = JSON.parse(msg.toString('utf8'));
          const handler = connection.messageHandlers.get(message.type);
          if (handler) {
            handler(message);
          }
        } catch (err) {
          debug(`Error parsing UDP message: ${err}`);
        }
      }
    });
    
    socket.on('error', (err) => {
      debug(`UDP socket error: ${err.message}`);
    });
    
    return connection;
  }
  
  /**
   * Try direct connection to a peer
   * @param peerId - Peer identifier
   * @returns Promise that resolves to a connection object
   */
  private async _tryDirectConnection(peerId: string): Promise<Connection> {
    // Get connection options from the peer
    const connectionOptions = await this._getPeerConnectionOptions(peerId);
    
    if (!connectionOptions || connectionOptions.length === 0) {
      throw new Error(`No connection options available for peer ${peerId}`);
    }
    
    // Try all connection methods in parallel
    switch (connectionOptions[0].type) {
      case CONNECTION_TYPE.TCP:
        return await this._createTCPConnection(peerId, connectionOptions[0].address, connectionOptions[0].port);
        
      case CONNECTION_TYPE.UDP:
        return await this._createUDPConnection(peerId, connectionOptions[0].address, connectionOptions[0].port);
        
      case CONNECTION_TYPE.WEBRTC:
        return await this._createWebRTCConnection(peerId);
        
      case CONNECTION_TYPE.GUN:
        return this._createGunRelayConnection(peerId);
        
      default:
        throw new Error(`Unsupported connection type: ${connectionOptions[0].type}`);
    }
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
   * Create a TCP connection
   * @param peerId - Peer identifier
   * @param host - Host address
   * @param port - Port number
   * @returns Promise that resolves to a connection object
   */
  private async _createTCPConnection(peerId: string, host: string, port: number): Promise<Connection> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port }, () => {
        debug(`TCP connection established to ${host}:${port}`);
        
        const connection: Connection = {
          type: CONNECTION_TYPE.TCP,
          peerId,
          messageHandlers: new Map(),
          
          send: async (messageType, data) => {
            return new Promise<void>((resolveSend, rejectSend) => {
              const message = {
                type: messageType,
                clientId: this.clientId,
                ...data
              };
              
              socket.write(JSON.stringify(message), (err) => {
                if (err) {
                  rejectSend(err);
                } else {
                  resolveSend();
                }
              });
            });
          },
          
          on: (messageType, handler) => {
            connection.messageHandlers.set(messageType, handler);
          },
          
          close: () => {
            socket.destroy();
          }
        };
        
        // Handle incoming data
        socket.on('data', (data) => {
          try {
            const message = JSON.parse(data.toString('utf8'));
            const handler = connection.messageHandlers.get(message.type);
            if (handler) {
              handler(message);
            }
          } catch (err) {
            debug(`Error parsing TCP message: ${err}`);
          }
        });
        
        socket.on('error', (err) => {
          debug(`TCP socket error: ${err.message}`);
        });
        
        socket.on('close', () => {
          debug('TCP connection closed');
        });
        
        resolve(connection);
      });
      
      socket.on('error', (err) => {
        reject(err);
      });
      
      // Set connection timeout
      socket.setTimeout(this.requestTimeout);
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('TCP connection timeout'));
      });
    });
  }
  
  /**
   * Create a UDP connection
   * @param peerId - Peer identifier
   * @param host - Host address
   * @param port - Port number
   * @returns Promise that resolves to a connection object
   */
  private async _createUDPConnection(peerId: string, host: string, port: number): Promise<Connection> {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      
      socket.on('message', (msg, rinfo) => {
        debug(`Received UDP message from ${rinfo.address}:${rinfo.port}`);
        
        try {
          const message = JSON.parse(msg.toString('utf8'));
          
          // Check if we have a registered handler for this message type
          if (connection.messageHandlers.has(message.type)) {
            const handler = connection.messageHandlers.get(message.type);
            if (handler) {
              handler(message);
            }
          }
        } catch (err) {
          debug(`Error parsing UDP message: ${err}`);
        }
      });
      
      socket.on('error', (err) => {
        debug(`UDP socket error: ${err.message}`);
        socket.close();
        reject(err);
      });
      
      // Create the connection object
      const connection: Connection = {
        type: CONNECTION_TYPE.UDP,
        peerId,
        messageHandlers: new Map(),
        
        send: async (messageType, data) => {
          return new Promise<void>((resolveSend, rejectSend) => {
            const message = {
              type: messageType,
              clientId: this.clientId,
              ...data
            };
            
            const buffer = Buffer.from(JSON.stringify(message));
            socket.send(buffer, port, host, (err) => {
              if (err) {
                rejectSend(err);
              } else {
                resolveSend();
              }
            });
          });
        },
        
        on: (messageType, handler) => {
          connection.messageHandlers.set(messageType, handler);
        },
        
        close: () => {
          socket.close();
        }
      };
      
      // Send a ping to establish connection
      const pingMessage = {
        type: 'ping',
        clientId: this.clientId,
        timestamp: Date.now()
      };
      
      const pingBuffer = Buffer.from(JSON.stringify(pingMessage));
      socket.send(pingBuffer, port, host, (err) => {
        if (err) {
          socket.close();
          reject(err);
        } else {
          resolve(connection);
        }
      });
    });
  }
  
  /**
   * Create a WebRTC connection
   * @param peerId - Peer identifier
   * @returns Promise that resolves to a connection object
   */
  private async _createWebRTCConnection(peerId: string): Promise<Connection> {
    return new Promise(async (resolve, reject) => {
      // Make sure node-datachannel is loaded
      if (!dc) {
        try {
          dc = await import('node-datachannel');
          dc.initLogger('error' as any);
          debug('node-datachannel module loaded');
        } catch (err) {
          debug(`Error loading node-datachannel: ${err}`);
          reject(new Error(`WebRTC not available: ${err}`));
          return;
        }
      }
      
      // Configure the peer connection
      const config = {
        iceServers: this.stunServers
      };
      
      try {
        const peer = new dc.PeerConnection(peerId, config);
        const dataChannel = peer.createDataChannel('data');
        let connected = false;
        
        // Create the connection object
        const connection: Connection = {
          type: CONNECTION_TYPE.WEBRTC,
          peerId,
          messageHandlers: new Map(),
          
          send: async (messageType, data) => {
            return new Promise<void>((resolveSend, rejectSend) => {
              if (!connected) {
                rejectSend(new Error('WebRTC data channel not connected'));
                return;
              }
              
              try {
                const message = {
                  type: messageType,
                  clientId: this.clientId,
                  ...data
                };
                
                dataChannel.sendMessage(JSON.stringify(message));
                resolveSend();
              } catch (err) {
                rejectSend(err as Error);
              }
            });
          },
          
          on: (messageType, handler) => {
            connection.messageHandlers.set(messageType, handler);
          },
          
          close: () => {
            dataChannel.close();
            peer.close();
          }
        };
        
        // Set up event handlers
        dataChannel.onMessage((msg: string) => {
          try {
            const message = JSON.parse(msg);
            
            // Handle the message if we have a registered handler
            if (connection.messageHandlers.has(message.type)) {
              const handler = connection.messageHandlers.get(message.type);
              if (handler) {
                handler(message);
              }
            }
          } catch (err) {
            debug(`Error parsing WebRTC message: ${err}`);
          }
        });
        
        dataChannel.onClosed(() => {
          debug(`WebRTC data channel closed for peer ${peerId}`);
        });
        
        dataChannel.onOpen(() => {
          debug(`WebRTC data channel opened for peer ${peerId}`);
          connected = true;
          resolve(connection);
        });
        
        peer.onLocalDescription((sdp: string, type: string) => {
          // Send the SDP to the peer via Gun
          this.gun.get('hosts').get(peerId).get('messages').set({
            type: 'webrtc-signal',
            clientId: this.clientId,
            signal: { sdp, type },
            timestamp: Date.now()
          });
        });
        
        peer.onLocalCandidate((candidate: string, mid: string) => {
          // Send the ICE candidate to the peer via Gun
          this.gun.get('hosts').get(peerId).get('messages').set({
            type: 'webrtc-signal',
            clientId: this.clientId,
            signal: { candidate, mid },
            timestamp: Date.now()
          });
        });
        
        // Listen for signals from the peer
        this._listenForWebRTCSignals(peerId, peer);
        
        // Set a timeout for the connection
        setTimeout(() => {
          if (!connected) {
            debug(`WebRTC connection to ${peerId} timed out`);
            dataChannel.close();
            peer.close();
            reject(new Error('WebRTC connection timed out'));
          }
        }, this.requestTimeout);
        
      } catch (err) {
        debug(`Error creating WebRTC connection: ${err}`);
        reject(err);
      }
    });
  }
  
  /**
   * Listen for WebRTC signals from a peer
   * @param peerId - Peer identifier
   * @param peer - WebRTC peer connection
   */
  private _listenForWebRTCSignals(peerId: string, peer: any): void {
    this.gun.get('clients').get(this.clientId).get('signals').map().once((signal: any) => {
      if (!signal) return;
      
      if (signal.signal.sdp && signal.signal.type) {
        peer.setRemoteDescription(signal.signal.sdp, signal.signal.type);
        debug(`Set remote description from peer ${peerId}`);
      } else if (signal.signal.candidate && signal.signal.mid) {
        peer.addRemoteCandidate(signal.signal.candidate, signal.signal.mid);
        debug(`Added remote ICE candidate from peer ${peerId}`);
      }
    });
  }
  
  /**
   * Create a Gun relay connection
   * @param peerId - Peer identifier
   * @returns Connection object
   */
  private _createGunRelayConnection(peerId: string): Connection {
    debug(`Creating Gun relay connection to peer ${peerId}`);
    
    const connection: Connection = {
      type: CONNECTION_TYPE.GUN,
      peerId,
      messageHandlers: new Map(),
      
      send: async (messageType, data) => {
        return new Promise<void>((resolve) => {
          const messageId = uuidv4();
          
          this.gun.get('hosts').get(peerId).get('messages').set({
            type: 'request',
            clientId: this.clientId,
            messageId,
            request: {
              type: messageType,
              ...data
            },
            timestamp: Date.now()
          });
          
          resolve();
        });
      },
      
      on: (messageType, handler) => {
        connection.messageHandlers.set(messageType, handler);
      },
      
      close: () => {
        // No resources to clean up for Gun relay connection
      }
    };
    
    // Listen for responses from the peer
    this.gun.get('hosts').get(peerId).get('messages').map().on((message: any) => {
      if (!message || !message.response) return;
      
      // Check if the message is addressed to us
      if (message.clientId === this.clientId) {
        const response = message.response;
        
        // Find handler for this message type
        const handler = connection.messageHandlers.get(response.type);
        if (handler) {
          handler(response);
        }
      }
    });
    
    return connection;
  }

  /**
   * Request file metadata from a connection
   * @param connection - Connection to the peer
   * @param sha256 - SHA-256 hash of the file
   * @returns Promise that resolves to file metadata
   */
  private async _requestFileMetadata(connection: Connection, sha256: string): Promise<{ totalBytes: number, totalChunks: number }> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Metadata request timeout`));
      }, this.requestTimeout);
      
      const metadataHandler = (response: any) => {
        clearTimeout(timeoutId);
        
        if (response.error) {
          reject(new Error(`Metadata error: ${response.error}`));
        } else if (response.sha256 === sha256) {
          resolve({
            totalBytes: response.totalBytes,
            totalChunks: response.totalChunks
          });
        }
      };
      
      // Set up event handler
      connection.on('metadata-response', metadataHandler);
      
      // Send the request
      connection.send('metadata', { sha256 })
        .catch(error => reject(error));
      
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
} 
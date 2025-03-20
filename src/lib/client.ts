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

import { DownloadOptions } from './types';
import { CONNECTION_TYPE } from '../types/constants';
// Import NAT-PMP/PCP utilities
import { discoverPublicIPs, createPortMapping, deletePortMapping } from './utils';
// Import crypto utilities for hash verification
import { calculateSHA256 } from './utils/crypto';
// Import dual-stack utilities
import { 
  connectWithIPv6Preference, 
  connectToFirstAvailableAddress,
  getIPVersion,
  getSocketTypeForAddress,
  getBindAddressForSocketType,
  sortIPAddressesByPreference
} from './utils/dual-stack';

const debug = Debug('dig-nat-tools:client');

// We'll use any for now since we can't use dynamic imports directly in TypeScript
// This will be initialized in the _initialize method if WebRTC is enabled
let dc: any = null;

// Interface for message handler
interface MessageHandler {
  (data: any): void;
}

// Map to store message handlers for different message types
type MessageHandlerMap = Map<string, MessageHandler[]>;

// Interface for a connection object
interface Connection {
  type: CONNECTION_TYPE;
  peerId: string;
  messageHandlers: MessageHandlerMap;
  send: (messageType: string, data: any) => Promise<void>;
  on: (messageType: string, handler: MessageHandler) => void;
  close: () => void;
  removeListener: (messageType: string, handler: MessageHandler) => void;
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
  private enableIPv6: boolean;
  private preferIPv6: boolean;
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
  private availablePieces: Map<string, Set<number>> = new Map(); // fileHash -> Set of available piece indices
  private activeRequests: Map<string, Set<number>> = new Map(); // fileHash -> Set of requested piece indices
  // Add a connections property to track connections by file hash
  private connections: Map<string, Array<Connection>> = new Map(); // fileHash -> array of connections
  // Add property for managing pipelined requests
  private _maxOutstandingRequests: number = 5; // Maximum number of simultaneous requests per peer
  
  /**
   * Create a new file client instance
   * @param config - Client configuration
   */
  constructor(config: {
    chunkSize?: number;
    stunServers?: string[];
    requestTimeout?: number;
    enableWebRTC?: boolean;
    enableNATPMP?: boolean;
    enableIPv6?: boolean;
    preferIPv6?: boolean;
    portMappingLifetime?: number;
    gunInstance?: any;
    gunOptions?: Record<string, any>;
    existingSocket?: net.Socket | dgram.Socket;
    connectionType?: CONNECTION_TYPE;
    remoteAddress?: string;
    remotePort?: number;
  } = {}) {
    this.chunkSize = config.chunkSize || 64 * 1024; // 64KB default
    this.stunServers = config.stunServers || ['stun:stun.l.google.com:19302'];
    this.requestTimeout = config.requestTimeout || 30000; // 30 seconds
    this.enableWebRTC = config.enableWebRTC !== false;
    this.enableNATPMP = config.enableNATPMP !== false; // Default to enabled
    this.enableIPv6 = config.enableIPv6 || false; // Default to disabled for backward compatibility
    this.preferIPv6 = config.preferIPv6 !== false; // Default to true if IPv6 is enabled
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
            useNATPMP: true,
            enableIPv6: this.enableIPv6,
            preferIPv6: this.preferIPv6
          });
          
          if (ipv4) {
            this.externalIPv4 = ipv4;
            debug(`Discovered external IPv4 address: ${ipv4}`);
            
            // Create port mappings for TCP and UDP protocols
            await this._createPortMappings();
          }
          
          if (ipv6 && this.enableIPv6) {
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
    
    // Prepare connection options that have address and port
    // Group options by connection type
    const tcpOptions: { address: string, port: number }[] = [];
    const udpOptions: { address: string, port: number }[] = [];
    
    // Extract connection options by type
    connectionOptions.forEach(opt => {
      if (opt.address && typeof opt.port === 'number') {
        if (opt.type === CONNECTION_TYPE.TCP) {
          tcpOptions.push({ address: opt.address, port: opt.port });
        } else if (opt.type === CONNECTION_TYPE.UDP) {
          udpOptions.push({ address: opt.address, port: opt.port });
        }
      }
    });
    
    // Try to establish connection with IPv6 preference
    
    // Try TCP first
    if (tcpOptions.length > 0) {
      debug(`Attempting TCP connections with ${this.preferIPv6 ? 'IPv6 preference' : 'IPv4 preference'}`);
      try {
        // Extract addresses and create a flat list of peer addresses
        const addresses = tcpOptions.map(opt => opt.address);
        const port = tcpOptions[0].port; // Use the first port for all addresses
        
        // Connect to the first available address with IPv6 preference
        const { socket, address } = await connectToFirstAvailableAddress(
          addresses,
          port,
          'tcp',
          { 
            timeout: this.requestTimeout,
            preferIPv6: this.preferIPv6,
            onError: (error, addr) => {
              debug(`TCP connection to ${addr}:${port} failed: ${error.message}`);
            }
          }
        );
        
        debug(`TCP connection established to ${address}:${port}`);
        return this._createConnectionFromExistingTCPSocket(peerId, socket as net.Socket);
      } catch (err) {
        debug(`All TCP connection attempts failed: ${(err as Error).message}`);
      }
    }
    
    // Try UDP next
    if (udpOptions.length > 0) {
      debug(`Attempting UDP connections with ${this.preferIPv6 ? 'IPv6 preference' : 'IPv4 preference'}`);
      try {
        // Extract addresses and create a flat list of peer addresses
        const addresses = udpOptions.map(opt => opt.address);
        const port = udpOptions[0].port; // Use the first port for all addresses
        
        // Connect to the first available address with IPv6 preference
        const { socket, address } = await connectToFirstAvailableAddress(
          addresses,
          port,
          'udp',
          { preferIPv6: this.preferIPv6 }
        );
        
        // Update remote address and port
        this.remoteAddress = address;
        this.remotePort = port;
        
        debug(`UDP socket created for ${address}:${port}`);
        return this._createConnectionFromExistingUDPSocket(peerId, socket as dgram.Socket);
      } catch (err) {
        debug(`All UDP connection attempts failed: ${(err as Error).message}`);
      }
    }
    
    // Try WebRTC if enabled
    for (const option of connectionOptions) {
      if (option.type === CONNECTION_TYPE.WEBRTC && this.enableWebRTC) {
        try {
          debug(`Trying WebRTC connection`);
          return await this._createWebRTCConnection(peerId);
        } catch (err) {
          debug(`WebRTC connection attempt failed: ${(err as Error).message}`);
        }
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
    
    const messageHandlers: MessageHandlerMap = new Map();
    
    const connection: Connection = {
      type: this.connectionType!,
      peerId,
      messageHandlers,
      
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
        if (!messageHandlers.has(messageType)) {
          messageHandlers.set(messageType, []);
        }
        const handlers = messageHandlers.get(messageType)!;
        handlers.push(handler);
      },
      
      close: () => {
        socket.destroy();
      },
      
      removeListener: (messageType: string, handler: MessageHandler): void => {
        const handlers = messageHandlers.get(messageType);
        if (handlers) {
          const index = handlers.indexOf(handler);
          if (index !== -1) {
            handlers.splice(index, 1);
          }
        }
      }
    };
    
    // Handle incoming data
    socket.on('data', (data) => {
      try {
        const message = JSON.parse(data.toString('utf8'));
        const handlers = messageHandlers.get(message.type);
        if (handlers && handlers.length > 0) {
          for (const handler of handlers) {
            handler(message);
          }
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
    
    // Create message handlers map
    const messageHandlers: MessageHandlerMap = new Map();
    
    // Create the connection object
    const connection: Connection = {
      type: this.connectionType!,
      peerId,
      messageHandlers,
      
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
        if (!messageHandlers.has(messageType)) {
          messageHandlers.set(messageType, []);
        }
        const handlers = messageHandlers.get(messageType)!;
        handlers.push(handler);
      },
      
      close: () => {
        socket.close();
      },
      
      removeListener: (messageType: string, handler: MessageHandler): void => {
        const handlers = messageHandlers.get(messageType);
        if (handlers) {
          const index = handlers.indexOf(handler);
          if (index !== -1) {
            handlers.splice(index, 1);
          }
        }
      }
    };
    
    // Set up message handler for the UDP socket
    socket.on('message', (msg, rinfo) => {
      // Only process messages from the expected remote peer
      if (rinfo.address === this.remoteAddress && rinfo.port === this.remotePort) {
        try {
          const message = JSON.parse(msg.toString('utf8'));
          const handlers = messageHandlers.get(message.type);
          if (handlers && handlers.length > 0) {
            for (const handler of handlers) {
              handler(message);
            }
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
    
    // Group addresses by protocol
    const tcpAddresses: string[] = [];
    const udpAddresses: string[] = [];
    let tcpPort: number | undefined;
    let udpPort: number | undefined;
    
    // Collect addresses and ports
    connectionOptions.forEach(option => {
      if (option.address) {
        if (option.type === CONNECTION_TYPE.TCP && typeof option.port === 'number') {
          tcpAddresses.push(option.address);
          tcpPort = option.port;
        } else if (option.type === CONNECTION_TYPE.UDP && typeof option.port === 'number') {
          udpAddresses.push(option.address);
          udpPort = option.port;
        }
      }
    });
    
    // Try TCP with multiple addresses and IPv6 preference first
    if (tcpAddresses.length > 0 && tcpPort !== undefined) {
      try {
        const { socket, address } = await connectToFirstAvailableAddress(
          tcpAddresses,
          tcpPort,
          'tcp',
          { 
            timeout: this.requestTimeout,
            preferIPv6: this.preferIPv6
          }
        );
        
        debug(`Direct TCP connection established to ${address}:${tcpPort}`);
        return this._createConnectionFromExistingTCPSocket(peerId, socket as net.Socket);
      } catch (err) {
        debug(`Direct TCP connection failed: ${(err as Error).message}`);
      }
    }
    
    // Try UDP with multiple addresses and IPv6 preference next
    if (udpAddresses.length > 0 && udpPort !== undefined) {
      try {
        const { socket, address } = await connectToFirstAvailableAddress(
          udpAddresses,
          udpPort,
          'udp',
          { preferIPv6: this.preferIPv6 }
        );
        
        // Update remote address and port
        this.remoteAddress = address;
        this.remotePort = udpPort;
        
        debug(`Direct UDP connection established to ${address}:${udpPort}`);
        return this._createConnectionFromExistingUDPSocket(peerId, socket as dgram.Socket);
      } catch (err) {
        debug(`Direct UDP connection failed: ${(err as Error).message}`);
      }
    }
    
    // Try WebRTC if available
    if (connectionOptions.some(opt => opt.type === CONNECTION_TYPE.WEBRTC) && this.enableWebRTC) {
      try {
        return await this._createWebRTCConnection(peerId);
      } catch (err) {
        debug(`WebRTC connection failed: ${(err as Error).message}`);
      }
    }
    
    // Fallback to Gun relay
    return this._createGunRelayConnection(peerId);
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
    debug(`Creating TCP connection to ${host}:${port}`);
    
    const ipVersion = getIPVersion(host);
    const protocol = 'tcp';
    
    try {
      // Use our IPv6-aware connection utility
      const socket = await connectWithIPv6Preference(host, port, protocol, {
        timeout: this.requestTimeout,
        onError: (error) => {
          debug(`TCP connection error to ${host}:${port}: ${error.message}`);
        },
        onConnection: (socket) => {
          debug(`TCP connection established to ${host}:${port}`);
        }
      }) as net.Socket;
      
      return this._createConnectionFromExistingTCPSocket(peerId, socket);
    } catch (error) {
      debug(`Failed to create TCP connection to ${host}:${port}: ${(error as Error).message}`);
      throw error;
    }
  }
  
  /**
   * Create a UDP connection
   * @param peerId - Peer identifier
   * @param host - Host address
   * @param port - Port number
   * @returns Promise that resolves to a connection object
   */
  private async _createUDPConnection(peerId: string, host: string, port: number): Promise<Connection> {
    debug(`Creating UDP connection to ${host}:${port}`);
    
    try {
      // Use our IPv6-aware connection utility
      const socket = await connectWithIPv6Preference(host, port, 'udp', {
        timeout: this.requestTimeout
      }) as dgram.Socket;
      
      // Update remote address and port
      this.remoteAddress = host;
      this.remotePort = port;
      
      return this._createConnectionFromExistingUDPSocket(peerId, socket);
    } catch (error) {
      debug(`Failed to create UDP connection to ${host}:${port}: ${(error as Error).message}`);
      throw error;
    }
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
          },
          
          removeListener: (messageType: string, handler: MessageHandler): void => {
            const handlers = this.messageHandlers.get(messageType);
            if (handlers) {
              const index = handlers.indexOf(handler);
              if (index !== -1) {
                handlers.splice(index, 1);
              }
            }
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
      },
      
      removeListener: (messageType: string, handler: MessageHandler): void => {
        const handlers = this.messageHandlers.get(messageType);
        if (handlers) {
          const index = handlers.indexOf(handler);
          if (index !== -1) {
            handlers.splice(index, 1);
          }
        }
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
        const cancelPromises = connections.map((connection: Connection) => 
          connection.send('cancel', { fileHash, pieceIndex })
            .catch((err: Error) => debug(`Error sending cancel message: ${err.message}`))
        );
        
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
      // This would typically be handled by your connection management system
      debug(`No existing connections for file ${sha256}, creating new connection`);
      const connection = await this._createFileConnection(sha256);
      this.connections.set(sha256, [connection]);
      connections = [connection];
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
      const handlePieceReceived = (data: { index: number, data: Buffer }) => {
        const { index, data: pieceData } = data;
        
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
        connection.send('request', { 
          fileHash: sha256, 
          pieceIndex,
          timestamp: Date.now()
        }).catch((err: Error) => {
          debug(`Error requesting piece ${pieceIndex}: ${err.message}`);
          if (pendingIndices.has(pieceIndex)) {
            pendingIndices.delete(pieceIndex);
            // Put back in the queue at the beginning
            pieceIndices.splice(nextIndexPosition, 0, pieceIndex);
            nextIndexPosition++;
          }
        });
        
        debug(`Requested piece ${pieceIndex} (${pendingIndices.size} pending)`);
      };

      // Function to clean up event listeners
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        connection.removeListener('piece', handlePieceReceived);
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
    // Use a type guard to handle the existingSocket safely
    if (this.hasEstablishedConnection && this.existingSocket) {
      if (this.connectionType === CONNECTION_TYPE.TCP) {
        const tcpSocket = this.existingSocket as net.Socket;
        return this._createConnectionFromExistingTCPSocket('file-' + fileHash, tcpSocket);
      } else if (this.connectionType === CONNECTION_TYPE.UDP) {
        const udpSocket = this.existingSocket as dgram.Socket;
        return this._createConnectionFromExistingUDPSocket('file-' + fileHash, udpSocket);
      }
    }
    
    // Otherwise, create a new connection
    // This would call your existing connection methods
    throw new Error('Need an established connection for file transfer');
  }
} 
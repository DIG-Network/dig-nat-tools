/**
 * Connection Client Module
 * 
 * Primary public interface for establishing connections to peers in the Dig NAT Tools system.
 * This is the only module that should be used directly by external code.
 * 
 * This module focuses purely on orchestration, delegating to specialized components:
 * - NATTraversalManager: Discovers and establishes connections
 * - ConnectionSession: Manages active connections
 * - ConnectionRegistry: Remembers successful connection methods
 * 
 * REFACTORING NOTE:
 * This module should be updated to leverage network-utils.ts for network operations
 * in _createTCPConnection and _createUDPConnection methods. Current implementation uses
 * direct socket APIs, but should be refactored to use the utility functions for consistency.
 * See docs/code-guidelines/network-utils-usage.md for guidelines.
 */

import * as net from 'net';
import * as dgram from 'dgram';
import { CONNECTION_TYPE } from '../../../types/constants';
import * as crypto from 'crypto';
import Debug from 'debug';
import type {
  Connection,
  MessageHandler,
  TCPConnection,
  UDPConnection,
  WebRTCConnection,
  GunRelayConnection,
  GunInstance
} from '../../types/connection';
import type { PeerConnection, DataChannel } from 'node-datachannel';
// Import NAT Traversal Manager
import { natTraversalManager } from '../traversal/nat-traversal-manager';
import type { NATTraversalOptions, NATTraversalResult } from '../../../types/nat-traversal';
// Import Network Manager
import { networkManager } from '../network/network-manager';
// Import Connection Registry
import { connectionRegistry } from '../registry/connection-registry';
// Import Connection Session
import { ConnectionSession } from '../session/connection-session';

const debug = Debug('dig:connection:client');

/**
 * Public interface for establishing and managing peer connections
 */
export class ConnectionClient {
  // Use ConnectionSession to manage connections instead of direct maps
  private peerSession: ConnectionSession = new ConnectionSession();
  private fileSession: ConnectionSession = new ConnectionSession();
  
  // Client identification
  private _clientId?: string;
  private _gun?: any;
  
  /**
   * Connect to a peer
   * 
   * This is the primary method for establishing a connection to a peer.
   * It orchestrates the connection process, delegating to specialized components.
   *
   * @param peerId - Unique identifier for the peer
   * @param addressOptions - Address information options
   * @param additionalOptions - Additional connection options
   * @returns Promise resolving to an established connection
   */
  public async connectToPeer(
    peerId: string,
    addressOptions: Array<{ type: CONNECTION_TYPE, address?: string, port?: number }>,
    additionalOptions?: {
      // Connection preferences
      preferIPv6?: boolean;
      forceNewConnection?: boolean;
      timeout?: number;
      requestTimeout?: number;
      
      // Authentication/security
      clientId: string;
      gun: any;
      
      // Feature toggles
      enableWebRTC?: boolean;
      stunServers?: string[];
      turnServer?: string;
      turnCredential?: string;
    }
  ): Promise<Connection> {
    debug(`Connecting to peer ${peerId}`);
    
    // Default options if not provided
    const options = additionalOptions || {} as any;
    
    const {
      preferIPv6 = true,
      forceNewConnection = false,
      timeout = 30000,
      requestTimeout = 30000,
      clientId,
      gun,
      stunServers = [],
      turnServer,
      turnCredential,
      enableWebRTC = false
    } = options;
    
    // Derive connection types from address options
    const connectionTypes = addressOptions.map(opt => opt.type);
    
    // Store client ID and Gun instance for later use
    this._clientId = clientId;
    this._gun = gun;
    
    // If not forcing a new connection, check if we already have one
    if (!forceNewConnection) {
      const existingConnection = this.peerSession.getConnection(peerId);
      if (existingConnection) {
        debug(`Using existing connection to peer ${peerId}`);
        return existingConnection;
      }
    }
    
    let prioritizedMethods = [...connectionTypes];
    
    // Check registry for previous successful connection method if not forcing a new connection
    if (!forceNewConnection) {
      try {
        const previousEntry = await connectionRegistry.getConnectionMethod(peerId);
        if (previousEntry) {
          debug(`Found previous successful connection method: ${previousEntry.connectionType}`);
          debug(`Connection details - Type: ${previousEntry.connectionType}, Address: ${previousEntry.address}, Port: ${previousEntry.port}`);
          
          // Prioritize the previous successful method
          prioritizedMethods = prioritizedMethods.filter(m => m !== previousEntry.connectionType);
          prioritizedMethods.unshift(previousEntry.connectionType);
        }
      } catch (err) {
        debug(`Error retrieving previous connection: ${(err as Error).message}`);
      }
    }
    
    // Extract address and port from first option (if available)
    const firstOption = addressOptions[0] || {} as { address?: string; port?: number; type?: CONNECTION_TYPE };
    const address = firstOption.address;
    const port = firstOption.port;
    
    // Create NAT traversal options, delegating all connection logic to the NATTraversalManager
    const traversalOptions: NATTraversalOptions = {
      peerId,
      address,
      port,
      methods: prioritizedMethods,
      gun,
      methodTimeout: timeout || requestTimeout,
      overallTimeout: (timeout || requestTimeout) * 2,
      failFast: false,
      stunServers,
      protocol: 'TCP', // Default to TCP
      preferredFamily: preferIPv6 ? 'IPv6' : 'IPv4', // Convert boolean to family preference
      turnServer,
      turnCredential
    };
    
    try {
      // Let NAT traversal manager handle all connection establishment logic
      const result = await natTraversalManager.connect(traversalOptions);
      
      if (!result.success) {
        throw new Error(result.error || 'Connection failed');
      }
      
      // Create an appropriate connection object based on the result
      const connection = this._createConnectionFromNATResult(peerId, result, clientId);
      
      // Register the connection as successful for future use
      this._registerSuccessfulConnection(
        peerId, 
        connection, 
        result.connectionType!, 
        result.remoteAddress, 
        result.remotePort
      );
      
      debug(`Successfully established new connection to peer ${peerId} using ${result.connectionType}`);
      return connection;
    } catch (err) {
      debug(`Connection to peer ${peerId} failed: ${(err as Error).message}`);
      throw err;
    }
  }
  
  /**
   * Get an existing connection
   * @param peerId - Peer ID to get connection for
   * @returns Connection object or undefined if not found
   */
  public getConnection(peerId: string): Connection | undefined {
    const connection = this.peerSession.getConnection(peerId);
    debug(`Getting connection ${peerId}: ${connection ? 'found' : 'not found'}`);
    return connection;
  }
  
  /**
   * Get all peer connections of a specific type
   * @param type - Connection type to filter by
   * @returns Array of matching connections
   */
  public getConnectionsByType(type: CONNECTION_TYPE): Connection[] {
    return this.peerSession.getConnectionsByType(type);
  }
  
  /**
   * Close and remove a connection
   * @param peerId - Peer ID to disconnect from
   */
  public closeConnection(peerId: string): void {
    debug(`Closing connection to peer ${peerId}`);
    this.peerSession.removeConnection(peerId);
  }
  
  /**
   * Close all connections
   */
  public closeAll(): void {
    debug('Closing all connections');
    
    // Close all peer connections
    this.peerSession.closeAll();
    
    // Close all file connections
    this.fileSession.closeAll();
    
    debug('All connections closed');
  }
  
  /**
   * Initialize the connection client
   * Must be called before using the client
   * 
   * @param options - Initialization options
   */
  public async initialize(options: {
    enableWebRTC?: boolean;
    stunServers?: string[];
    clientId: string;
    gun: any;
    enableNATPMP?: boolean;
    enableIPv6?: boolean;
    preferIPv6?: boolean;
    timeout?: number;
    portMappingLifetime?: number;
    tcpPort?: number;
    udpPort?: number;
  }): Promise<void> {
    const { 
      clientId, 
      gun
    } = options;
    
    // Store client ID and Gun instance for later use
    this._clientId = clientId;
    this._gun = gun;
    
    // Initialize the connection registry
    await connectionRegistry.initialize();
    
    // Initialize the network manager if not already running
    await networkManager.start();
    
    debug('Connection client initialized');
  }
  
  /**
   * Shutdown the connection client and clean up resources
   */
  public async shutdown(): Promise<void> {
    debug('Shutting down connection client');
    
    // Close all active connections
    this.closeAll();
    
    // Stop the network manager
    try {
      await networkManager.stop();
    } catch (error) {
      debug(`Error stopping network manager: ${(error as Error).message}`);
    }
    
    debug('Connection client shutdown complete');
  }

  /**
   * Register an existing socket as a connection
   * @param socket - Existing socket to register
   * @param connectionType - Type of connection
   * @param remoteAddress - Remote peer address
   * @param remotePort - Remote peer port
   * @param clientId - Client ID
   * @returns Connection object
   */
  public registerExistingConnection(
    socket: net.Socket | dgram.Socket,
    connectionType: CONNECTION_TYPE,
    remoteAddress?: string,
    remotePort?: number,
    clientId?: string
  ): Connection {
    debug(`Registering existing ${connectionType} connection to ${remoteAddress}:${remotePort}`);
    
    const clientIdentifier = clientId || this._clientId || crypto.randomBytes(8).toString('hex');
    
    // Create a peer ID if not provided based on address and port
    const peerId = `peer-${remoteAddress}-${remotePort}`;
    
    let connection: Connection;
    
    // Create appropriate connection object based on type
    if (connectionType === CONNECTION_TYPE.TCP || 
        connectionType === CONNECTION_TYPE.IPV6 ||
        connectionType === CONNECTION_TYPE.TCP_HOLE_PUNCH) {
      connection = this._createTCPConnection(peerId, socket as net.Socket, clientIdentifier);
    } else if (connectionType === CONNECTION_TYPE.UDP || 
              connectionType === CONNECTION_TYPE.UDP_HOLE_PUNCH) {
      if (!remoteAddress || !remotePort) {
        throw new Error('Remote address and port required for UDP connections');
      }
      connection = this._createUDPConnection(peerId, socket as dgram.Socket, remoteAddress, remotePort, clientIdentifier);
    } else {
      throw new Error(`Cannot register existing connection of type ${connectionType}`);
    }
    
    // Register the connection
    this.peerSession.registerConnection(peerId, connection);
    
    return connection;
  }

  /**
   * Create a file connection for a specific hash (alias for createFileTransferConnection)
   * @param fileHash - File hash
   * @param peerId - Optional peer ID to use for connection
   * @returns Connection for file transfer
   */
  public createFileConnectionForHash(fileHash: string, peerId?: string): Connection {
    debug(`Creating file connection for hash ${fileHash}`);
    
    if (peerId) {
      return this.createFileTransferConnection(fileHash, peerId);
    }
    
    // If no peer ID specified, look for any connection that might work
    const existingConnections = this.peerSession.getAllConnections();
    if (existingConnections.size === 0) {
      throw new Error('No existing connections available');
    }
    
    // Take the first available connection
    const [firstPeerId, firstConnection] = existingConnections.entries().next().value;
    debug(`Using existing connection to peer ${firstPeerId} for file ${fileHash}`);
    
    // Register this as a file connection
    this.registerFileConnection(fileHash, firstConnection);
    
    return firstConnection;
  }

  /**
   * Create a file transfer connection based on an existing peer connection
   * @param fileHash - File hash to create connection for
   * @param peerId - Peer ID to connect to (must have an existing connection)
   * @returns Connection for file transfer
   */
  public createFileTransferConnection(fileHash: string, peerId: string): Connection {
    debug(`Creating file transfer connection for hash ${fileHash} with peer ${peerId}`);
    
    // Check if we have an existing connection to this peer
    const peerConnection = this.peerSession.getConnection(peerId);
    if (!peerConnection) {
      throw new Error(`No existing connection to peer ${peerId}`);
    }
    
    // Create a unique ID for this file connection
    const fileConnectionId = `file-${fileHash}-${peerId}`;
    
    // Register the existing connection with the file connection registry
    this.registerFileConnection(fileHash, peerConnection, fileConnectionId);
    
    return peerConnection;
  }

  /**
   * Get all connections for a file
   * @param fileHash - File hash
   * @returns Array of connections for the file
   */
  public getFileConnections(fileHash: string): Connection[] {
    // Get all connections with IDs that match this file hash
    const fileConnections = Array.from(this.fileSession.getAllConnections().entries())
      .filter(([id]) => id.startsWith(`file-${fileHash}-`))
      .map(([_, connection]) => connection);
    
    debug(`Getting connections for file ${fileHash}: found ${fileConnections.length}`);
    return fileConnections;
  }
  
  /**
   * Register a file connection
   * @param fileHash - File hash
   * @param connection - Connection object
   * @param id - Optional connection ID
   */
  public registerFileConnection(fileHash: string, connection: Connection, id?: string): void {
    // Use provided ID or create one
    const fileConnectionId = id || `file-${fileHash}-${connection.clientId || crypto.randomBytes(4).toString('hex')}`;
    
    debug(`Registering file connection ${fileConnectionId} for hash ${fileHash} of type ${connection.type}`);
    
    // Register in file session
    this.fileSession.registerConnection(fileConnectionId, connection);
    
    debug(`File ${fileHash} connection registered`);
  }
  
  /**
   * Remove a file connection
   * @param fileHash - File hash
   * @param connection - Connection object
   */
  public removeFileConnection(fileHash: string, connection: Connection): void {
    const fileConnections = this.getFileConnections(fileHash);
    const index = fileConnections.indexOf(connection);
    
    if (index !== -1) {
      const fileConnectionId = `file-${fileHash}-${connection.clientId || ''}`;
      debug(`Removing file connection ${fileConnectionId} for hash ${fileHash}`);
      this.fileSession.removeConnection(fileConnectionId);
    } else {
      debug(`No matching connection found for file ${fileHash}`);
    }
  }
  
  // ============ PRIVATE IMPLEMENTATION METHODS ============
  
  /**
   * Register a successful connection
   * @private
   */
  private _registerSuccessfulConnection(
    peerId: string, 
    connection: Connection, 
    connectionType: CONNECTION_TYPE,
    address?: string,
    port?: number
  ): void {
    // Register in the peer session
    this.peerSession.registerConnection(peerId, connection);
    
    // Save to registry for future use
    connectionRegistry.saveSuccessfulConnection(
      peerId,
      connectionType,
      {
        address,
        port
      }
    ).catch(err => {
      debug(`Error saving connection to registry: ${(err as Error).message}`);
    });
    
    debug(`Registered connection to peer ${peerId} using ${connectionType}`);
  }
  
  /**
   * Create an appropriate connection object from NAT traversal result
   * @private
   */
  private _createConnectionFromNATResult(
    peerId: string,
    result: NATTraversalResult,
    clientId: string
  ): Connection {
    debug(`Creating connection from NAT traversal result of type ${result.connectionType}`);
    
    // The NAT traversal result should include a socket and connection type
    if (!result.socket) {
      throw new Error('NAT traversal succeeded but no socket was returned');
    }
    
    switch (result.connectionType) {
      case CONNECTION_TYPE.TCP:
      case CONNECTION_TYPE.IPV6:
      case CONNECTION_TYPE.TCP_HOLE_PUNCH:
      case CONNECTION_TYPE.TCP_SIMULTANEOUS_OPEN:
      case CONNECTION_TYPE.UPNP:
      case CONNECTION_TYPE.NAT_PMP:
        // All TCP-based connections use the TCP connection object
        return this._createTCPConnection(peerId, result.socket as net.Socket, clientId);
        
      case CONNECTION_TYPE.UDP:
      case CONNECTION_TYPE.UDP_HOLE_PUNCH:
      case CONNECTION_TYPE.STUN_GUN:
        // All UDP-based connections use the UDP connection object
        if (!result.remoteAddress || !result.remotePort) {
          throw new Error('UDP connection requires remote address and port');
        }
        return this._createUDPConnection(
          peerId, 
          result.socket as dgram.Socket, 
          result.remoteAddress, 
          result.remotePort, 
          clientId
        );
        
      case CONNECTION_TYPE.ICE:
      case CONNECTION_TYPE.WEBRTC:
        // WebRTC connections
        if (result.dataChannel && result.peerConnection) {
          return this._createWebRTCConnection(
            peerId,
            result.peerConnection,
            result.dataChannel,
            clientId
          );
        }
        throw new Error('WebRTC connection requires a data channel and peer connection');
        
      case CONNECTION_TYPE.TURN:
        // TURN connections might be TCP or UDP
        if (result.protocol === 'TCP') {
          return this._createTCPConnection(peerId, result.socket as net.Socket, clientId);
        } else {
          if (!result.remoteAddress || !result.remotePort) {
            throw new Error('UDP TURN connection requires remote address and port');
          }
          return this._createUDPConnection(
            peerId, 
            result.socket as dgram.Socket, 
            result.remoteAddress, 
            result.remotePort, 
            clientId
          );
        }
        
      case CONNECTION_TYPE.GUN:
        if (!this._gun) {
          throw new Error('Gun relay connection requires a Gun instance');
        }
        return this._createGunRelayConnection(peerId, this._gun, clientId);
        
      default:
        throw new Error(`Unsupported connection type: ${result.connectionType}`);
    }
  }

  /**
   * Create a TCP connection from an existing socket
   * @private
   */
  private _createTCPConnection(peerId: string, socket: net.Socket, clientId: string): TCPConnection {
    debug(`Creating TCP connection to peer ${peerId} from ${socket.remoteAddress}:${socket.remotePort}`);
    const messageHandlers = new Map<string, MessageHandler>();
    
    const connection: TCPConnection = {
      type: CONNECTION_TYPE.TCP,
      clientId,
      socket,
      messageHandlers,
      
      send: async (messageType: string, data: unknown) => {
        return new Promise<void>((resolve, reject) => {
          const message = {
            type: messageType,
            clientId,
            ...(data as object)
          };
          
          debug(`Sending TCP message of type ${messageType} to peer ${peerId}`);
          socket.write(JSON.stringify(message), (err) => {
            if (err) {
              debug(`Error sending TCP message: ${err}`);
              reject(err);
            } else {
              resolve();
            }
          });
        });
      },
      
      on: (messageType: string, handler: MessageHandler) => {
        debug(`Adding handler for message type ${messageType}`);
        messageHandlers.set(messageType, handler);
      },
      
      close: () => {
        debug(`Closing TCP connection to peer ${peerId}`);
        socket.destroy();
      },
      
      removeListener: (messageType: string, handler: MessageHandler) => {
        debug(`Removing handler for message type ${messageType}`);
        const currentHandler = messageHandlers.get(messageType);
        if (currentHandler === handler) {
          messageHandlers.delete(messageType);
          debug(`Handler removed for message type ${messageType}`);
        }
      }
    };
    
    // Handle incoming data
    socket.on('data', (data) => {
      try {
        const message = JSON.parse(data.toString('utf8'));
        debug(`Received TCP message of type ${message.type} from peer ${peerId}`);
        const handler = messageHandlers.get(message.type);
        if (handler) {
          handler(message);
        }
      } catch (err) {
        debug(`Error parsing TCP message: ${err}`);
      }
    });
    
    socket.on('error', (err) => {
      debug(`TCP socket error for peer ${peerId}: ${err}`);
    });
    
    socket.on('close', () => {
      debug(`TCP connection to peer ${peerId} closed`);
      // Automatically remove from session when closed
      this.peerSession.removeConnection(peerId);
    });
    
    return connection;
  }
  
  /**
   * Create a UDP connection
   * @private
   */
  private _createUDPConnection(
    peerId: string, 
    socket: dgram.Socket, 
    remoteAddress: string, 
    remotePort: number, 
    clientId: string
  ): UDPConnection {
    debug(`Creating UDP connection to peer ${peerId} at ${remoteAddress}:${remotePort}`);
    const messageHandlers = new Map<string, MessageHandler>();
    
    const connection: UDPConnection = {
      type: CONNECTION_TYPE.UDP,
      clientId,
      socket,
      remoteAddress,
      remotePort,
      messageHandlers,
      
      send: async (messageType: string, data: unknown) => {
        return new Promise<void>((resolve, reject) => {
          const message = {
            type: messageType,
            clientId,
            ...(data as object)
          };
          
          debug(`Sending UDP message of type ${messageType} to peer ${peerId}`);
          const buffer = Buffer.from(JSON.stringify(message));
          socket.send(buffer, remotePort, remoteAddress, (err) => {
            if (err) {
              debug(`Error sending UDP message: ${err}`);
              reject(err);
            } else {
              resolve();
            }
          });
        });
      },
      
      on: (messageType: string, handler: MessageHandler) => {
        debug(`Adding handler for message type ${messageType}`);
        messageHandlers.set(messageType, handler);
      },
      
      close: () => {
        debug(`Closing UDP connection to peer ${peerId}`);
        socket.close();
      },
      
      removeListener: (messageType: string, handler: MessageHandler) => {
        debug(`Removing handler for message type ${messageType}`);
        const currentHandler = messageHandlers.get(messageType);
        if (currentHandler === handler) {
          messageHandlers.delete(messageType);
          debug(`Handler removed for message type ${messageType}`);
        }
      }
    };
    
    // Handle incoming messages
    socket.on('message', (data, rinfo) => {
      // Verify the message is from the expected peer
      if (rinfo.address === remoteAddress && rinfo.port === remotePort) {
        try {
          const message = JSON.parse(data.toString('utf8'));
          debug(`Received UDP message of type ${message.type} from peer ${peerId}`);
          const handler = messageHandlers.get(message.type);
          if (handler) {
            handler(message);
          }
        } catch (err) {
          debug(`Error parsing UDP message: ${err}`);
        }
      } else {
        debug(`Received UDP message from unexpected source: ${rinfo.address}:${rinfo.port}`);
      }
    });
    
    socket.on('error', (err) => {
      debug(`UDP socket error for peer ${peerId}: ${err}`);
    });
    
    socket.on('close', () => {
      debug(`UDP connection to peer ${peerId} closed`);
      // Automatically remove from session when closed
      this.peerSession.removeConnection(peerId);
    });
    
    return connection;
  }
  
  /**
   * Create a WebRTC connection
   * @private
   */
  private _createWebRTCConnection(
    peerId: string, 
    peerConnection: PeerConnection, 
    dataChannel: DataChannel, 
    clientId: string
  ): WebRTCConnection {
    debug(`Creating WebRTC connection to peer ${peerId}`);
    const messageHandlers = new Map<string, MessageHandler>();
    
    const connection: WebRTCConnection = {
      type: CONNECTION_TYPE.WEBRTC,
      clientId,
      peerConnection,
      dataChannel,
      messageHandlers,
      
      send: async (messageType: string, data: unknown) => {
        return new Promise<void>((resolve, reject) => {
          try {
            const message = {
              type: messageType,
              clientId,
              ...(data as object)
            };
            
            debug(`Sending WebRTC message of type ${messageType} to peer ${peerId}`);
            dataChannel.sendMessage(JSON.stringify(message));
            resolve();
          } catch (err) {
            debug(`Error sending WebRTC message: ${err}`);
            reject(err);
          }
        });
      },
      
      on: (messageType: string, handler: MessageHandler) => {
        debug(`Adding handler for message type ${messageType}`);
        messageHandlers.set(messageType, handler);
      },
      
      close: () => {
        debug(`Closing WebRTC connection to peer ${peerId}`);
        dataChannel.close();
        peerConnection.close();
      },
      
      removeListener: (messageType: string, handler: MessageHandler) => {
        debug(`Removing handler for message type ${messageType}`);
        const currentHandler = messageHandlers.get(messageType);
        if (currentHandler === handler) {
          messageHandlers.delete(messageType);
          debug(`Handler removed for message type ${messageType}`);
        }
      }
    };
    
    // Handle incoming messages
    dataChannel.onMessage((data: string) => {
      try {
        const message = JSON.parse(data);
        debug(`Received WebRTC message of type ${message.type} from peer ${peerId}`);
        const handler = messageHandlers.get(message.type);
        if (handler) {
          handler(message);
        }
      } catch (err) {
        debug(`Error parsing WebRTC message: ${err}`);
      }
    });
    
    dataChannel.onClosed(() => {
      debug(`WebRTC data channel to peer ${peerId} closed`);
      // Automatically remove from session when closed
      this.peerSession.removeConnection(peerId);
    });
    
    return connection;
  }
  
  /**
   * Create a Gun relay connection
   * @private
   */
  private _createGunRelayConnection(
    peerId: string, 
    gun: GunInstance, 
    clientId: string
  ): GunRelayConnection {
    // Use the class property instead of the parameter
    clientId = this._clientId || clientId;
    
    debug(`Creating Gun relay connection to peer ${peerId}`);
    const messageHandlers = new Map<string, MessageHandler>();
    
    const connection: GunRelayConnection = {
      type: CONNECTION_TYPE.GUN,
      clientId,
      messageHandlers,
      
      send: async (messageType: string, data: unknown) => {
        return new Promise<void>((resolve) => {
          const messageId = crypto.randomBytes(8).toString('hex');
          
          debug(`Sending Gun relay message of type ${messageType} to peer ${peerId} (messageId: ${messageId})`);
          gun.get('hosts').get(peerId).get('messages').set({
            type: 'request',
            clientId,
            messageId,
            request: {
              type: messageType,
              ...(data as object)
            },
            timestamp: Date.now()
          });
          
          resolve();
        });
      },
      
      on: (messageType: string, handler: MessageHandler) => {
        debug(`Adding handler for message type ${messageType}`);
        messageHandlers.set(messageType, handler);
        
        // Subscribe to Gun messages for this type
        gun.get('clients').get(clientId).get('messages').on((message) => {
          if (message && typeof message === 'object' && 'type' in message && message.type === messageType) {
            debug(`Received Gun relay message of type ${messageType} from peer ${peerId}`);
            handler(message);
          }
        });
      },
      
      close: () => {
        debug(`Closing Gun relay connection to peer ${peerId}`);
        // Unsubscribe from all Gun messages
        gun.get('clients').get(clientId).get('messages').off();
      },
      
      removeListener: (messageType: string, handler: MessageHandler) => {
        debug(`Removing handler for message type ${messageType}`);
        const currentHandler = messageHandlers.get(messageType);
        if (currentHandler === handler) {
          messageHandlers.delete(messageType);
          debug(`Handler removed for message type ${messageType}`);
        }
      }
    };
    
    return connection;
  }
} 
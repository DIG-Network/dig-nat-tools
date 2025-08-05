/**
 * Network Connection Manager
 * 
 * Provides a high-level interface for managing network connections
 * in the Dig NAT Tools system.
 */

import * as net from 'net';
import * as dgram from 'dgram';
import * as crypto from 'crypto';
import Debug from 'debug';
import { EventEmitter } from 'events';
import {
  connectToFirstAvailableAddress,
  connectWithIPv6Preference,
  createTCPServerBound,
  createUDPSocketBound
} from './network-utils';
import type { 
  NetworkManagerConfig,
  NetworkConnectionResult,
  ConnectionOptions,
} from '../../types/network';

const debug = Debug('dig-nat-tools:connection:network-manager');

/**
 * Network Connection Manager
 * 
 * Manages network connections and servers for the application.
 */
export class NetworkManager extends EventEmitter {
  private config: NetworkManagerConfig;
  private tcpServer: net.Server | null = null;
  private udpSocket: dgram.Socket | null = null;
  private tcpConnections: Map<string, net.Socket> = new Map();
  private udpConnections: Map<string, { socket: dgram.Socket, address: string, port: number }> = new Map();
  private isRunning: boolean = false;
  
  /**
   * Create a network manager
   * @param config - Configuration options
   */
  constructor(config: NetworkManagerConfig = {}) {
    super();
    
    // Set default configuration
    this.config = {
      enableIPv6: config.enableIPv6 !== false,
      preferIPv6: config.preferIPv6 !== false,
      enableTCP: config.enableTCP !== false,
      enableUDP: config.enableUDP !== false,
      tcpPort: config.tcpPort || 0, // Default to random port
      udpPort: config.udpPort || 0, // Default to random port
      connectionTimeout: config.connectionTimeout || 30000, // 30 seconds
      reuseAddr: config.reuseAddr !== false,
      backlog: config.backlog || 511
    };
    
    debug('Network manager created with config:', this.config);
  }
  
  /**
   * Start the network manager
   * @returns Promise that resolves when servers are started
   */
  public async start(): Promise<{ tcpPort?: number, udpPort?: number }> {
    if (this.isRunning) {
      debug('Network manager already running');
      return {
        tcpPort: this.tcpServer ? (this.tcpServer.address() as net.AddressInfo).port : undefined,
        udpPort: this.udpSocket ? (this.udpSocket.address() as net.AddressInfo).port : undefined
      };
    }
    
    debug('Starting network manager');
    
    const result: { tcpPort?: number, udpPort?: number } = {};
    
    try {
      // Start TCP server if enabled
      if (this.config.enableTCP) {
        this.tcpServer = await createTCPServerBound(this.config.tcpPort, {
          enableIPv6: this.config.enableIPv6,
          backlog: this.config.backlog
        });
        
        // Set up connection handler
        this.tcpServer.on('connection', this._handleTCPConnection.bind(this));
        
        // Store the actual port
        result.tcpPort = (this.tcpServer.address() as net.AddressInfo).port;
        debug(`TCP server listening on port ${result.tcpPort}`);
      }
      
      // Start UDP socket if enabled
      if (this.config.enableUDP) {
        this.udpSocket = await createUDPSocketBound(this.config.udpPort, {
          enableIPv6: this.config.enableIPv6,
          reuseAddr: this.config.reuseAddr
        });
        
        // Set up message handler
        this.udpSocket.on('message', this._handleUDPMessage.bind(this));
        
        // Store the actual port
        result.udpPort = (this.udpSocket.address() as net.AddressInfo).port;
        debug(`UDP socket listening on port ${result.udpPort}`);
      }
      
      this.isRunning = true;
      return result;
    } catch (error) {
      debug(`Error starting network manager: ${(error as Error).message}`);
      
      // Clean up any resources that were created
      await this.stop();
      
      throw error;
    }
  }
  
  /**
   * Stop the network manager
   * @returns Promise that resolves when servers are stopped
   */
  public async stop(): Promise<void> {
    debug('Stopping network manager');
    
    // Close all TCP connections
    for (const [id, socket] of this.tcpConnections.entries()) {
      try {
        socket.destroy();
        debug(`Closed TCP connection ${id}`);
      } catch (error) {
        debug(`Error closing TCP connection ${id}: ${(error as Error).message}`);
      }
    }
    this.tcpConnections.clear();
    
    // Close all UDP connections
    for (const [id, connection] of this.udpConnections.entries()) {
      try {
        connection.socket.close();
        debug(`Closed UDP connection ${id}`);
      } catch (error) {
        debug(`Error closing UDP connection ${id}: ${(error as Error).message}`);
      }
    }
    this.udpConnections.clear();
    
    // Close TCP server
    if (this.tcpServer) {
      await new Promise<void>((resolve) => {
        this.tcpServer!.close(() => {
          debug('TCP server closed');
          resolve();
        });
      });
      this.tcpServer = null;
    }
    
    // Close UDP socket
    if (this.udpSocket) {
      await new Promise<void>((resolve) => {
        this.udpSocket!.close(() => {
          debug('UDP socket closed');
          resolve();
        });
      });
      this.udpSocket = null;
    }
    
    this.isRunning = false;
    debug('Network manager stopped');
  }
  
  /**
   * Connect to a peer
   * @param address - Peer address
   * @param port - Peer port
   * @param protocol - 'tcp' or 'udp'
   * @param options - Connection options
   * @returns Promise that resolves to connection result
   */
  public async connectToPeer(
    address: string,
    port: number,
    protocol: 'tcp' | 'udp',
    options: ConnectionOptions = {}
  ): Promise<NetworkConnectionResult> {
    debug(`Connecting to peer ${address}:${port} via ${protocol}`);
    
    // Set up connection options
    const connectionOptions: ConnectionOptions = {
      timeout: options.timeout || this.config.connectionTimeout,
      preferIPv6: options.preferIPv6 !== undefined ? options.preferIPv6 : this.config.preferIPv6,
      enableIPv6: options.enableIPv6 !== undefined ? options.enableIPv6 : this.config.enableIPv6,
      onConnection: options.onConnection,
      onError: options.onError
    };
    
    try {
      // Connect to the peer with IPv6 preference
      const result = await connectWithIPv6Preference(address, port, protocol, connectionOptions);
      
      // Generate a unique ID for this connection
      const connectionId = this._generateConnectionId(result.address, result.port, protocol);
      
      // Store the connection
      if (protocol === 'tcp') {
        this.tcpConnections.set(connectionId, result.socket as net.Socket);
      } else {
        this.udpConnections.set(connectionId, {
          socket: result.socket as dgram.Socket,
          address: result.address,
          port: result.port
        });
      }
      
      debug(`Connected to peer ${result.address}:${result.port} via ${protocol} (${result.socketType})`);
      return result;
    } catch (error) {
      debug(`Failed to connect to peer ${address}:${port} via ${protocol}: ${(error as Error).message}`);
      throw error;
    }
  }
  
  /**
   * Connect to the first available address from a list
   * @param addresses - List of addresses to try
   * @param port - Port to connect to
   * @param protocol - 'tcp' or 'udp'
   * @param options - Connection options
   * @returns Promise that resolves to connection result
   */
  public async connectToFirstAvailable(
    addresses: string[],
    port: number,
    protocol: 'tcp' | 'udp',
    options: ConnectionOptions = {}
  ): Promise<NetworkConnectionResult> {
    debug(`Connecting to first available address from ${addresses.length} addresses via ${protocol}`);
    
    // Set up connection options
    const connectionOptions: ConnectionOptions = {
      timeout: options.timeout || this.config.connectionTimeout,
      preferIPv6: options.preferIPv6 !== undefined ? options.preferIPv6 : this.config.preferIPv6,
      enableIPv6: options.enableIPv6 !== undefined ? options.enableIPv6 : this.config.enableIPv6,
      onConnection: options.onConnection,
      onError: options.onError
    };
    
    try {
      // Connect to the first available address
      const result = await connectToFirstAvailableAddress(addresses, port, protocol, connectionOptions);
      
      // Generate a unique ID for this connection
      const connectionId = this._generateConnectionId(result.address, result.port, protocol);
      
      // Store the connection
      if (protocol === 'tcp') {
        this.tcpConnections.set(connectionId, result.socket as net.Socket);
      } else {
        this.udpConnections.set(connectionId, {
          socket: result.socket as dgram.Socket,
          address: result.address,
          port: result.port
        });
      }
      
      debug(`Connected to peer ${result.address}:${result.port} via ${protocol} (${result.socketType})`);
      return result;
    } catch (error) {
      debug(`Failed to connect to any address via ${protocol}: ${(error as Error).message}`);
      throw error;
    }
  }
  
  /**
   * Close a connection
   * @param id - Connection ID
   * @returns True if the connection was closed, false if not found
   */
  public closeConnection(id: string): boolean {
    // Try TCP connection first
    if (this.tcpConnections.has(id)) {
      const socket = this.tcpConnections.get(id)!;
      socket.destroy();
      this.tcpConnections.delete(id);
      debug(`Closed TCP connection ${id}`);
      return true;
    }
    
    // Try UDP connection next
    if (this.udpConnections.has(id)) {
      const connection = this.udpConnections.get(id)!;
      connection.socket.close();
      this.udpConnections.delete(id);
      debug(`Closed UDP connection ${id}`);
      return true;
    }
    
    debug(`Connection ${id} not found`);
    return false;
  }
  
  /**
   * Get the TCP port if the server is running
   * @returns TCP port or undefined if not running
   */
  public getTCPPort(): number | undefined {
    if (this.tcpServer) {
      return (this.tcpServer.address() as net.AddressInfo).port;
    }
    return undefined;
  }
  
  /**
   * Get the UDP port if the socket is running
   * @returns UDP port or undefined if not running
   */
  public getUDPPort(): number | undefined {
    if (this.udpSocket) {
      return (this.udpSocket.address() as net.AddressInfo).port;
    }
    return undefined;
  }
  
  /**
   * Handle TCP connection
   * @private
   * @param socket - TCP socket
   */
  private _handleTCPConnection(socket: net.Socket): void {
    const remoteAddress = socket.remoteAddress || 'unknown';
    const remotePort = socket.remotePort || 0;
    
    debug(`New TCP connection from ${remoteAddress}:${remotePort}`);
    
    // Generate a unique ID for this connection
    const connectionId = this._generateConnectionId(remoteAddress, remotePort, 'tcp');
    
    // Store the connection
    this.tcpConnections.set(connectionId, socket);
    
    // Emit connection event
    this.emit('connection', {
      type: 'tcp',
      id: connectionId,
      address: remoteAddress,
      port: remotePort,
      socket
    });
    
    // Handle connection close
    socket.on('close', () => {
      debug(`TCP connection ${connectionId} closed`);
      this.tcpConnections.delete(connectionId);
      this.emit('connection:close', {
        type: 'tcp',
        id: connectionId,
        address: remoteAddress,
        port: remotePort
      });
    });
    
    // Handle connection error
    socket.on('error', (err) => {
      debug(`TCP connection ${connectionId} error: ${err.message}`);
      this.emit('connection:error', {
        type: 'tcp',
        id: connectionId,
        address: remoteAddress,
        port: remotePort,
        error: err
      });
    });
    
    // Let subclasses handle the connection data
    socket.on('data', (data) => {
      this._handleTCPData(socket, data, connectionId);
      this.emit('data', {
        type: 'tcp',
        id: connectionId,
        address: remoteAddress,
        port: remotePort,
        data
      });
    });
  }
  
  /**
   * Handle UDP message
   * @private
   * @param msg - UDP message
   * @param rinfo - Remote info
   */
  private _handleUDPMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    const remoteAddress = rinfo.address;
    const remotePort = rinfo.port;
    
    debug(`UDP message from ${remoteAddress}:${remotePort} (${msg.length} bytes)`);
    
    // Generate a unique ID for this connection
    const connectionId = this._generateConnectionId(remoteAddress, remotePort, 'udp');
    
    // Store the connection if it's new
    if (!this.udpConnections.has(connectionId) && this.udpSocket) {
      this.udpConnections.set(connectionId, {
        socket: this.udpSocket,
        address: remoteAddress,
        port: remotePort
      });
      
      debug(`New UDP connection from ${remoteAddress}:${remotePort}`);
      
      // Emit connection event
      this.emit('connection', {
        type: 'udp',
        id: connectionId,
        address: remoteAddress,
        port: remotePort,
        socket: this.udpSocket
      });
    }
    
    // Let subclasses handle the message data
    this._handleUDPData(msg, rinfo, connectionId);
    
    // Emit data event
    this.emit('data', {
      type: 'udp',
      id: connectionId,
      address: remoteAddress,
      port: remotePort,
      data: msg
    });
  }
  
  /**
   * Handle TCP data
   * @protected
   * @param socket - TCP socket
   * @param data - Socket data
   * @param connectionId - Connection ID
   */
  protected _handleTCPData(socket: net.Socket, data: Buffer, connectionId: string): void {
    const remoteAddress = socket.remoteAddress || 'unknown';
    const remotePort = socket.remotePort || 0;
    
    debug(`Received TCP data from ${remoteAddress}:${remotePort} (${data.length} bytes)`);
    
    // Emit raw data event for consumers to handle
    this.emit('tcp:data', {
      connectionId,
      socket,
      data,
      address: remoteAddress,
      port: remotePort
    });
  }
  
  /**
   * Handle UDP data
   * @protected
   * @param msg - UDP message
   * @param rinfo - Remote info
   * @param connectionId - Connection ID
   */
  protected _handleUDPData(msg: Buffer, rinfo: dgram.RemoteInfo, connectionId: string): void {
    debug(`Received UDP data from ${rinfo.address}:${rinfo.port} (${msg.length} bytes)`);
    
    // Get the socket associated with this connection
    const connection = this.udpConnections.get(connectionId);
    if (!connection) {
      debug(`No UDP connection found for ${connectionId}`);
      return;
    }
    
    // Emit raw data event for consumers to handle
    this.emit('udp:data', {
      connectionId,
      socket: connection.socket,
      data: msg,
      address: rinfo.address,
      port: rinfo.port
    });
  }
  
  /**
   * Generate a unique connection ID
   * @private
   * @param address - Remote address
   * @param port - Remote port
   * @param protocol - 'tcp' or 'udp'
   * @returns Unique connection ID
   */
  private _generateConnectionId(address: string, port: number, protocol: 'tcp' | 'udp'): string {
    return `${protocol}-${address}-${port}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }
}

// Export singleton instance
export const networkManager = new NetworkManager();
export default networkManager; 
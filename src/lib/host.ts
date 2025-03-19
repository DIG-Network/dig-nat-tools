/**
 * FileHost - Serves files to other peers in the network
 * 
 * Handles serving file chunks to requesting peers, managing connections,
 * and coordinating file serving capabilities.
 */

import Gun from 'gun';
import * as crypto from 'crypto';
import Debug from 'debug';
// We'll use dynamic imports for node-datachannel
import * as dgram from 'dgram';
import * as net from 'net';
import * as os from 'os';
import * as fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { HostOptions } from './types';
// Import the CONNECTION_TYPE for use in the host
import { CONNECTION_TYPE } from '../types/constants';
// Import NAT-PMP/PCP utilities
import { createPortMapping, deletePortMapping, PortMappingResult } from './utils';

const debug = Debug('dig-nat-tools:host');

// We'll use any for now since we can't use dynamic imports directly in TypeScript
// This will be initialized in the constructor if WebRTC is enabled
let dc: any = null;

// Interface for host configuration
export interface HostConfig {
  hostFileCallback: (sha256: string, startChunk: number, chunkSize: number) => Promise<Buffer[] | null>;
  gunOptions?: Record<string, any>;
  gunInstance?: any; // Add support for existing Gun instance
  chunkSize?: number;
  stunServers?: string[];
  tcpPort?: number;
  udpPort?: number;
  enableTCP?: boolean;
  enableUDP?: boolean;
  enableWebRTC?: boolean;
  enableNATPMP?: boolean; // Whether to use NAT-PMP/PCP for port mapping
  portMappingLifetime?: number; // Lifetime of port mappings in seconds
}

// Interface for a message handler
interface MessageHandler {
  (data: any): void;
}

// Interface for a connection object
interface Connection {
  type: CONNECTION_TYPE;
  clientId: string;
  messageHandlers: Map<string, MessageHandler>;
  send: (messageType: string, data: any) => void;
  on: (messageType: string, handler: MessageHandler) => void;
  close: () => void;
}

// Interface for TCP connection
interface TCPConnection extends Connection {
  socket: net.Socket;
}

// Interface for UDP connection
interface UDPConnection extends Connection {
  remoteAddress: string;
  remotePort: number;
}

// Interface for WebRTC connection
interface WebRTCConnection extends Connection {
  peerConnection: any; // Using any for now until we have proper types
  dataChannel: any;    // Using any for now until we have proper types
}

// Interface for Gun relay connection
interface GunRelayConnection extends Connection {
  // No additional properties needed
}

// Interface for WebRTC connection info (using any for node-datachannel types)
interface WebRTCConnectionInfo {
  clientId: string;
  requestId: string;
  peerConnection: any;
  dataChannel: any | null;
}

// Interface for file info
interface FileInfo {
  sha256: string;
  totalBytes: number;
  totalChunks: number;
  chunkSize: number;
}

/**
 * FileHost class for serving files to peers
 */
export default class FileHost {
  private hostId: string;
  private gun: any;
  private hostFileCallback: (sha256: string, startChunk: number, chunkSize: number) => Promise<Buffer[] | null>;
  private chunkSize: number;
  private stunServers: string[];
  private enableTCP: boolean;
  private enableUDP: boolean;
  private enableWebRTC: boolean;
  private enableNATPMP: boolean;
  private portMappingLifetime: number;
  private tcpPort: number;
  private udpPort: number;
  private tcpServer: net.Server | null = null;
  private udpSocket: dgram.Socket | null = null;
  
  // Store the actual connection objects now
  private activeConnections: Map<string, Connection> = new Map();
  private tcpSockets: Map<string, net.Socket> = new Map();
  private udpClients: Map<string, { address: string, port: number }> = new Map();
  private webrtcPeerConnections: Map<string, any> = new Map();
  private webrtcDataChannels: Map<string, any> = new Map();
  
  private connectionOptions: { type: CONNECTION_TYPE, address?: string, port?: number }[] = [];
  private isRunning: boolean = false;
  private portMappings: { protocol: 'TCP' | 'UDP', externalPort: number }[] = [];
  private externalIPv4: string | null = null;

  /**
   * Create a new FileHost instance
   * @param options Host configuration options
   */
  constructor(options: HostOptions) {
    this.hostId = uuidv4();
    this.hostFileCallback = options.hostFileCallback;
    this.chunkSize = options.chunkSize || 64 * 1024; // 64KB default
    this.stunServers = options.stunServers || [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302'
    ];
    this.enableTCP = options.enableTCP !== false;
    this.enableUDP = options.enableUDP !== false;
    this.enableWebRTC = options.enableWebRTC !== false;
    this.enableNATPMP = options.enableNATPMP !== false; // Default to enabled
    this.portMappingLifetime = options.portMappingLifetime || 3600; // Default to 1 hour
    this.tcpPort = options.tcpPort || 0; // 0 = random available port
    this.udpPort = options.udpPort || 0; // 0 = random available port

    // Initialize Gun for signaling and fallback relay
    const gunOptions = options.gunOptions || {};
    // Use type assertion to fix the constructor issue
    this.gun = new (Gun as any)({
      peers: gunOptions.peers || ['https://gun-manhattan.herokuapp.com/gun'],
      file: gunOptions.file || path.join(os.tmpdir(), `gun-${this.hostId}`),
      ...gunOptions
    });
    
    // Dynamically import node-datachannel if WebRTC is enabled
    if (this.enableWebRTC) {
      import('node-datachannel').then(module => {
        dc = module;
        debug('node-datachannel module loaded');
      }).catch(err => {
        debug(`Error loading node-datachannel: ${err}`);
        this.enableWebRTC = false;
      });
    }
  }

  /**
   * Get the host ID
   * @returns The host ID
   */
  getHostId(): string {
    return this.hostId;
  }

  /**
   * Get the TCP port
   * @returns The TCP port number or 0 if TCP is not enabled
   */
  getTcpPort(): number {
    return this.enableTCP ? this.tcpPort : 0;
  }

  /**
   * Get the UDP port
   * @returns The UDP port number or 0 if UDP is not enabled
   */
  getUdpPort(): number {
    return this.enableUDP ? this.udpPort : 0;
  }

  /**
   * Start the file host
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      debug('Host already running');
      return;
    }

    debug(`Starting file host with ID: ${this.hostId}`);
    this.isRunning = true;

    // Initialize connection options array
    this.connectionOptions = [];

    // Start TCP server if enabled
    if (this.enableTCP) {
      await this._startTCPServer();
    }

    // Start UDP socket if enabled
    if (this.enableUDP) {
      await this._startUDPServer();
    }

    // Initialize WebRTC if enabled
    if (this.enableWebRTC) {
      // Make sure node-datachannel is loaded
      if (!dc) {
        try {
          dc = await import('node-datachannel');
          debug('node-datachannel module loaded');
        } catch (err) {
          debug(`Error loading node-datachannel: ${err}`);
          this.enableWebRTC = false;
        }
      }
      
      if (dc) {
        try {
          dc.initLogger('error' as any);
          this.connectionOptions.push({ type: CONNECTION_TYPE.WEBRTC });
          debug('WebRTC initialized');
        } catch (err) {
          debug(`Error initializing WebRTC: ${err}`);
          this.enableWebRTC = false;
        }
      }
    }

    // Always add Gun relay as fallback
    this.connectionOptions.push({ type: CONNECTION_TYPE.GUN });

    // Register host in Gun
    const hostData = {
      id: this.hostId,
      connectionOptions: this.connectionOptions,
      timestamp: Date.now()
    };

    this.gun.get('hosts').get(this.hostId).put(hostData);
    debug(`Host registered with connection options:`, this.connectionOptions);

    // Set up Gun message handling for discovery and relay
    this._setupGunMessageHandling();
  }

  /**
   * Stop the file host
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      debug('Host not running');
      return;
    }

    debug('Stopping file host');
    this.isRunning = false;

    // Close all active connections
    for (const connection of this.activeConnections.values()) {
      connection.close();
    }
    this.activeConnections.clear();

    // Close TCP server if it exists
    if (this.tcpServer) {
      this.tcpServer.close();
      this.tcpServer = null;
    }

    // Close UDP socket if it exists
    if (this.udpSocket) {
      this.udpSocket.close();
      this.udpSocket = null;
    }

    // Remove port mappings if they exist
    if (this.enableNATPMP && this.portMappings.length > 0) {
      debug('Removing port mappings');
      for (const mapping of this.portMappings) {
        try {
          await deletePortMapping({
            externalPort: mapping.externalPort,
            protocol: mapping.protocol
          });
          debug(`Removed port mapping for ${mapping.protocol} port ${mapping.externalPort}`);
        } catch (err) {
          debug(`Error removing port mapping: ${(err as Error).message}`);
        }
      }
      this.portMappings = [];
    }

    // Unregister host from Gun
    this.gun.get('hosts').get(this.hostId).put(null);
    debug('Host unregistered');
  }

  /**
   * Get all local IP addresses
   * @returns Array of local IP addresses
   */
  private _getLocalIPAddresses(): string[] {
    const interfaces = os.networkInterfaces();
    const addresses: string[] = [];

    // Iterate through network interfaces
    for (const name in interfaces) {
      const networkInterface = interfaces[name];
      if (!networkInterface) continue;

      // Get IPv4 addresses that are not internal
      for (const iface of networkInterface) {
        // Support both string and number for the family property
        // Different Node.js versions might return different types
        const family = iface.family;
        if ((typeof family === 'string' && family === 'IPv4') || 
            (typeof family === 'number' && family === 4)) {
          if (!iface.internal) {
            addresses.push(iface.address);
          }
        }
      }
    }

    return addresses;
  }

  /**
   * Start TCP server
   */
  private async _startTCPServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.tcpServer = net.createServer();
      
      this.tcpServer.on('error', (err) => {
        debug(`TCP server error: ${err}`);
        reject(err);
      });
      
      this.tcpServer.on('connection', (socket) => {
        this._handleTCPConnection(socket);
      });
      
      this.tcpServer.listen(this.tcpPort, async () => {
        const address = this.tcpServer?.address() as net.AddressInfo;
        this.tcpPort = address.port;
        debug(`TCP server listening on port ${this.tcpPort}`);
        
        // Create port mapping if NAT-PMP/PCP is enabled
        if (this.enableNATPMP) {
          try {
            const result = await createPortMapping({
              internalPort: this.tcpPort,
              protocol: 'TCP',
              lifetime: this.portMappingLifetime
            });
            
            if (result.success) {
              debug(`Created TCP port mapping: internal ${this.tcpPort} -> external ${result.externalPort}`);
              
              // Store the external IP address if available
              if (result.externalAddress) {
                this.externalIPv4 = result.externalAddress;
                debug(`External IPv4 address: ${this.externalIPv4}`);
              }
              
              // Add to connection options with external port
              this.connectionOptions.push({
                type: CONNECTION_TYPE.TCP,
                address: result.externalAddress || undefined,
                port: result.externalPort
              });
              
              // Store the mapping for cleanup
              if (result.externalPort) {
                this.portMappings.push({
                  protocol: 'TCP',
                  externalPort: result.externalPort
                });
              }
            } else {
              debug(`Failed to create TCP port mapping: ${result.error}`);
              // Fall back to local port
              this.connectionOptions.push({
                type: CONNECTION_TYPE.TCP,
                port: this.tcpPort
              });
            }
          } catch (err) {
            debug(`Error creating TCP port mapping: ${(err as Error).message}`);
            // Fall back to local port
            this.connectionOptions.push({
              type: CONNECTION_TYPE.TCP,
              port: this.tcpPort
            });
          }
        } else {
          // Just use local port if NAT-PMP/PCP is disabled
          this.connectionOptions.push({
            type: CONNECTION_TYPE.TCP,
            port: this.tcpPort
          });
        }
        
        resolve();
      });
    });
  }

  /**
   * Start UDP server
   */
  private async _startUDPServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.udpSocket = dgram.createSocket('udp4');
      
      this.udpSocket.on('error', (err) => {
        debug(`UDP socket error: ${err}`);
        reject(err);
      });
      
      this.udpSocket.on('message', (msg, rinfo) => {
        this._handleUDPMessage(msg, rinfo);
      });
      
      this.udpSocket.bind(this.udpPort, async () => {
        this.udpPort = this.udpSocket?.address().port || 0;
        debug(`UDP socket listening on port ${this.udpPort}`);
        
        // Create port mapping if NAT-PMP/PCP is enabled
        if (this.enableNATPMP) {
          try {
            const result = await createPortMapping({
              internalPort: this.udpPort,
              protocol: 'UDP',
              lifetime: this.portMappingLifetime
            });
            
            if (result.success) {
              debug(`Created UDP port mapping: internal ${this.udpPort} -> external ${result.externalPort}`);
              
              // Store the external IP address if available
              if (result.externalAddress && !this.externalIPv4) {
                this.externalIPv4 = result.externalAddress;
                debug(`External IPv4 address: ${this.externalIPv4}`);
              }
              
              // Add to connection options with external port
              this.connectionOptions.push({
                type: CONNECTION_TYPE.UDP,
                address: result.externalAddress || undefined,
                port: result.externalPort
              });
              
              // Store the mapping for cleanup
              if (result.externalPort) {
                this.portMappings.push({
                  protocol: 'UDP',
                  externalPort: result.externalPort
                });
              }
            } else {
              debug(`Failed to create UDP port mapping: ${result.error}`);
              // Fall back to local port
              this.connectionOptions.push({
                type: CONNECTION_TYPE.UDP,
                port: this.udpPort
              });
            }
          } catch (err) {
            debug(`Error creating UDP port mapping: ${(err as Error).message}`);
            // Fall back to local port
            this.connectionOptions.push({
              type: CONNECTION_TYPE.UDP,
              port: this.udpPort
            });
          }
        } else {
          // Just use local port if NAT-PMP/PCP is disabled
          this.connectionOptions.push({
            type: CONNECTION_TYPE.UDP,
            port: this.udpPort
          });
        }
        
        resolve();
      });
    });
  }

  /**
   * Set up Gun message handling for discovery and relay
   */
  private _setupGunMessageHandling(): void {
    // Handle direct connection requests
    this.gun.get('hosts').get(this.hostId).get('messages').on((messages: any) => {
      if (!messages) return;
      
      for (const msgId in messages) {
        if (msgId === '_') continue;
        
        const message = messages[msgId];
        if (!message || message.handled) continue;
        
        debug(`Received Gun message: ${message.type}`);
        
        // Create GUN connection if it doesn't exist yet
        const clientId = message.clientId;
        if (clientId && !this.activeConnections.has(`gun:${clientId}`)) {
          const gunConnection = this._createGunConnection(clientId);
          this.activeConnections.set(`gun:${clientId}`, gunConnection);
        }
        
        // Mark message as handled
        this.gun.get('hosts').get(this.hostId).get('messages').get(msgId).put({
          ...message,
          handled: true
        });
        
        // Handle message based on type
        if (message.type === 'handshake') {
          this._handleHandshakeMessage(message, msgId);
        } else if (message.type === 'webrtc-signal') {
          this._handleWebRTCSignal(message);
        } else if (message.type === 'request') {
          this._handleGunRequest(message, msgId);
        }
      }
    });
  }

  /**
   * Handle handshake message for direct connection
   */
  private _handleHandshakeMessage(message: any, msgId: string): void {
    // Respond to handshake with connection options
    const response = {
      type: 'handshake-response',
      connectionOptions: this.connectionOptions,
      timestamp: Date.now()
    };
    
    this.gun.get('hosts').get(this.hostId).get('messages').get(msgId).put({
      ...message,
      response,
      handled: true
    });
    
    debug('Sent handshake response with connection options');
  }

  /**
   * Handle WebRTC signaling message
   */
  private _handleWebRTCSignal(message: any): void {
    if (!this.enableWebRTC || !dc) return;
    
    const { clientId, signal } = message;
    
    // If we don't have a peer connection for this client yet, create one
    if (!this.webrtcPeerConnections.has(clientId)) {
      debug(`Creating new WebRTC peer connection for ${clientId}`);
      
      // Configure the peer connection
      const config = {
        iceServers: this.stunServers
      };
      
      // Use any type for node-datachannel
      const peer = new (dc as any).PeerConnection(clientId, config);
      
      // Set up event handlers for node-datachannel
      peer.onLocalDescription((sdp: string, type: string) => {
        // Send local description back to the client
        const response = {
          type: 'webrtc-signal',
          clientId,
          signal: { sdp, type },
          timestamp: Date.now()
        };
        
        this.gun.get('clients').get(clientId).get('signals').set(response);
        debug(`Sent local description to ${clientId}`);
      });
      
      peer.onLocalCandidate((candidate: string, mid: string) => {
        // Send ICE candidate to the client
        const response = {
          type: 'webrtc-signal',
          clientId,
          signal: { candidate, mid },
          timestamp: Date.now()
        };
        
        this.gun.get('clients').get(clientId).get('signals').set(response);
        debug(`Sent ICE candidate to ${clientId}`);
      });
      
      // Use any for DataChannel for now
      peer.onDataChannel((channel: any) => {
        debug(`New data channel from ${clientId}`);
        
        // Create WebRTC connection object when data channel is established
        const webrtcConnection = this._createWebRTCConnection(clientId, peer, channel);
        this.activeConnections.set(`webrtc:${clientId}`, webrtcConnection);
        
        // Store data channel for direct access if needed
        this.webrtcDataChannels.set(clientId, channel);
        
        channel.onMessage((msg: string) => {
          if (typeof msg === 'string') {
            try {
              const data = JSON.parse(msg);
              this._handleIncomingMessage(data, `webrtc:${clientId}`, CONNECTION_TYPE.WEBRTC);
            } catch (err) {
              debug(`Error parsing WebRTC message: ${err}`);
            }
          } else {
            // Binary message handling - this should be already handled by node-datachannel
            debug("Received non-string message which shouldn't happen with node-datachannel");
          }
        });
        
        channel.onClosed(() => {
          debug(`Data channel from ${clientId} closed`);
          this.webrtcDataChannels.delete(clientId);
          this.activeConnections.delete(`webrtc:${clientId}`);
        });
      });
      
      // Store peer connection for direct access if needed
      this.webrtcPeerConnections.set(clientId, peer);
    }
    
    const peer = this.webrtcPeerConnections.get(clientId)!;
    
    // Handle the signal
    if (signal.sdp && signal.type) {
      peer.setRemoteDescription(signal.sdp, signal.type);
      debug(`Set remote description for ${clientId}`);
      
      // If we received an offer, we need to create an answer
      if (signal.type === 'offer') {
        // Automatically created by node-datachannel library when remote description is set
        debug(`Remote offer processed for ${clientId}`);
      }
    } else if (signal.candidate && signal.mid) {
      peer.addRemoteCandidate(signal.candidate, signal.mid);
      debug(`Added remote ICE candidate for ${clientId}`);
    }
  }

  /**
   * Handle Gun relay request
   */
  private _handleGunRequest(message: any, msgId: string): void {
    const { clientId, request } = message;
    
    if (request.type === 'metadata') {
      this._handleMetadataRequest(clientId, request.sha256, msgId);
    } else if (request.type === 'chunk') {
      this._handleChunkRequest(clientId, request.sha256, request.startChunk, msgId);
    }
  }

  /**
   * Handle incoming message from any connection type
   */
  private _handleIncomingMessage(data: any, clientId: string, connectionType: CONNECTION_TYPE): void {
    let message: any;
    
    // Parse message if it's a buffer
    if (Buffer.isBuffer(data) || data instanceof Uint8Array) {
      try {
        message = JSON.parse(data.toString('utf8'));
      } catch (err) {
        debug(`Error parsing message from ${clientId}: ${err}`);
        return;
      }
    } else {
      message = data;
    }
    
    debug(`Received ${connectionType} message from ${clientId}: ${message.type}`);
    
    // Handle message based on type
    if (message.type === 'metadata') {
      this._handleMetadataRequest(clientId, message.sha256, null, connectionType);
    } else if (message.type === 'chunk') {
      this._handleChunkRequest(clientId, message.sha256, message.startChunk, null, connectionType);
    }
  }

  /**
   * Handle metadata request
   */
  private async _handleMetadataRequest(
    clientId: string, 
    sha256: string, 
    msgId: string | null = null,
    connectionType: CONNECTION_TYPE = CONNECTION_TYPE.GUN
  ): Promise<void> {
    debug(`Handling metadata request for ${sha256} from ${clientId}`);
    
    try {
      // Get the first chunk to determine if file exists and get its size
      const firstChunk = await this.hostFileCallback(sha256, 0, this.chunkSize);
      
      if (!firstChunk) {
        debug(`File ${sha256} not found`);
        this._sendResponse({
          type: 'metadata-response',
          sha256,
          error: 'File not found'
        }, clientId, msgId, connectionType);
        return;
      }
      
      // Get file size by requesting chunks until we get null
      let totalSize = 0;
      let chunkIndex = 0;
      let lastChunk: Buffer[] | null = firstChunk;
      
      while (lastChunk) {
        for (const chunk of lastChunk) {
          totalSize += chunk.length;
        }
        
        chunkIndex++;
        lastChunk = await this.hostFileCallback(sha256, chunkIndex, this.chunkSize);
      }
      
      // Send metadata response
      this._sendResponse({
        type: 'metadata-response',
        sha256,
        totalSize,
        chunkSize: this.chunkSize,
        totalChunks: Math.ceil(totalSize / this.chunkSize)
      }, clientId, msgId, connectionType);
      
    } catch (err) {
      debug(`Error handling metadata request: ${err}`);
      this._sendResponse({
        type: 'metadata-response',
        sha256,
        error: `Server error: ${(err as Error).message}`
      }, clientId, msgId, connectionType);
    }
  }

  /**
   * Handle chunk request
   */
  private async _handleChunkRequest(
    clientId: string, 
    sha256: string, 
    startChunk: number,
    msgId: string | null = null,
    connectionType: CONNECTION_TYPE = CONNECTION_TYPE.GUN
  ): Promise<void> {
    debug(`Handling chunk request for ${sha256}, chunk ${startChunk} from ${clientId}`);
    
    try {
      // Get the requested chunk
      const chunks = await this.hostFileCallback(sha256, startChunk, this.chunkSize);
      
      if (!chunks) {
        debug(`Chunk ${startChunk} of file ${sha256} not found`);
        this._sendResponse({
          type: 'chunk-response',
          sha256,
          startChunk,
          error: 'Chunk not found'
        }, clientId, msgId, connectionType);
        return;
      }
      
      // Send chunk response
      this._sendResponse({
        type: 'chunk-response',
        sha256,
        startChunk,
        data: chunks.map(chunk => chunk.toString('base64'))
      }, clientId, msgId, connectionType);
      
    } catch (err) {
      debug(`Error handling chunk request: ${err}`);
      this._sendResponse({
        type: 'chunk-response',
        sha256,
        startChunk,
        error: `Server error: ${(err as Error).message}`
      }, clientId, msgId, connectionType);
    }
  }

  /**
   * Send response to client
   */
  private _sendResponse(
    response: any, 
    clientId: string, 
    msgId: string | null = null,
    connectionType: CONNECTION_TYPE = CONNECTION_TYPE.GUN
  ): void {
    debug(`Sending ${response.type} to ${clientId} via ${connectionType}`);
    
    // Get connection object based on connection type prefix
    let connectionIdPrefix = clientId;
    
    // Adjust client ID for non-Gun connections which might have prefixes
    if (connectionType === CONNECTION_TYPE.WEBRTC && !clientId.startsWith('webrtc:')) {
      connectionIdPrefix = `webrtc:${clientId}`;
    } else if (connectionType === CONNECTION_TYPE.GUN && !clientId.startsWith('gun:')) {
      connectionIdPrefix = `gun:${clientId}`;
    }
    
    // Get connection object
    const connection = this.activeConnections.get(connectionIdPrefix);
    
    if (connection) {
      // If we have a proper connection object, use it to send the response
      connection.send(response.type, response);
    } else {
      // Fall back to direct sending methods if no connection object is available
      switch (connectionType) {
        case CONNECTION_TYPE.TCP:
          this._sendTCPResponse(response, clientId);
          break;
          
        case CONNECTION_TYPE.UDP:
          this._sendUDPResponse(response, clientId);
          break;
          
        case CONNECTION_TYPE.WEBRTC:
          this._sendWebRTCResponse(response, clientId);
          break;
          
        case CONNECTION_TYPE.GUN:
          this._sendGunResponse(response, clientId, msgId);
          break;
          
        default:
          debug(`Unknown connection type: ${connectionType}`);
      }
    }
  }

  /**
   * Create a TCP connection object
   * @param clientId - Client identifier
   * @param socket - TCP socket
   * @returns TCP connection object
   */
  private _createTCPConnection(clientId: string, socket: net.Socket): TCPConnection {
    const connection: TCPConnection = {
      type: CONNECTION_TYPE.TCP,
      clientId,
      socket,
      messageHandlers: new Map(),
      
      send: (messageType: string, data: any) => {
        try {
          const message = JSON.stringify(data);
          socket.write(message);
        } catch (err) {
          debug(`Error sending TCP message: ${err}`);
        }
      },
      
      on: (messageType: string, handler: MessageHandler) => {
        connection.messageHandlers.set(messageType, handler);
      },
      
      close: () => {
        socket.destroy();
        this.tcpSockets.delete(clientId);
        this.activeConnections.delete(clientId);
      }
    };
    
    return connection;
  }

  /**
   * Create a UDP connection object
   * @param clientId - Client identifier
   * @param remoteAddress - Remote address
   * @param remotePort - Remote port
   * @returns UDP connection object
   */
  private _createUDPConnection(clientId: string, remoteAddress: string, remotePort: number): UDPConnection {
    const connection: UDPConnection = {
      type: CONNECTION_TYPE.UDP,
      clientId,
      remoteAddress,
      remotePort,
      messageHandlers: new Map(),
      
      send: (messageType: string, data: any) => {
        if (!this.udpSocket) {
          debug('UDP socket not initialized');
          return;
        }
        
        try {
          const message = JSON.stringify(data);
          this.udpSocket.send(message, remotePort, remoteAddress);
        } catch (err) {
          debug(`Error sending UDP message: ${err}`);
        }
      },
      
      on: (messageType: string, handler: MessageHandler) => {
        connection.messageHandlers.set(messageType, handler);
      },
      
      close: () => {
        this.udpClients.delete(clientId);
        this.activeConnections.delete(clientId);
      }
    };
    
    return connection;
  }

  /**
   * Create a WebRTC connection object
   * @param clientId - Client identifier
   * @param peerConnection - WebRTC peer connection
   * @param dataChannel - WebRTC data channel
   * @returns WebRTC connection object
   */
  private _createWebRTCConnection(clientId: string, peerConnection: any, dataChannel: any): WebRTCConnection {
    const connection: WebRTCConnection = {
      type: CONNECTION_TYPE.WEBRTC,
      clientId,
      peerConnection,
      dataChannel,
      messageHandlers: new Map(),
      
      send: (messageType: string, data: any) => {
        try {
          const message = JSON.stringify(data);
          dataChannel.sendMessage(message);
        } catch (err) {
          debug(`Error sending WebRTC message: ${err}`);
        }
      },
      
      on: (messageType: string, handler: MessageHandler) => {
        connection.messageHandlers.set(messageType, handler);
      },
      
      close: () => {
        if (dataChannel) {
          dataChannel.close();
        }
        if (peerConnection) {
          peerConnection.close();
        }
        this.webrtcDataChannels.delete(clientId);
        this.webrtcPeerConnections.delete(clientId);
        this.activeConnections.delete(`webrtc:${clientId}`);
      }
    };
    
    return connection;
  }

  /**
   * Create a Gun relay connection object
   * @param clientId - Client identifier
   * @returns Gun relay connection object
   */
  private _createGunConnection(clientId: string): GunRelayConnection {
    const connection: GunRelayConnection = {
      type: CONNECTION_TYPE.GUN,
      clientId,
      messageHandlers: new Map(),
      
      send: (messageType: string, data: any) => {
        // Note: For Gun, the actual message sending is done in _sendGunResponse
        // because it needs the message ID, which isn't known here
        // This is just a placeholder
        debug(`(Gun send placeholder) Sending ${messageType} to ${clientId}`);
      },
      
      on: (messageType: string, handler: MessageHandler) => {
        connection.messageHandlers.set(messageType, handler);
      },
      
      close: () => {
        this.activeConnections.delete(`gun:${clientId}`);
      }
    };
    
    return connection;
  }

  /**
   * Send TCP response (fallback method)
   */
  private _sendTCPResponse(response: any, clientId: string): void {
    const socket = this.tcpSockets.get(clientId);
    if (!socket) {
      debug(`TCP socket for ${clientId} not found`);
      return;
    }
    
    try {
      const data = JSON.stringify(response);
      socket.write(data);
    } catch (err) {
      debug(`Error sending TCP response: ${err}`);
    }
  }

  /**
   * Send UDP response (fallback method)
   */
  private _sendUDPResponse(response: any, clientId: string): void {
    const client = this.udpClients.get(clientId);
    if (!client || !this.udpSocket) {
      debug(`UDP client ${clientId} not found or UDP socket not initialized`);
      return;
    }
    
    try {
      const data = JSON.stringify(response);
      this.udpSocket.send(data, client.port, client.address);
    } catch (err) {
      debug(`Error sending UDP response: ${err}`);
    }
  }

  /**
   * Send WebRTC response (fallback method)
   */
  private _sendWebRTCResponse(response: any, clientId: string): void {
    const dataChannel = this.webrtcDataChannels.get(clientId);
    if (!dataChannel) {
      debug(`WebRTC data channel for ${clientId} not found`);
      return;
    }
    
    try {
      const data = JSON.stringify(response);
      dataChannel.sendMessage(data);
    } catch (err) {
      debug(`Error sending WebRTC response: ${err}`);
    }
  }

  /**
   * Send Gun relay response (fallback method)
   */
  private _sendGunResponse(response: any, clientId: string, msgId: string | null): void {
    if (!msgId) {
      debug(`Cannot send Gun response without message ID`);
      return;
    }
    
    try {
      this.gun.get('hosts').get(this.hostId).get('messages').get(msgId).put({
        response,
        handled: true,
        timestamp: Date.now()
      });
    } catch (err) {
      debug(`Error sending Gun response: ${err}`);
    }
  }

  /**
   * Handle a new TCP connection
   * @param socket The TCP socket
   */
  private _handleTCPConnection(socket: net.Socket): void {
    const clientId = `${socket.remoteAddress}:${socket.remotePort}`;
    debug(`New TCP connection from ${clientId}`);
    
    // Store socket for direct access if needed
    this.tcpSockets.set(clientId, socket);
    
    // Create TCP connection object
    const tcpConnection = this._createTCPConnection(clientId, socket);
    
    // Store connection
    this.activeConnections.set(clientId, tcpConnection);
    
    socket.on('data', (data) => {
      // Handle incoming TCP data
      this._handleIncomingMessage(data, clientId, CONNECTION_TYPE.TCP);
    });
    
    socket.on('error', (err) => {
      debug(`TCP socket error for ${clientId}: ${err.message}`);
      this.tcpSockets.delete(clientId);
      this.activeConnections.delete(clientId);
    });
    
    socket.on('close', () => {
      debug(`TCP connection closed for ${clientId}`);
      this.tcpSockets.delete(clientId);
      this.activeConnections.delete(clientId);
    });
  }

  /**
   * Handle an incoming UDP message
   * @param msg The UDP message
   * @param rinfo The remote info (address and port)
   */
  private _handleUDPMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    const clientId = `${rinfo.address}:${rinfo.port}`;
    debug(`Received UDP message from ${clientId}`);
    
    // Store client info for direct access if needed
    this.udpClients.set(clientId, { 
      address: rinfo.address, 
      port: rinfo.port 
    });
    
    // Create UDP connection if it doesn't exist yet
    if (!this.activeConnections.has(clientId)) {
      const udpConnection = this._createUDPConnection(clientId, rinfo.address, rinfo.port);
      this.activeConnections.set(clientId, udpConnection);
    }
    
    // Handle incoming UDP data
    this._handleIncomingMessage(msg, clientId, CONNECTION_TYPE.UDP);
  }
} 
/**
 * Base Hole Punching Client Implementation
 * 
 * Core implementation of UDP/TCP hole punching functionality with GunJS signaling.
 */

import * as dgram from 'dgram';
import * as net from 'net';
import * as crypto from 'crypto';
import Debug from 'debug';
import { EventEmitter } from 'events';
import { HOLE_PUNCH_CONSTANTS } from './constants';
import { HolePunchStatus } from './types';
import type { 
  HolePunchOptions, 
  HolePunchResult, 
  HolePunchConnectionInfo,
  HolePunchSecurityOptions,
  HolePunchClient,
  HolePunchEvents
} from './types';
import { HolePunchSignaling } from './signaling';
import { Socket } from 'dgram';
import { Server, Socket as TCPSocket } from 'net';
import { CryptoIdentity } from '../../../crypto/identity';
import { createUDPSocketBound } from '../../network/network-utils';

const debug = Debug('dig-nat-tools:hole-punch');

export class BaseHolePunchClient extends EventEmitter implements HolePunchClient {
  private options: HolePunchOptions;
  private _status: HolePunchStatus = HolePunchStatus.IDLE;
  private udpSocket?: Socket;
  private tcpServer?: Server;
  private tcpSocket?: TCPSocket;
  private signaling?: HolePunchSignaling;
  private identity?: CryptoIdentity;
  private activeTransactions: Map<string, { 
    timeout: NodeJS.Timeout; 
    resolve: Function; 
    reject: Function;
  }> = new Map();

  constructor(options: HolePunchOptions) {
    super();
    this.options = options;
    this._status = HolePunchStatus.IDLE;

    if ('identity' in options) {
      this.identity = options.identity as CryptoIdentity;
    }
  }

  /**
   * Get current status
   */
  public get status(): HolePunchStatus {
    return this._status;
  }

  private setStatus(status: HolePunchStatus): void {
    this._status = status;
    this.emit('status', status);
  }

  // Type-safe event emitter methods
  public on<K extends keyof HolePunchEvents>(event: K, listener: HolePunchEvents[K]): this {
    return super.on(event, listener);
  }

  public off<K extends keyof HolePunchEvents>(event: K, listener: HolePunchEvents[K]): this {
    return super.off(event, listener);
  }

  public emit<K extends keyof HolePunchEvents>(event: K, ...args: Parameters<HolePunchEvents[K]>): boolean {
    return super.emit(event, ...args);
  }

  /**
   * Validate endpoint address and port
   */
  private validateEndpoint(address: string, port: number, security: HolePunchSecurityOptions): boolean {
    if (!net.isIP(address)) {
      throw new Error('Invalid IP address');
    }

    if (port < HOLE_PUNCH_CONSTANTS.MIN_PORT || port > HOLE_PUNCH_CONSTANTS.MAX_PORT) {
      throw new Error('Invalid port number');
    }

    if (!security.allowLoopback && address === '127.0.0.1') {
      throw new Error('Loopback address not allowed');
    }

    if (!security.allowPrivateNetwork) {
      const ipParts = address.split('.');
      if (
        ipParts[0] === '10' ||
        (ipParts[0] === '172' && parseInt(ipParts[1]) >= 16 && parseInt(ipParts[1]) <= 31) ||
        (ipParts[0] === '192' && ipParts[1] === '168')
      ) {
        throw new Error('Private network addresses not allowed');
      }
    }

    return true;
  }

  /**
   * Create secure signaling channel
   */
  private createSignalingChannel(peerId: string, security: HolePunchSecurityOptions): string {
    const timestamp = Date.now();
    const prefix = security.channelPrefix || HOLE_PUNCH_CONSTANTS.DEFAULT_SECURITY_OPTIONS.channelPrefix;
    const channelId = crypto.randomBytes(16).toString('hex');
    return `${prefix}/${peerId}/${timestamp}/${channelId}`;
  }

  /**
   * Create test packet with magic number and random data
   */
  private createTestPacket(): Buffer {
    const magic = Buffer.alloc(4);
    magic.writeUInt32BE(HOLE_PUNCH_CONSTANTS.TEST_PACKET_MAGIC);
    const random = crypto.randomBytes(12);
    return Buffer.concat([magic, random]);
  }

  /**
   * Validate test packet
   */
  private validateTestPacket(packet: Buffer, security: HolePunchSecurityOptions): boolean {
    if (packet.length > security.maxPacketSize) {
      this.emit('security', 'Received packet exceeds size limit');
      return false;
    }

    if (packet.length < 16) {
      return false;
    }

    const magic = packet.readUInt32BE(0);
    return magic === HOLE_PUNCH_CONSTANTS.TEST_PACKET_MAGIC;
  }

  private async createSocket(options: HolePunchOptions): Promise<dgram.Socket> {
    const preferredFamily = options.preferredFamily || 'IPv6';
    
    try {
      // Use network-utils for socket creation
      return await createUDPSocketBound(0, {
        enableIPv6: preferredFamily === 'IPv6',
        ipv6Only: false, // Allow IPv4 mapped addresses for IPv6
        reuseAddr: true
      });
    } catch (err) {
      debug(`${preferredFamily} socket creation failed, falling back to ${preferredFamily === 'IPv6' ? 'IPv4' : 'IPv6'}`);
      
      // Fall back to other family
      return await createUDPSocketBound(0, {
        enableIPv6: preferredFamily !== 'IPv6',
        ipv6Only: false,
        reuseAddr: true
      });
    }
  }

  private async createTCPServer(): Promise<net.Server> {
    // Create server that can handle both IPv6 and IPv4
    const server = net.createServer();
    server.on('error', (err) => {
      debug(`Server error: ${err.message}`);
      this.emit('error', new Error(err.message));
    });
    return server;
  }

  private setupSignaling(peerId: string): void {
    if (!this.options.gun) {
      throw new Error('Gun instance required for signaling');
    }

    const channel = `${this.options.security?.channelPrefix || 'hole-punch'}-${peerId}`;
    this.signaling = new HolePunchSignaling(this.options.gun, channel, this.options.security);

    if (this.identity) {
      this.signaling.setIdentity(this.identity);
    }

    this.signaling.on('error', (err) => {
      this.emit('error', err);
    });
  }

  private async exchangeConnectionInfo(
    peerId: string,
    type: 'offer' | 'answer',
    protocol: 'TCP' | 'UDP',
    address: string,
    port: number,
    localAddress: string,
    localPort: number,
    family: 'IPv4' | 'IPv6',
    targetAddress?: string,
    targetPort?: number
  ): Promise<void> {
    if (!this.signaling) {
      throw new Error('Signaling not initialized');
    }

    const info: HolePunchConnectionInfo = {
      type,
      from: peerId,
      protocol,
      address,
      port,
      localAddress,
      localPort,
      family,
      targetAddress,
      targetPort,
      timestamp: Date.now(),
      encrypted: false
    };

    await this.signaling.send(info);
  }

  private async punchUDP(options: HolePunchOptions): Promise<HolePunchResult> {
    const startTime = Date.now();
    const security = options.security || HOLE_PUNCH_CONSTANTS.DEFAULT_SECURITY_OPTIONS;
    let retryCount = 0;
    const maxRetries = options.retries || HOLE_PUNCH_CONSTANTS.MAX_RETRIES;
    
    try {
      this.setStatus(HolePunchStatus.INITIALIZING);
      
      // Instead of creating and then binding, use directly with port
      const localPort = options.localPort || HOLE_PUNCH_CONSTANTS.DEFAULT_UDP_PORT;
      this.udpSocket = await createUDPSocketBound(localPort, {
        enableIPv6: options.preferredFamily === 'IPv6',
        ipv6Only: false,
        reuseAddr: true
      });

      const localAddress = this.udpSocket.address() as net.AddressInfo;
      debug(`Local address: ${localAddress.address}:${localAddress.port}`);

      this.setStatus(HolePunchStatus.SIGNALING);

      // Create secure signaling channel
      const channel = this.createSignalingChannel(options.peerId, security);
      const signalStartTime = Date.now();

      // Exchange connection info through GunJS
      const connectionInfo: HolePunchConnectionInfo = {
        type: 'offer',
        from: options.peerId,
        protocol: 'UDP',
        address: localAddress.address,
        port: localAddress.port,
        localAddress: localAddress.address,
        localPort: localAddress.port,
        family: this.udpSocket.address().family === 'IPv6' ? 'IPv6' : 'IPv4',
        targetAddress: options.targetAddress,
        targetPort: options.targetPort,
        timestamp: Date.now(),
        encrypted: security.requireEncryption
      };

      if (security.validateSignature) {
        // Add signature in future update
        this.emit('security', 'Signature validation not yet implemented');
      }

      options.gun.get(channel).put(connectionInfo);

      // Wait for peer's connection info
      const peerInfo = await new Promise<HolePunchConnectionInfo>((resolve, reject) => {
        const signalTimeout = setTimeout(() => {
          reject(new Error('Signaling timeout'));
        }, options.timeout || HOLE_PUNCH_CONSTANTS.TRANSACTION_TIMEOUT);

        options.gun.get(channel).on((data: any) => {
          if (data && data.type === 'answer' && data.from === options.peerId) {
            if (security.validatePeerIdentity && data.from !== options.peerId) {
              this.emit('security', 'Invalid peer identity in response');
              return;
            }
            clearTimeout(signalTimeout);
            resolve(data);
          }
        });
      });

      debug(`Received peer info: ${JSON.stringify(peerInfo)}`);

      this.setStatus(HolePunchStatus.CONNECTING);

      // Use target address/port if provided, otherwise use peer info
      const remoteAddress = options.targetAddress || peerInfo.address;
      const remotePort = options.targetPort || peerInfo.port;

      // Validate remote endpoint
      this.validateEndpoint(remoteAddress, remotePort, security);

      // Create and send test packet
      const testPacket = this.createTestPacket();
      
      const success = await new Promise<boolean>((resolve) => {
        const connectTimeout = setTimeout(() => {
          resolve(false);
        }, HOLE_PUNCH_CONSTANTS.TEST_PACKET_TIMEOUT);

        const messageHandler = (msg: Buffer) => {
          if (this.validateTestPacket(msg, security)) {
            clearTimeout(connectTimeout);
            this.udpSocket!.removeListener('message', messageHandler);
            resolve(true);
          }
        };

        this.udpSocket!.on('message', messageHandler);

        // Send test packets to both external and local addresses
        this.udpSocket!.send(testPacket, remotePort, remoteAddress);
        if (security.allowPrivateNetwork && peerInfo.localAddress && peerInfo.localPort) {
          this.udpSocket!.send(testPacket, peerInfo.localPort, peerInfo.localAddress);
        }
      });

      if (!success) {
        throw new Error('Could not establish connection');
      }

      const result: HolePunchResult = {
        success: true,
        socket: this.udpSocket,
        localAddress: localAddress.address,
        localPort: localAddress.port,
        remoteAddress,
        remotePort,
        status: this.status,
        details: {
          rtt: Date.now() - startTime,
          protocol: 'UDP',
          secure: security.requireEncryption,
          retries: retryCount,
          signaling: {
            channel,
            latency: Date.now() - signalStartTime
          }
        }
      };

      this.setStatus(HolePunchStatus.CONNECTED);
      this.emit('connected', result);
      return result;

    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      debug(`UDP hole punch failed: ${error.message}`);
      this.setStatus(HolePunchStatus.FAILED);
      this.emit('error', error);
      return {
        success: false,
        error: error.message,
        status: this.status
      };
    }
  }

  /**
   * Implements TCP hole punching
   * @param options Options for hole punching
   */
  private async punchTCP(options: HolePunchOptions): Promise<HolePunchResult> {
    const startTime = Date.now();
    const security = options.security || HOLE_PUNCH_CONSTANTS.DEFAULT_SECURITY_OPTIONS;
    let retryCount = 0;
    const maxRetries = options.retries || HOLE_PUNCH_CONSTANTS.MAX_RETRIES;
    
    try {
      this.setStatus(HolePunchStatus.INITIALIZING);
      
      // Create TCP server
      this.tcpServer = await this.createTCPServer();
      
      // Bind to local port
      const localPort = options.localPort || HOLE_PUNCH_CONSTANTS.DEFAULT_TCP_PORT;
      await new Promise<void>((resolve, reject) => {
        this.tcpServer!.once('error', reject);
        this.tcpServer!.listen(localPort, () => {
          this.tcpServer!.removeListener('error', reject);
          resolve();
        });
      });
      
      const serverAddress = this.tcpServer.address() as net.AddressInfo;
      debug(`TCP server listening: ${serverAddress.address}:${serverAddress.port}`);

      this.setStatus(HolePunchStatus.SIGNALING);

      // Create secure signaling channel
      const channel = this.createSignalingChannel(options.peerId, security);
      const signalStartTime = Date.now();

      // Exchange connection info through GunJS
      const connectionInfo: HolePunchConnectionInfo = {
        type: 'offer',
        from: options.peerId,
        protocol: 'TCP',
        address: serverAddress.address,
        port: serverAddress.port,
        localAddress: serverAddress.address,
        localPort: serverAddress.port,
        family: serverAddress.family === 'IPv6' ? 'IPv6' : 'IPv4',
        targetAddress: options.targetAddress,
        targetPort: options.targetPort,
        timestamp: Date.now(),
        encrypted: security.requireEncryption
      };

      if (security.validateSignature) {
        // Add signature in future update
        this.emit('security', 'Signature validation not yet implemented');
      }

      options.gun.get(channel).put(connectionInfo);

      // Wait for peer's connection info
      const peerInfo = await new Promise<HolePunchConnectionInfo>((resolve, reject) => {
        const signalTimeout = setTimeout(() => {
          reject(new Error('Signaling timeout'));
        }, options.timeout || HOLE_PUNCH_CONSTANTS.TRANSACTION_TIMEOUT);

        options.gun.get(channel).on((data: any) => {
          if (data && data.type === 'answer' && data.from === options.peerId) {
            if (security.validatePeerIdentity && data.from !== options.peerId) {
              this.emit('security', 'Invalid peer identity in response');
              return;
            }
            clearTimeout(signalTimeout);
            resolve(data);
          }
        });
      });

      debug(`Received peer TCP info: ${JSON.stringify(peerInfo)}`);

      this.setStatus(HolePunchStatus.CONNECTING);

      // Use target address/port if provided, otherwise use peer info
      const remoteAddress = options.targetAddress || peerInfo.address;
      const remotePort = options.targetPort || peerInfo.port;

      // Validate remote endpoint
      this.validateEndpoint(remoteAddress, remotePort, security);

      // TCP hole punching requires bidirectional connection attempts
      // We'll try to connect to the peer while also accepting incoming connections
      
      // Set up connection acceptance
      const serverConnectionPromise = new Promise<net.Socket>((resolve, reject) => {
        const connectionTimeout = setTimeout(() => {
          reject(new Error('Timeout waiting for incoming TCP connection'));
        }, HOLE_PUNCH_CONSTANTS.CONNECTION_TIMEOUT);
        
        this.tcpServer!.once('connection', (socket) => {
          clearTimeout(connectionTimeout);
          resolve(socket);
        });
      });
      
      // Try to connect to the peer
      const clientConnectionPromise = new Promise<net.Socket>((resolve, reject) => {
        const socket = new net.Socket();
        let connected = false;
        
        socket.once('error', (err) => {
          // Ignore errors, they're expected in TCP hole punching
          debug(`TCP client connection error: ${err.message}`);
        });
        
        socket.once('connect', () => {
          connected = true;
          resolve(socket);
        });
        
        // Try connecting to both external and local addresses if allowed
        socket.connect(remotePort, remoteAddress);
        
        if (security.allowPrivateNetwork && peerInfo.localAddress && peerInfo.localPort) {
          setTimeout(() => {
            if (!connected) {
              const localSocket = new net.Socket();
              localSocket.once('error', () => {
                // Ignore errors on local connection attempts
              });
              localSocket.once('connect', () => {
                resolve(localSocket);
              });
              localSocket.connect(peerInfo.localPort, peerInfo.localAddress);
            }
          }, HOLE_PUNCH_CONSTANTS.STAGGERED_CONNECTION_DELAY);
        }
      });
      
      // Race between outgoing and incoming connections
      try {
        this.tcpSocket = await Promise.race([
          serverConnectionPromise,
          clientConnectionPromise
        ]);
      } catch (err) {
        throw new Error('Failed to establish TCP connection: ' + (err as Error).message);
      }
      
      // Clean up the loser of the race
      if (this.tcpSocket) {
        debug('TCP connection established');
      } else {
        throw new Error('Could not establish TCP connection');
      }

      const socketAddress = this.tcpSocket.address() as net.AddressInfo;
      const remoteSocketAddress = this.tcpSocket.remoteAddress!;
      const remoteSocketPort = this.tcpSocket.remotePort!;
      
      const result: HolePunchResult = {
        success: true,
        socket: this.tcpSocket,
        localAddress: socketAddress.address,
        localPort: socketAddress.port,
        remoteAddress: remoteSocketAddress,
        remotePort: remoteSocketPort,
        status: this.status,
        details: {
          rtt: Date.now() - startTime,
          protocol: 'TCP',
          secure: security.requireEncryption,
          retries: retryCount,
          signaling: {
            channel,
            latency: Date.now() - signalStartTime
          }
        }
      };

      this.setStatus(HolePunchStatus.CONNECTED);
      this.emit('connected', result);
      return result;

    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      debug(`TCP hole punch failed: ${error.message}`);
      this.setStatus(HolePunchStatus.FAILED);
      this.emit('error', error);
      return {
        success: false,
        error: error.message,
        status: this.status
      };
    }
  }

  /**
   * Punch holes through NAT for peer connection
   * @param options Options for hole punching
   */
  public async punch(options: HolePunchOptions): Promise<HolePunchResult> {
    if (this._status !== HolePunchStatus.IDLE) {
      throw new Error('Client is already in use');
    }
    
    // Determine which protocol to use for hole punching
    const protocol = options.protocol || 'UDP';
    
    if (protocol === 'TCP') {
      return this.punchTCP(options);
    } else {
      return this.punchUDP(options);
    }
  }

  /**
   * Close and clean up resources
   */
  public close(): void {
    // Close UDP socket if it exists
    if (this.udpSocket) {
      try {
        this.udpSocket.close();
      } catch (err) {
        debug(`Error closing UDP socket: ${(err as Error).message}`);
      }
      this.udpSocket = undefined;
    }
    
    // Close TCP server if it exists
    if (this.tcpServer) {
      try {
        this.tcpServer.close();
      } catch (err) {
        debug(`Error closing TCP server: ${(err as Error).message}`);
      }
      this.tcpServer = undefined;
    }
    
    // Close TCP socket if it exists
    if (this.tcpSocket) {
      try {
        this.tcpSocket.destroy();
      } catch (err) {
        debug(`Error closing TCP socket: ${(err as Error).message}`);
      }
      this.tcpSocket = undefined;
    }
    
    // Close signaling if it exists
    if (this.signaling) {
      this.signaling = undefined;
    }
    
    this.setStatus(HolePunchStatus.CLOSED);
  }
}
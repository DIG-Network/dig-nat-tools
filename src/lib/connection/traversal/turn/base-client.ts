/**
 * Base TURN Client Implementation
 * 
 * Core implementation of TURN functionality with security and signaling support.
 */

import { createSocket, Socket } from 'dgram';
import { connect as tcpConnect, Socket as TCPSocket } from 'net';
import { TLSSocket, connect as tlsConnect } from 'tls';
import { EventEmitter } from 'events';
import Debug from 'debug';
import type { 
  TURNClient, 
  TURNOptions, 
  TURNResult,
  TURNAllocation,
  TURNPermission,
  TURNSecurityOptions,
  TURNSignalingOptions,
  TURNEvents
} from './types';
import { TURNConnectionState } from './types';
import { TURN_CONSTANTS } from './constants';
import { TURNSignaling } from './signaling';
import { createStunMessage, parseStunMessage } from './stun';
import { createUDPSocketBound } from '../../network/network-utils';

const debug = Debug('dig-nat-tools:turn:base-client');

export class BaseTURNClient extends EventEmitter implements TURNClient {
  private socket?: Socket | TCPSocket | TLSSocket;
  private options?: TURNOptions;
  private allocation?: TURNAllocation;
  private permissions: Map<string, TURNPermission> = new Map();
  private state: TURNConnectionState = TURNConnectionState.NEW;
  private security: TURNSecurityOptions;
  private signaling?: TURNSignaling;
  private refreshTimer?: NodeJS.Timeout;
  private retryCount = 0;
  private channelBindings: Map<number, string> = new Map();
  private nextChannelNumber = TURN_CONSTANTS.MIN_CHANNEL_NUMBER;
  private permissionTimer?: NodeJS.Timeout;

  constructor(options?: {
    security?: TURNSecurityOptions;
    signaling?: TURNSignalingOptions;
  }) {
    super();
    this.security = {
      ...TURN_CONSTANTS.DEFAULT_SECURITY_OPTIONS,
      ...options?.security
    };

    if (options?.signaling) {
      this.setupSignaling(options.signaling);
    }

    // Start permission cleanup timer
    this.startPermissionTimer();
  }

  private startPermissionTimer(): void {
    if (this.permissionTimer) {
      clearInterval(this.permissionTimer);
    }

    // Check permissions every minute
    this.permissionTimer = setInterval(() => {
      const now = Date.now();
      for (const [peerAddress, permission] of this.permissions) {
        // Remove expired permissions
        if (now - permission.lastVerified > permission.lifetime * 1000) {
          this.permissions.delete(peerAddress);
          this.emit('permissionExpired', permission);
        }
      }
    }, 60000);
  }

  private setupSignaling(options: TURNSignalingOptions): void {
    this.signaling = new TURNSignaling(
      options.gun,
      options.peerId,
      options.room || 'turn',
      this.security
    );

    this.signaling.on('allocation-request', async ({ peerId, allocation }) => {
      try {
        const result = await this.connect({
          ...this.options!,
          server: {
            ...this.options!.server,
            host: allocation.relayAddress,
            port: allocation.relayPort
          }
        });
        await this.signaling!.respondToAllocation(peerId, allocation, result);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        debug('Error handling allocation request:', errorMessage);
      }
    });

    this.signaling.on('permission-request', async ({ peerId, permission }) => {
      try {
        await this.createPermission(permission.peerAddress);
        await this.signaling!.respondToPermission(peerId, permission, {
          success: true,
          details: {
            secure: true,
            verification: {
              lastChecked: Date.now(),
              method: 'direct'
            }
          }
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        debug('Error handling permission request:', errorMessage);
        await this.signaling!.respondToPermission(peerId, permission, {
          success: false,
          error: errorMessage
        });
      }
    });

    this.signaling.startVerification();
  }

  private setState(state: TURNConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.emit('connectionStateChange', state);
  }

  private validateOptions(options: TURNOptions): boolean {
    if (!options.server.host || !options.server.port) {
      return false;
    }

    if (options.protocol && !this.security.allowedProtocols?.includes(options.protocol)) {
      return false;
    }

    const { min, max } = this.security.allowedPorts || {
      min: TURN_CONSTANTS.MIN_PORT,
      max: TURN_CONSTANTS.MAX_PORT
    };

    if (options.localPort && (options.localPort < min || options.localPort > max)) {
      return false;
    }

    return true;
  }

  private async createSocket(options: TURNOptions): Promise<Socket | TCPSocket | TLSSocket> {
    return new Promise((resolve, reject) => {
      const protocol = options.protocol || TURN_CONSTANTS.DEFAULT_PROTOCOL;
      const secure = options.server.secure || false;

      if (protocol === 'UDP') {
        // Use network-utils instead of direct socket creation
        createUDPSocketBound(options.localPort || 0, {
          enableIPv6: false, // TURN typically uses IPv4
          reuseAddr: true
        }).then(socket => {
          socket.on('error', (error) => this.emit('error', error));
          socket.on('message', (msg, rinfo) => this.handleMessage(msg, rinfo));
          resolve(socket);
        }).catch(reject);
      } else {
        const connectOptions = {
          host: options.server.host,
          port: options.server.port,
          rejectUnauthorized: this.security.validateFingerprint,
          timeout: options.timeout || TURN_CONSTANTS.CONNECTION_TIMEOUT
        };

        const socket = secure ? tlsConnect(connectOptions) : tcpConnect(connectOptions);
        socket.on('error', (error) => this.emit('error', error));
        socket.on('data', (data) => this.handleMessage(data));
        socket.once('connect', () => resolve(socket));
        socket.once('timeout', () => reject(new Error('Connection timeout')));
      }
    });
  }

  private async handleMessage(data: Buffer, rinfo?: any): Promise<void> {
    if (this.state === TURNConnectionState.CLOSED) {
      debug('Ignoring message - connection closed');
      return;
    }

    try {
      // Check if it's channel data
      if (data.length >= TURN_CONSTANTS.CHANNEL_DATA_HEADER_SIZE) {
        const channelNumber = data.readUInt16BE(0);
        if (channelNumber >= TURN_CONSTANTS.MIN_CHANNEL_NUMBER && 
            channelNumber <= TURN_CONSTANTS.MAX_CHANNEL_NUMBER) {
          const peerAddress = this.channelBindings.get(channelNumber);
          if (peerAddress) {
            const messageLength = data.readUInt16BE(2);
            const messageData = data.slice(TURN_CONSTANTS.CHANNEL_DATA_HEADER_SIZE, 
              TURN_CONSTANTS.CHANNEL_DATA_HEADER_SIZE + messageLength);
            this.emit('data', messageData, peerAddress, rinfo?.port);
            return;
          }
        }
      }

      // Parse STUN message
      const message = parseStunMessage(data);
      if (!message) return;

      switch (message.type) {
        case TURN_CONSTANTS.STUN_MESSAGE_TYPES.ALLOCATE_RESPONSE:
          await this.handleAllocationResponse(message);
          break;
        case TURN_CONSTANTS.STUN_MESSAGE_TYPES.REFRESH_RESPONSE:
          await this.handleRefreshResponse(message);
          break;
        case TURN_CONSTANTS.STUN_MESSAGE_TYPES.PERMISSION_RESPONSE:
          await this.handlePermissionResponse(message);
          break;
        case TURN_CONSTANTS.STUN_MESSAGE_TYPES.CHANNEL_BIND_RESPONSE:
          await this.handleChannelBindResponse(message);
          break;
        case TURN_CONSTANTS.STUN_MESSAGE_TYPES.DATA_INDICATION:
          await this.handleDataIndication(message);
          break;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debug('Error handling message:', errorMessage);
      
      if (++this.retryCount > TURN_CONSTANTS.MAX_RETRIES) {
        this.setState(TURNConnectionState.FAILED);
        this.emit('error', new Error('Max retries exceeded'));
        return;
      }
    }
  }

  private async handleAllocationResponse(message: any): Promise<void> {
    if (message.attributes.errorCode) {
      this.setState(TURNConnectionState.FAILED);
      this.emit('error', new Error(`Allocation failed: ${message.attributes.errorReason}`));
      return;
    }

    const allocation: TURNAllocation = {
      relayAddress: message.attributes.xorRelayedAddress.address,
      relayPort: message.attributes.xorRelayedAddress.port,
      serverAddress: message.attributes.xorMappedAddress.address,
      serverPort: message.attributes.xorMappedAddress.port,
      lifetime: message.attributes.lifetime || TURN_CONSTANTS.DEFAULT_ALLOCATION_LIFETIME,
      protocol: this.options?.protocol || TURN_CONSTANTS.DEFAULT_PROTOCOL,
      secure: true,
      lastVerified: Date.now()
    };

    this.allocation = allocation;
    this.emit('allocation', allocation);
  }

  private async handleRefreshResponse(message: any): Promise<void> {
    if (message.attributes.errorCode) {
      debug('Refresh failed:', message.attributes.errorReason);
      if (message.attributes.errorCode === 438) { // Stale Nonce
        // Retry with new nonce
        await this.refreshAllocation(this.allocation?.lifetime);
        return;
      }
      this.emit('error', new Error(`Refresh failed: ${message.attributes.errorReason}`));
      return;
    }

    if (this.allocation) {
      this.allocation.lifetime = message.attributes.lifetime || TURN_CONSTANTS.DEFAULT_ALLOCATION_LIFETIME;
      this.allocation.lastVerified = Date.now();
      this.emit('allocation', this.allocation);
    }
  }

  private async handlePermissionResponse(message: any): Promise<void> {
    if (message.attributes.errorCode) {
      debug('Permission failed:', message.attributes.errorReason);
      if (message.attributes.errorCode === 438) { // Stale Nonce
        // Retry with new nonce
        const peerAddress = message.attributes.xorPeerAddress?.address;
        if (peerAddress) {
          await this.createPermission(peerAddress);
        }
        return;
      }
      this.emit('error', new Error(`Permission failed: ${message.attributes.errorReason}`));
      return;
    }

    const peerAddress = message.attributes.xorPeerAddress?.address;
    if (peerAddress) {
      // Check if we already have a pending permission
      const existingPermission = this.permissions.get(peerAddress);
      if (existingPermission) {
        existingPermission.lastVerified = Date.now();
        this.emit('permission', existingPermission);
      } else {
        const permission: TURNPermission = {
          peerAddress,
          lifetime: message.attributes.lifetime || TURN_CONSTANTS.DEFAULT_PERMISSION_LIFETIME,
          secure: true,
          lastVerified: Date.now()
        };
        this.permissions.set(peerAddress, permission);
        this.emit('permission', permission);
      }
    }
  }

  private async handleChannelBindResponse(message: any): Promise<void> {
    if (message.attributes.errorCode) {
      debug('Channel bind failed:', message.attributes.errorReason);
      if (message.attributes.errorCode === 438) { // Stale Nonce
        // Retry with new nonce
        const channelNumber = message.attributes.channelNumber;
        const peerAddress = this.channelBindings.get(channelNumber);
        if (peerAddress) {
          await this.bindChannel(peerAddress);
        }
        return;
      }
      this.emit('error', new Error(`Channel bind failed: ${message.attributes.errorReason}`));
      return;
    }

    const channelNumber = message.attributes.channelNumber;
    const peerAddress = message.attributes.xorPeerAddress?.address;
    if (channelNumber && peerAddress) {
      this.channelBindings.set(channelNumber, peerAddress);
      this.emit('channelBound', { channelNumber, peerAddress });
    }
  }

  private async handleDataIndication(message: any): Promise<void> {
    const data = message.attributes.data;
    const peerAddress = message.attributes.xorPeerAddress?.address;
    const peerPort = message.attributes.xorPeerAddress?.port;

    if (data && peerAddress) {
      // Check if we have permission for this peer
      const permission = this.permissions.get(peerAddress);
      if (!permission) {
        debug('Received data from peer without permission:', peerAddress);
        return;
      }

      this.emit('data', data, peerAddress, peerPort);
    }
  }

  private async bindChannel(peerAddress: string): Promise<number> {
    if (!this.socket || !this.allocation) {
      throw new Error('Not connected');
    }

    // Check if we already have a channel for this peer
    for (const [channelNumber, boundAddress] of this.channelBindings) {
      if (boundAddress === peerAddress) {
        return channelNumber;
      }
    }

    // Get next available channel number
    while (this.channelBindings.has(this.nextChannelNumber)) {
      this.nextChannelNumber++;
      if (this.nextChannelNumber > TURN_CONSTANTS.MAX_CHANNEL_NUMBER) {
        this.nextChannelNumber = TURN_CONSTANTS.MIN_CHANNEL_NUMBER;
      }
    }

    const channelNumber = this.nextChannelNumber++;
    const message = {
      type: TURN_CONSTANTS.STUN_MESSAGE_TYPES.CHANNEL_BIND_REQUEST,
      attributes: {
        [TURN_CONSTANTS.STUN_ATTRIBUTES.CHANNEL_NUMBER]: channelNumber,
        [TURN_CONSTANTS.STUN_ATTRIBUTES.XOR_PEER_ADDRESS]: {
          address: peerAddress,
          port: 0 // Port is required but not used for channel binding
        }
      }
    };

    const request = createStunMessage(message);

    // Send request
    if (this.socket instanceof Socket) {
      this.socket.send(request, this.options!.server.port, this.options!.server.host);
    } else {
      this.socket.write(request);
    }

    // Wait for response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Channel bind timeout'));
      }, TURN_CONSTANTS.CHANNEL_BIND_TIMEOUT);

      this.once('channelBound', ({ channelNumber: boundChannel }) => {
        clearTimeout(timeout);
        resolve(boundChannel);
      });
    });
  }

  public async send(data: Buffer, peerAddress: string, peerPort?: number): Promise<void> {
    if (!this.socket || !this.allocation) {
      throw new Error('Not connected');
    }

    // Check if we have a channel binding for this peer
    for (const [channelNumber, boundAddress] of this.channelBindings) {
      if (boundAddress === peerAddress) {
        // Send data using channel binding
        const header = Buffer.alloc(4);
        header.writeUInt16BE(channelNumber, 0);
        header.writeUInt16BE(data.length, 2);
        const message = Buffer.concat([header, data]);

        if (this.socket instanceof Socket) {
          this.socket.send(message, this.options!.server.port, this.options!.server.host);
        } else {
          this.socket.write(message);
        }
        return;
      }
    }

    // No channel binding, send using Send Indication
    const message = {
      type: TURN_CONSTANTS.STUN_MESSAGE_TYPES.SEND_INDICATION,
      attributes: {
        [TURN_CONSTANTS.STUN_ATTRIBUTES.XOR_PEER_ADDRESS]: {
          address: peerAddress,
          port: peerPort || 0
        },
        [TURN_CONSTANTS.STUN_ATTRIBUTES.DATA]: data
      }
    };

    const request = createStunMessage(message);

    if (this.socket instanceof Socket) {
      this.socket.send(request, this.options!.server.port, this.options!.server.host);
    } else {
      this.socket.write(request);
    }
  }

  private startRefreshTimer(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    // Refresh allocation before it expires
    const refreshInterval = (this.allocation!.lifetime * 1000) * 0.8;
    this.refreshTimer = setInterval(() => {
      this.refreshAllocation().catch(error => {
        debug('Error refreshing allocation:', error);
      });
    }, refreshInterval);
  }

  public async connect(options: TURNOptions): Promise<TURNResult> {
    try {
      if (!this.validateOptions(options)) {
        throw new Error('Invalid options');
      }

      this.options = options;
      this.setState(TURNConnectionState.CONNECTING);

      // Create socket
      this.socket = await this.createSocket(options);

      // Create allocation
      this.setState(TURNConnectionState.ALLOCATING);
      const allocateRequest = createStunMessage({
        type: TURN_CONSTANTS.STUN_MESSAGE_TYPES.ALLOCATE_REQUEST,
        attributes: {
          [TURN_CONSTANTS.STUN_ATTRIBUTES.REQUESTED_TRANSPORT]: 0x11, // UDP
          [TURN_CONSTANTS.STUN_ATTRIBUTES.LIFETIME]: options.lifetime || TURN_CONSTANTS.DEFAULT_ALLOCATION_LIFETIME,
          [TURN_CONSTANTS.STUN_ATTRIBUTES.USERNAME]: options.server.username,
          [TURN_CONSTANTS.STUN_ATTRIBUTES.REALM]: options.server.realm,
          [TURN_CONSTANTS.STUN_ATTRIBUTES.NONCE]: '',  // Will be filled by first response
          [TURN_CONSTANTS.STUN_ATTRIBUTES.MESSAGE_INTEGRITY]: '',  // Will be computed based on password
          [TURN_CONSTANTS.STUN_ATTRIBUTES.FINGERPRINT]: true
        }
      });

      // Send request
      if (this.socket instanceof Socket) {
        this.socket.send(allocateRequest, options.server.port, options.server.host);
      } else {
        this.socket.write(allocateRequest);
      }

      // Wait for response
      const result = await new Promise<TURNResult>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Allocation timeout'));
        }, options.timeout || TURN_CONSTANTS.ALLOCATION_TIMEOUT);

        this.once('allocation', (allocation: TURNAllocation) => {
          clearTimeout(timeout);
          this.allocation = allocation;
          this.setState(TURNConnectionState.READY);
          this.startRefreshTimer();
          resolve({
            success: true,
            allocation,
            socket: this.socket,
            details: {
              secure: true,
              verification: {
                lastChecked: Date.now(),
                method: 'direct'
              }
            }
          });
        });
      });

      return result;
    } catch (error: unknown) {
      this.setState(TURNConnectionState.FAILED);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  public async createPermission(peerAddress: string): Promise<TURNPermission> {
    if (this.state !== TURNConnectionState.READY) {
      throw new Error(`Cannot create permission in state: ${this.state}`);
    }

    if (!this.socket || !this.allocation) {
      throw new Error('Not connected');
    }

    // Check if we already have a valid permission
    const existingPermission = this.permissions.get(peerAddress);
    if (existingPermission && 
        Date.now() - existingPermission.lastVerified < existingPermission.lifetime * 1000) {
      return existingPermission;
    }

    const permission: TURNPermission = {
      peerAddress,
      lifetime: TURN_CONSTANTS.DEFAULT_PERMISSION_LIFETIME,
      secure: true,
      lastVerified: Date.now()
    };

    // Store the pending permission
    this.permissions.set(peerAddress, permission);

    // Reset retry count for new permission request
    this.retryCount = 0;

    const permissionRequest = createStunMessage({
      type: TURN_CONSTANTS.STUN_MESSAGE_TYPES.PERMISSION_REQUEST,
      attributes: {
        [TURN_CONSTANTS.STUN_ATTRIBUTES.XOR_PEER_ADDRESS]: {
          address: peerAddress,
          port: 0
        },
        [TURN_CONSTANTS.STUN_ATTRIBUTES.USERNAME]: this.options?.server.username,
        [TURN_CONSTANTS.STUN_ATTRIBUTES.REALM]: this.options?.server.realm,
        [TURN_CONSTANTS.STUN_ATTRIBUTES.NONCE]: '',  // Will be filled from allocation response
        [TURN_CONSTANTS.STUN_ATTRIBUTES.MESSAGE_INTEGRITY]: '',  // Will be computed based on password
        [TURN_CONSTANTS.STUN_ATTRIBUTES.FINGERPRINT]: true
      }
    });

    // Send request
    if (this.socket instanceof Socket) {
      this.socket.send(permissionRequest, this.options!.server.port, this.options!.server.host);
    } else {
      this.socket.write(permissionRequest);
    }

    // Wait for response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Remove the pending permission if it times out
        this.permissions.delete(peerAddress);
        reject(new Error('Permission timeout'));
      }, TURN_CONSTANTS.PERMISSION_TIMEOUT);

      this.once('permission', (updatedPermission: TURNPermission) => {
        clearTimeout(timeout);
        // The permission is already stored in the map by handlePermissionResponse
        resolve(updatedPermission);
      });
    });
  }

  public async refreshAllocation(lifetime?: number): Promise<boolean> {
    if (!this.socket || !this.allocation) {
      throw new Error('Not connected');
    }

    const refreshRequest = createStunMessage({
      type: TURN_CONSTANTS.STUN_MESSAGE_TYPES.REFRESH_REQUEST,
      attributes: {
        [TURN_CONSTANTS.STUN_ATTRIBUTES.LIFETIME]: lifetime || this.allocation!.lifetime,
        [TURN_CONSTANTS.STUN_ATTRIBUTES.USERNAME]: this.options?.server.username,
        [TURN_CONSTANTS.STUN_ATTRIBUTES.REALM]: this.options?.server.realm,
        [TURN_CONSTANTS.STUN_ATTRIBUTES.NONCE]: '',  // Will be filled from allocation response
        [TURN_CONSTANTS.STUN_ATTRIBUTES.MESSAGE_INTEGRITY]: '',  // Will be computed based on password
        [TURN_CONSTANTS.STUN_ATTRIBUTES.FINGERPRINT]: true
      }
    });

    // Send request
    if (this.socket instanceof Socket) {
      this.socket.send(refreshRequest, this.options!.server.port, this.options!.server.host);
    } else {
      this.socket.write(refreshRequest);
    }

    // Wait for response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Refresh timeout'));
      }, TURN_CONSTANTS.ALLOCATION_TIMEOUT);

      this.once('allocation', (allocation: TURNAllocation) => {
        clearTimeout(timeout);
        this.allocation = allocation;
        resolve(true);
      });
    });
  }

  public close(): void {
    if (this.state === TURNConnectionState.CLOSED) return;

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    if (this.permissionTimer) {
      clearInterval(this.permissionTimer);
    }

    if (this.socket) {
      if (this.socket instanceof Socket) {
        this.socket.close();
      } else {
        this.socket.end();
      }
    }

    // Clear all permissions and notify
    for (const permission of this.permissions.values()) {
      this.emit('permissionExpired', permission);
    }
    this.permissions.clear();

    this.signaling?.close();
    this.setState(TURNConnectionState.CLOSED);
    this.removeAllListeners();
  }

  // Type the event emitter
  public emit<K extends keyof TURNEvents>(event: K, ...args: Parameters<TURNEvents[K]>): boolean {
    return super.emit(event, ...args);
  }

  public on<K extends keyof TURNEvents>(event: K, listener: TURNEvents[K]): this {
    return super.on(event, listener);
  }

  public once<K extends keyof TURNEvents>(event: K, listener: TURNEvents[K]): this {
    return super.once(event, listener);
  }
} 
/**
 * TURN Types
 * 
 * Type definitions for Traversal Using Relays around NAT functionality with security and signaling support.
 */

import type { IGunInstance } from 'gun';
import type { CryptoIdentity } from '../../../crypto/identity';

/**
 * TURN server configuration
 */
export interface TURNServer {
  host: string;
  port: number;
  username?: string;
  password?: string;
  realm?: string;
  secure?: boolean;
  fingerprint?: string;
  certificate?: string;
  tlsVersion?: 'TLSv1.2' | 'TLSv1.3';
}

/**
 * TURN security options
 */
export interface TURNSecurityOptions {
  requireEncryption?: boolean;
  validateSignature?: boolean;
  validateFingerprint?: boolean;
  identity?: CryptoIdentity;
  allowedProtocols?: ('TCP' | 'UDP')[];
  allowedPorts?: {
    min: number;
    max: number;
  };
  maxLifetime?: number;
  minLifetime?: number;
  maxChannels?: number;
  maxPermissions?: number;
  maxBandwidth?: number;
  allowLoopback?: boolean;
  allowPrivateNetwork?: boolean;
}

/**
 * TURN signaling options
 */
export interface TURNSignalingOptions {
  gun: IGunInstance;
  peerId: string;
  room?: string;
  channelPrefix?: string;
  verificationInterval?: number;
  peerTimeout?: number;
}

/**
 * TURN connection options
 */
export interface TURNOptions {
  server: TURNServer;
  localPort?: number;
  timeout?: number;
  retries?: number;
  protocol?: 'TCP' | 'UDP';
  lifetime?: number;
  security?: TURNSecurityOptions;
  signaling?: TURNSignalingOptions;
}

/**
 * TURN allocation result
 */
export interface TURNAllocation {
  relayAddress: string;
  relayPort: number;
  serverAddress: string;
  serverPort: number;
  lifetime: number;
  protocol: 'TCP' | 'UDP';
  secure: boolean;
  lastVerified: number;
  bandwidth?: {
    allocated: number;
    used: number;
  };
}

/**
 * TURN permission
 */
export interface TURNPermission {
  peerAddress: string;
  lifetime: number;
  channelNumber?: number;
  secure: boolean;
  lastVerified?: number;
  bandwidth?: {
    allocated: number;
    used: number;
  };
}

/**
 * TURN connection result
 */
export interface TURNResult {
  success: boolean;
  allocation?: TURNAllocation;
  socket?: any; // Socket type depends on protocol
  error?: string;
  details?: {
    secure: boolean;
    signaling?: {
      channel?: string;
      latency?: number;
    };
    verification?: {
      lastChecked: number;
      method: 'direct' | 'peer' | 'stun';
    };
    bandwidth?: {
      allocated: number;
      used: number;
      limit: number;
    };
  };
}

/**
 * TURN client interface
 */
export interface TURNClient {
  connect(options: TURNOptions): Promise<TURNResult>;
  createPermission(peerAddress: string): Promise<TURNPermission>;
  refreshAllocation(lifetime?: number): Promise<boolean>;
  close(): void;
  on<K extends keyof TURNEvents>(event: K, listener: TURNEvents[K]): this;
  off<K extends keyof TURNEvents>(event: K, listener: TURNEvents[K]): this;
}

/**
 * TURN connection state
 */
export enum TURNConnectionState {
  NEW = 'new',
  CONNECTING = 'connecting',
  ALLOCATING = 'allocating',
  READY = 'ready',
  FAILED = 'failed',
  CLOSED = 'closed'
}

/**
 * TURN events
 */
export interface TURNEvents {
  error: (error: Error) => void;
  data: (data: Buffer, peerAddress: string, peerPort?: number) => void;
  allocation: (allocation: TURNAllocation) => void;
  permission: (permission: TURNPermission) => void;
  permissionExpired: (permission: TURNPermission) => void;
  connectionStateChange: (state: TURNConnectionState) => void;
  channelBound: (data: { channelNumber: number; peerAddress: string }) => void;
}

/**
 * TURN signaling message
 */
export interface TURNSignalingMessage {
  type: 'allocation-request' | 'allocation-response' | 'permission-request' | 'permission-response' | 'verification-request' | 'verification-response';
  from: string;
  to?: string;
  allocation?: TURNAllocation;
  permission?: TURNPermission;
  result?: TURNResult;
  timestamp: number;
  signature?: string;
  encrypted?: boolean;
} 
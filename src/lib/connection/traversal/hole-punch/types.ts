/**
 * Hole Punching Types
 * 
 * Type definitions for UDP/TCP hole punching functionality with GunJS signaling.
 */

import type { GunInstance } from '../../../../types/gun';

/**
 * Hole punching security options
 */
export interface HolePunchSecurityOptions {
  validatePeerIdentity: boolean;
  validateSignature: boolean;
  requireEncryption: boolean;
  maxPacketSize: number;
  allowLoopback: boolean;
  allowPrivateNetwork: boolean;
  channelPrefix?: string;
  maxRetransmissions?: number;
  retransmissionTimeout?: number;
}

/**
 * Hole punching options
 */
export interface HolePunchOptions {
  protocol: 'TCP' | 'UDP';
  peerId: string;
  gun: GunInstance;
  localPort?: number;
  timeout?: number;
  retries?: number;
  preferredFamily?: 'IPv6' | 'IPv4';
  security?: HolePunchSecurityOptions;
  targetAddress?: string;
  targetPort?: number;
}

/**
 * Hole punching connection info
 */
export interface HolePunchConnectionInfo {
  type: 'offer' | 'answer';
  from: string;
  protocol: 'TCP' | 'UDP';
  address: string;
  port: number;
  localAddress: string;
  localPort: number;
  family: 'IPv4' | 'IPv6';
  targetAddress?: string;
  targetPort?: number;
  timestamp: number;
  encrypted: boolean;
  signature?: string;
  payload?: {
    encrypted: string;
    iv: string;
    tag: string;
  };
}

/**
 * Hole punching result
 */
export interface HolePunchResult {
  success: boolean;
  socket?: any; // Socket type depends on protocol
  localAddress?: string;
  localPort?: number;
  remoteAddress?: string;
  remotePort?: number;
  error?: string;
  status?: HolePunchStatus;
  details?: {
    rtt?: number;
    protocol?: string;
    secure?: boolean;
    retries?: number;
    signaling?: {
      channel: string;
      latency: number;
    };
  };
}

/**
 * Hole punching client interface
 */
export interface HolePunchClient {
  status: HolePunchStatus;
  punch(options: HolePunchOptions): Promise<HolePunchResult>;
  close(): void;
  on<K extends keyof HolePunchEvents>(event: K, listener: HolePunchEvents[K]): void;
  off<K extends keyof HolePunchEvents>(event: K, listener: HolePunchEvents[K]): void;
}

/**
 * Hole punching status
 */
export enum HolePunchStatus {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  DISCOVERING = 'discovering',
  SIGNALING = 'signaling',
  CONNECTING = 'connecting',
  RETRYING = 'retrying',
  CONNECTED = 'connected',
  FAILED = 'failed',
  CLOSED = 'closed'
}

/**
 * Hole punching events
 */
export interface HolePunchEvents {
  status: (status: HolePunchStatus) => void;
  error: (error: Error) => void;
  connected: (result: HolePunchResult) => void;
  retry: (attempt: number, maxRetries: number) => void;
  security: (warning: string) => void;
} 
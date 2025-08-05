import type { Socket } from 'dgram';
import type { GunInstance } from '../../../../types/gun';

/**
 * Default STUN servers
 * Using well-known public STUN servers from Google and others
 */
export const DEFAULT_STUN_SERVERS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun2.l.google.com:19302',
  'stun:stun3.l.google.com:19302',
  'stun:stun4.l.google.com:19302',
  'stun:stun.stunprotocol.org:3478'
];

/**
 * STUN protocol constants
 */
export const STUN_CONSTANTS = {
  MAGIC_COOKIE: 0x2112A442,
  BINDING_REQUEST: 0x0001,
  BINDING_RESPONSE: 0x0101,
  BINDING_ERROR_RESPONSE: 0x0111,
  MAPPED_ADDRESS: 0x0001,
  XOR_MAPPED_ADDRESS: 0x0020,
  SOFTWARE: 0x8022,
  FINGERPRINT: 0x8028,
  RETRANSMISSION_TIMEOUT: 500,  // ms
  MAX_RETRANSMISSIONS: 6,
  TRANSACTION_TIMEOUT: 5000,    // ms
  TEST_PACKET_TIMEOUT: 3000,    // ms
  CHANNEL_TIMEOUT: 30000,       // ms
  SOFTWARE_NAME: 'dig-nat-tools-stun'
} as const;

/**
 * STUN security options
 */
export interface STUNSecurityOptions {
  validateStunResponse?: boolean;     // Validate STUN response integrity
  validatePeerIdentity?: boolean;     // Validate peer identity in signaling
  requireEncryption?: boolean;        // Require encrypted signaling
  maxPacketSize?: number;            // Maximum allowed packet size
  allowLoopback?: boolean;           // Allow connections to loopback addresses
  allowPrivateNetwork?: boolean;     // Allow connections to private network addresses
  channelPrefix?: string;            // Custom prefix for signaling channels
}

/**
 * STUN client options
 */
export interface STUNOptions {
  servers?: string[];                // STUN servers (defaults to DEFAULT_STUN_SERVERS)
  localPort?: number;                // Local port to bind to
  timeout?: number;                  // Overall operation timeout
  preferredFamily?: 'IPv6' | 'IPv4'; // Preferred IP family
  maxRetries?: number;              // Maximum number of connection retries
  security?: STUNSecurityOptions;    // Security options
}

/**
 * STUN connection options
 */
export interface STUNConnectionOptions extends STUNOptions {
  peerId: string;                    // Target peer ID
  gun: GunInstance;                  // GunJS instance for signaling
  address?: string;                  // Optional target address
  port?: number;                     // Optional target port
}

/**
 * STUN connection result
 */
export interface STUNResult {
  success: boolean;
  socket?: Socket;
  remoteAddress?: string;
  remotePort?: number;
  localAddress?: string;
  localPort?: number;
  externalAddress?: string;
  externalPort?: number;
  error?: string;
  status: STUNStatus;               // Current connection status
  details?: {                       // Additional connection details
    rtt?: number;                   // Round-trip time
    protocol?: string;              // Protocol used (UDP/TCP)
    secure?: boolean;               // Whether connection is secure
    retries?: number;               // Number of retries performed
    stunServer?: string;            // STUN server used
  };
}

/**
 * STUN connection status
 */
export enum STUNStatus {
  IDLE = 'idle',
  CONNECTING = 'connecting',
  DISCOVERING = 'discovering',
  SIGNALING = 'signaling',
  RETRYING = 'retrying',           // Added retrying status
  CONNECTED = 'connected',
  FAILED = 'failed',
  CLOSED = 'closed'
}

/**
 * STUN events
 */
export interface STUNEvents {
  status: (status: STUNStatus) => void;
  connecting: (address: string, port: number) => void;
  connected: (result: STUNResult) => void;
  error: (error: Error) => void;
  close: () => void;
  retry: (attempt: number, maxRetries: number) => void;  // Added retry event
  security: (warning: string) => void;                   // Added security event
}

/**
 * STUN client interface
 */
export interface STUNClient {
  readonly status: STUNStatus;                          // Added readonly status
  connect(options: STUNConnectionOptions): Promise<STUNResult>;
  close(): void;
  on(event: keyof STUNEvents, listener: (...args: any[]) => void): void;
  off(event: keyof STUNEvents, listener: (...args: any[]) => void): void;
} 
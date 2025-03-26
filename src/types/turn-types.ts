import { CONNECTION_TYPE } from './constants';

/**
 * TURN message types (RFC 5766)
 */
export enum TURNMessageType {
  ALLOCATE_REQUEST = 0x0003,
  ALLOCATE_RESPONSE = 0x0103,
  ALLOCATE_ERROR_RESPONSE = 0x0113,
  REFRESH_REQUEST = 0x0004,
  REFRESH_RESPONSE = 0x0104,
  REFRESH_ERROR_RESPONSE = 0x0114,
  CREATE_PERMISSION_REQUEST = 0x0008,
  CREATE_PERMISSION_RESPONSE = 0x0108,
  CREATE_PERMISSION_ERROR_RESPONSE = 0x0118,
  CHANNEL_BIND_REQUEST = 0x0009,
  CHANNEL_BIND_RESPONSE = 0x0109,
  CHANNEL_BIND_ERROR_RESPONSE = 0x0119,
  DATA_INDICATION = 0x0115,
  SEND_INDICATION = 0x0016
}

/**
 * TURN attribute types (RFC 5766)
 */
export enum TURNAttributeType {
  MAPPED_ADDRESS = 0x0001,
  USERNAME = 0x0006,
  MESSAGE_INTEGRITY = 0x0008,
  ERROR_CODE = 0x0009,
  UNKNOWN_ATTRIBUTES = 0x000A,
  REALM = 0x0014,
  NONCE = 0x0015,
  CHANNEL_NUMBER = 0x000C,
  LIFETIME = 0x000D,
  XOR_PEER_ADDRESS = 0x0012,
  DATA = 0x0013,
  XOR_RELAYED_ADDRESS = 0x0016,
  EVEN_PORT = 0x0018,
  REQUESTED_TRANSPORT = 0x0019,
  DONT_FRAGMENT = 0x001A,
  RESERVATION_TOKEN = 0x0022,
  SOFTWARE = 0x8022,
  ALTERNATE_SERVER = 0x8023,
  FINGERPRINT = 0x8028
}

/**
 * TURN allocation result
 */
export interface TURNResult {
  success: boolean;
  connectionType: CONNECTION_TYPE.TURN;
  relayedAddress?: string;
  relayedPort?: number;
  lifetime?: number;
  error?: string;
}

/**
 * TURN allocation object interface
 */
export interface TURNAllocation {
  relayedAddress: string;
  relayedPort: number;
  lifetime?: number;
  turnServer: string;  // TURN server URL
  turnPort: number;    // TURN server port
  createPermission: (address: string, callback: (err: Error | null) => void) => void;
  sendToRelayed: (data: Buffer | string, address: string, port: number, callback?: () => void) => void;
  release: (callback: (err: Error | null) => void) => void;
}

/**
 * TURN options
 */
export interface TURNOptions {
  // TURN server settings
  turnServer: string;
  turnUsername?: string;
  turnPassword?: string;
  turnPort?: number;
  
  // Connection parameters
  protocol: 'TCP' | 'UDP';
  lifetime?: number;  // Allocation lifetime in seconds
  timeout?: number;   // Connection timeout in milliseconds
  
  // Remote peer information (for connecting)
  remotePeerAddress?: string;
  remotePeerPort?: number;
  
  // Security settings
  requireEncryption?: boolean;
  allowedIPs?: string[];
  clientIP?: string;
} 
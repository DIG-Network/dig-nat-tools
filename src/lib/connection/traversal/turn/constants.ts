/**
 * TURN Constants
 * 
 * Constants and default values for TURN functionality.
 */

export const TURN_CONSTANTS = {
  // Default ports
  DEFAULT_PORT: 3478,
  DEFAULT_TLS_PORT: 5349,
  MIN_PORT: 1024,
  MAX_PORT: 65535,
  DEFAULT_LOCAL_PORT: 0, // Let OS choose

  // Protocol defaults
  DEFAULT_PROTOCOL: 'TCP' as 'TCP' | 'UDP',
  DEFAULT_TLS_VERSION: 'TLSv1.2' as 'TLSv1.2' | 'TLSv1.3',

  // Timeouts and intervals
  CONNECTION_TIMEOUT: 5000,
  ALLOCATION_TIMEOUT: 10000,
  PERMISSION_TIMEOUT: 5000,
  CHANNEL_BIND_TIMEOUT: 5000,
  REFRESH_INTERVAL: 240000, // 4 minutes (lifetime is typically 10 minutes)
  VERIFICATION_INTERVAL: 300000, // 5 minutes
  RETRY_INTERVAL: 1000,
  MAX_RETRIES: 3,

  // Message sizes
  MAX_MESSAGE_SIZE: 65535,
  CHANNEL_DATA_HEADER_SIZE: 4,
  STUN_HEADER_SIZE: 20,

  // Lifetime values
  MIN_LIFETIME: 300, // 5 minutes
  MAX_LIFETIME: 3600, // 1 hour
  DEFAULT_ALLOCATION_LIFETIME: 600, // 10 minutes
  DEFAULT_PERMISSION_LIFETIME: 300, // 5 minutes

  // Channel numbers
  MIN_CHANNEL_NUMBER: 0x4000,
  MAX_CHANNEL_NUMBER: 0x7FFF,

  // Security defaults
  DEFAULT_SECURITY_OPTIONS: {
    requireEncryption: true,
    validateSignature: true,
    validateFingerprint: true,
    allowLoopback: false,
    allowPrivateNetwork: true,
    maxLifetime: 3600,
    minLifetime: 300,
    maxChannels: 100,
    maxPermissions: 100,
    maxBandwidth: 1024 * 1024 * 10, // 10 Mbps
    allowedProtocols: ['TCP', 'UDP'] as ('TCP' | 'UDP')[],
    allowedPorts: {
      min: 1024,
      max: 65535
    }
  },

  // Signaling defaults
  DEFAULT_SIGNALING_OPTIONS: {
    channelPrefix: 'turn',
    verificationInterval: 300000,
    peerTimeout: 10000
  },

  // STUN message types
  STUN_MESSAGE_TYPES: {
    ALLOCATE_REQUEST: 0x0003,
    ALLOCATE_RESPONSE: 0x0103,
    ALLOCATE_ERROR_RESPONSE: 0x0113,
    REFRESH_REQUEST: 0x0004,
    REFRESH_RESPONSE: 0x0104,
    REFRESH_ERROR_RESPONSE: 0x0114,
    PERMISSION_REQUEST: 0x0008,
    PERMISSION_RESPONSE: 0x0108,
    PERMISSION_ERROR_RESPONSE: 0x0118,
    CHANNEL_BIND_REQUEST: 0x0009,
    CHANNEL_BIND_RESPONSE: 0x0109,
    CHANNEL_BIND_ERROR_RESPONSE: 0x0119,
    DATA_INDICATION: 0x0017,
    SEND_INDICATION: 0x0016
  },

  // STUN attributes
  STUN_ATTRIBUTES: {
    MAPPED_ADDRESS: 0x0001,
    XOR_MAPPED_ADDRESS: 0x0020,
    RELAYED_ADDRESS: 0x0016,
    XOR_RELAYED_ADDRESS: 0x0016,
    LIFETIME: 0x000D,
    CHANNEL_NUMBER: 0x000C,
    XOR_PEER_ADDRESS: 0x0012,
    DATA: 0x0013,
    REQUESTED_TRANSPORT: 0x0019,
    USERNAME: 0x0006,
    REALM: 0x0014,
    NONCE: 0x0015,
    MESSAGE_INTEGRITY: 0x0008,
    FINGERPRINT: 0x0020,
    ERROR_CODE: 0x0009,
    BANDWIDTH: 0x0010,
    LIFETIME_QUOTA: 0x001D
  },

  // STUN/TURN Protocol Constants
  MAGIC_COOKIE: 0x2112A442, // Fixed value defined in RFC 5389
} as const; 
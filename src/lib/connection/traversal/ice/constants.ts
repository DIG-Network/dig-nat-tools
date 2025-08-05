/**
 * ICE Constants
 * 
 * Configuration constants for Interactive Connectivity Establishment.
 */

export const ICE_CONSTANTS = {
  // Timeouts
  GATHERING_TIMEOUT: 10000,
  CONNECTION_TIMEOUT: 30000,
  SIGNALING_TIMEOUT: 15000,
  RETRY_INTERVAL: 1000,
  MAX_RETRIES: 3,

  // Security
  DEFAULT_SECURITY_OPTIONS: {
    requireEncryption: true,
    validateSignature: true,
    validatePeerIdentity: true,
    channelPrefix: 'ice',
    maxPacketSize: 65535,
    allowLoopback: false,
    allowPrivateNetwork: true,
    allowedProtocols: ['UDP', 'TCP'] as const,
    minPort: 1024,
    maxPort: 65535
  },

  // WebRTC
  DEFAULT_RTC_CONFIG: {
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceTransportPolicy: 'all',
    iceCandidatePoolSize: 0
  },

  // Signaling
  CHANNEL_TTL: 300000, // 5 minutes
  MAX_SIGNALING_RETRIES: 3,

  // Candidate gathering
  MAX_CANDIDATES: 50,
  CANDIDATE_POOL_SIZE: 5,
  CANDIDATE_GATHERING_DONE_TIMEOUT: 2000,

  // Debug
  DEBUG_NAMESPACE: 'dig-nat-tools:ice'
} as const; 
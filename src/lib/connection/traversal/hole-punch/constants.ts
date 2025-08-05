/**
 * Hole Punching Constants
 */

export const HOLE_PUNCH_CONSTANTS = {
  // Protocol constants
  MAGIC_COOKIE: 0x2112A442,
  TEST_PACKET_MAGIC: 0xF5A9B3C7,
  
  // Default timeouts (ms)
  TRANSACTION_TIMEOUT: 10000,
  RETRANSMISSION_TIMEOUT: 500,
  TEST_PACKET_TIMEOUT: 2000,
  CONNECTION_TIMEOUT: 5000,
  STAGGERED_CONNECTION_DELAY: 500,
  
  // Retry settings
  MAX_RETRANSMISSIONS: 5,
  MAX_RETRIES: 3,
  
  // Security settings
  DEFAULT_MAX_PACKET_SIZE: 1500,
  MIN_PORT: 1024,
  MAX_PORT: 65535,
  
  // Protocol messages
  SOFTWARE_NAME: 'dig-nat-tools/hole-punch',
  SOFTWARE: 0x8022,
  FINGERPRINT: 0x8028,
  
  // Default ports
  DEFAULT_UDP_PORT: 19302,
  DEFAULT_TCP_PORT: 19303,

  // Default security options
  DEFAULT_SECURITY_OPTIONS: {
    validatePeerIdentity: true,
    requireEncryption: false,
    maxPacketSize: 1500,
    allowLoopback: false,
    allowPrivateNetwork: true,
    channelPrefix: 'hole-punch',
    validateSignature: true,
    maxRetransmissions: 5,
    retransmissionTimeout: 500
  }
} as const; 
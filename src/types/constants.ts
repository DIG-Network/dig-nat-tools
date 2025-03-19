/**
 * Constant definitions for the dig-nat-tools library
 */

/**
 * Connection types supported by the library
 */
export enum CONNECTION_TYPE {
  // Direct connections
  TCP = 'TCP',                     // Direct TCP connection
  UDP = 'UDP',                     // Direct UDP connection
  
  // NAT traversal methods (in order of reliability)
  UPNP = 'UPNP',                   // UPnP port mapping
  NAT_PMP = 'NAT_PMP',             // NAT-PMP/PCP port mapping
  
  // Hole punching methods
  UDP_HOLE_PUNCH = 'UDP_HOLE_PUNCH', // Basic UDP hole punching
  UDP_ADVANCED_HOLE_PUNCH = 'UDP_ADVANCED_HOLE_PUNCH', // Advanced predictive UDP hole punch
  TCP_HOLE_PUNCH = 'TCP_HOLE_PUNCH', // TCP hole punching with Gun.js signaling
  TCP_SIMULTANEOUS_OPEN = 'TCP_SIMULTANEOUS_OPEN', // Simultaneous TCP connection
  
  // WebRTC related
  WEBRTC = 'WEBRTC',               // WebRTC data channel
  ICE = 'ICE',                     // Standalone ICE protocol
  
  // Relay methods (fallbacks)
  TURN = 'TURN',                   // TURN relay
  GUN = 'GUN',                     // Gun.js relay
  
  // IPv6 related
  IPV6 = 'IPV6',                   // Native IPv6 connection
  IPV6_TUNNEL = 'IPV6_TUNNEL'      // IPv6 tunneling (6to4, Teredo)
}

/**
 * Default chunk size for file transfers (1MB)
 */
export const DEFAULT_CHUNK_SIZE = 1024 * 1024;

/**
 * Default connection timeout in milliseconds (30 seconds)
 */
export const DEFAULT_CONNECTION_TIMEOUT = 30000;

/**
 * Default request timeout in milliseconds (10 seconds)
 */
export const DEFAULT_REQUEST_TIMEOUT = 10000;

/**
 * Default peer connection timeout in milliseconds (45 seconds)
 */
export const DEFAULT_PEER_TIMEOUT = 45000;

/**
 * Default concurrency for multi-peer downloads (3 peers)
 */
export const DEFAULT_CONCURRENCY = 3;

/**
 * Default TCP port for hosting
 */
export const DEFAULT_TCP_PORT = 0; // 0 means random port

/**
 * Default UDP port for hosting
 */
export const DEFAULT_UDP_PORT = 0; // 0 means random port

/**
 * Default public STUN servers
 */
export const DEFAULT_STUN_SERVERS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun2.l.google.com:19302'
]; 
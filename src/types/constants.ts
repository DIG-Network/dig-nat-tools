/**
 * Constant definitions for the dig-nat-tools library
 */

/**
 * Connection types supported by the library
 */
export enum CONNECTION_TYPE {
  UNKNOWN = 'unknown',
  TCP = 'tcp',
  UDP = 'udp',
  WEBRTC = 'webrtc',
  GUN_RELAY = 'gun-relay',
  
  // NAT traversal methods (in order of reliability)
  UPNP = 'UPNP',                   // UPnP port mapping
  NAT_PMP = 'NAT_PMP',             // NAT-PMP/PCP port mapping
  
  // Hole punching methods
  UDP_HOLE_PUNCH = 'UDP_HOLE_PUNCH', // Basic UDP hole punching
  UDP_ADVANCED_HOLE_PUNCH = 'UDP_ADVANCED_HOLE_PUNCH', // Advanced predictive UDP hole punch
  TCP_HOLE_PUNCH = 'TCP_HOLE_PUNCH', // TCP hole punching with Gun.js signaling
  TCP_SIMULTANEOUS_OPEN = 'TCP_SIMULTANEOUS_OPEN', // Simultaneous TCP connection
  
  // WebRTC related
  ICE = 'ICE',                     // Standalone ICE protocol
  
  // Relay methods (fallbacks)
  TURN = 'TURN',                   // TURN relay
  GUN = 'GUN',                     // Gun.js relay
  
  // IPv6 related
  IPV6 = 'IPV6',                   // Native IPv6 connection
  IPV6_TUNNEL = 'IPV6_TUNNEL',      // IPv6 tunneling (6to4, Teredo)
  
  // New connection type
  STUN_GUN = 'STUN_GUN'  // Add STUN with GunJS signaling
}

/**
 * Default chunk size for file transfers (1MB)
 */
export const DEFAULT_CHUNK_SIZE = 1024 * 1024;

/**
 * Default timeout for peer connections (30 seconds)
 */
export const DEFAULT_PEER_TIMEOUT = 30000;

/**
 * Default port for peer discovery
 */
export const DEFAULT_DISCOVERY_PORT = 6881;

/**
 * Default port range for peer connections
 */
export const DEFAULT_PORT_RANGE = {
  min: 49152,
  max: 65535
};

/**
 * Default connection timeout in milliseconds (30 seconds)
 */
export const DEFAULT_CONNECTION_TIMEOUT = 30000;

/**
 * Default request timeout in milliseconds (10 seconds)
 */
export const DEFAULT_REQUEST_TIMEOUT = 10000;

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

/**
 * NAT traversal methods
 */
export const NAT_METHODS = {
  DIRECT: 'direct',
  UPNP: 'upnp',
  NAT_PMP: 'nat-pmp',
  UDP_HOLE_PUNCHING: 'udp-hole-punching',
  TCP_PORT_PREDICTION: 'tcp-port-prediction',
  WEBRTC: 'webrtc',
  RELAY: 'relay'
};

/**
 * Peer discovery sources
 */
export const PEER_SOURCES = {
  DHT: 'dht',
  PEX: 'pex',
  LOCAL: 'local',
  TRACKER: 'tracker',
  MANUAL: 'manual',
  GUN: 'gun'
}; 
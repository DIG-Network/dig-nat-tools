/**
 * Constant definitions for the dig-nat-tools library
 */

/**
 * Connection types supported by the library
 */
export enum CONNECTION_TYPE {
  /**
   * TCP direct connection
   */
  TCP = 'tcp',
  
  /**
   * UDP direct connection
   */
  UDP = 'udp',
  
  /**
   * WebRTC connection using DataChannel
   */
  WEBRTC = 'webrtc',
  
  /**
   * Fallback Gun relay connection
   */
  GUN = 'gun'
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
/**
 * Constant definitions for the dig-nat-tools library
 */
/**
 * Connection types supported by the library
 */
export declare enum CONNECTION_TYPE {
    /**
     * TCP direct connection
     */
    TCP = "tcp",
    /**
     * UDP direct connection
     */
    UDP = "udp",
    /**
     * WebRTC connection using DataChannel
     */
    WEBRTC = "webrtc",
    /**
     * Fallback Gun relay connection
     */
    GUN = "gun"
}
/**
 * Default chunk size for file transfers (1MB)
 */
export declare const DEFAULT_CHUNK_SIZE: number;
/**
 * Default connection timeout in milliseconds (30 seconds)
 */
export declare const DEFAULT_CONNECTION_TIMEOUT = 30000;
/**
 * Default request timeout in milliseconds (10 seconds)
 */
export declare const DEFAULT_REQUEST_TIMEOUT = 10000;
/**
 * Default peer connection timeout in milliseconds (45 seconds)
 */
export declare const DEFAULT_PEER_TIMEOUT = 45000;
/**
 * Default concurrency for multi-peer downloads (3 peers)
 */
export declare const DEFAULT_CONCURRENCY = 3;
/**
 * Default TCP port for hosting
 */
export declare const DEFAULT_TCP_PORT = 0;
/**
 * Default UDP port for hosting
 */
export declare const DEFAULT_UDP_PORT = 0;
/**
 * Default public STUN servers
 */
export declare const DEFAULT_STUN_SERVERS: string[];

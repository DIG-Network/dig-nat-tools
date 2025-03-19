/**
 * Constant definitions for the dig-nat-tools library
 */
/**
 * Connection types supported by the library
 */
export declare enum CONNECTION_TYPE {
    TCP = "TCP",// Direct TCP connection
    UDP = "UDP",// Direct UDP connection
    UPNP = "UPNP",// UPnP port mapping
    NAT_PMP = "NAT_PMP",// NAT-PMP/PCP port mapping
    UDP_HOLE_PUNCH = "UDP_HOLE_PUNCH",// Basic UDP hole punching
    UDP_ADVANCED_HOLE_PUNCH = "UDP_ADVANCED_HOLE_PUNCH",// Advanced predictive UDP hole punch
    TCP_HOLE_PUNCH = "TCP_HOLE_PUNCH",// TCP hole punching with Gun.js signaling
    TCP_SIMULTANEOUS_OPEN = "TCP_SIMULTANEOUS_OPEN",// Simultaneous TCP connection
    WEBRTC = "WEBRTC",// WebRTC data channel
    ICE = "ICE",// Standalone ICE protocol
    TURN = "TURN",// TURN relay
    GUN = "GUN",// Gun.js relay
    IPV6 = "IPV6",// Native IPv6 connection
    IPV6_TUNNEL = "IPV6_TUNNEL"
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

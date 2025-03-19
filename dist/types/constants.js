"use strict";
/**
 * Constant definitions for the dig-nat-tools library
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_STUN_SERVERS = exports.DEFAULT_UDP_PORT = exports.DEFAULT_TCP_PORT = exports.DEFAULT_CONCURRENCY = exports.DEFAULT_PEER_TIMEOUT = exports.DEFAULT_REQUEST_TIMEOUT = exports.DEFAULT_CONNECTION_TIMEOUT = exports.DEFAULT_CHUNK_SIZE = exports.CONNECTION_TYPE = void 0;
/**
 * Connection types supported by the library
 */
var CONNECTION_TYPE;
(function (CONNECTION_TYPE) {
    // Direct connections
    CONNECTION_TYPE["TCP"] = "TCP";
    CONNECTION_TYPE["UDP"] = "UDP";
    // NAT traversal methods (in order of reliability)
    CONNECTION_TYPE["UPNP"] = "UPNP";
    CONNECTION_TYPE["NAT_PMP"] = "NAT_PMP";
    // Hole punching methods
    CONNECTION_TYPE["UDP_HOLE_PUNCH"] = "UDP_HOLE_PUNCH";
    CONNECTION_TYPE["UDP_ADVANCED_HOLE_PUNCH"] = "UDP_ADVANCED_HOLE_PUNCH";
    CONNECTION_TYPE["TCP_HOLE_PUNCH"] = "TCP_HOLE_PUNCH";
    CONNECTION_TYPE["TCP_SIMULTANEOUS_OPEN"] = "TCP_SIMULTANEOUS_OPEN";
    // WebRTC related
    CONNECTION_TYPE["WEBRTC"] = "WEBRTC";
    CONNECTION_TYPE["ICE"] = "ICE";
    // Relay methods (fallbacks)
    CONNECTION_TYPE["TURN"] = "TURN";
    CONNECTION_TYPE["GUN"] = "GUN";
    // IPv6 related
    CONNECTION_TYPE["IPV6"] = "IPV6";
    CONNECTION_TYPE["IPV6_TUNNEL"] = "IPV6_TUNNEL"; // IPv6 tunneling (6to4, Teredo)
})(CONNECTION_TYPE || (exports.CONNECTION_TYPE = CONNECTION_TYPE = {}));
/**
 * Default chunk size for file transfers (1MB)
 */
exports.DEFAULT_CHUNK_SIZE = 1024 * 1024;
/**
 * Default connection timeout in milliseconds (30 seconds)
 */
exports.DEFAULT_CONNECTION_TIMEOUT = 30000;
/**
 * Default request timeout in milliseconds (10 seconds)
 */
exports.DEFAULT_REQUEST_TIMEOUT = 10000;
/**
 * Default peer connection timeout in milliseconds (45 seconds)
 */
exports.DEFAULT_PEER_TIMEOUT = 45000;
/**
 * Default concurrency for multi-peer downloads (3 peers)
 */
exports.DEFAULT_CONCURRENCY = 3;
/**
 * Default TCP port for hosting
 */
exports.DEFAULT_TCP_PORT = 0; // 0 means random port
/**
 * Default UDP port for hosting
 */
exports.DEFAULT_UDP_PORT = 0; // 0 means random port
/**
 * Default public STUN servers
 */
exports.DEFAULT_STUN_SERVERS = [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
    'stun:stun2.l.google.com:19302'
];
//# sourceMappingURL=constants.js.map
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
    /**
     * TCP direct connection
     */
    CONNECTION_TYPE["TCP"] = "tcp";
    /**
     * UDP direct connection
     */
    CONNECTION_TYPE["UDP"] = "udp";
    /**
     * WebRTC connection using DataChannel
     */
    CONNECTION_TYPE["WEBRTC"] = "webrtc";
    /**
     * Fallback Gun relay connection
     */
    CONNECTION_TYPE["GUN"] = "gun";
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
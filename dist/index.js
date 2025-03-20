"use strict";
/**
 * Entry point for the Dig NAT Tools library
 * Provides tools for NAT traversal and P2P file sharing
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionTypes = exports.PeerDiscoveryManager = exports.LocalDiscovery = exports.PexMessageType = exports.PexManager = exports.DHTClient = exports.connectWithNATTraversal = exports.NATTraversalManager = exports.createTURNAllocation = exports.TURNClient = exports.ICECandidateType = exports.ICEClient = exports.connectWithICE = exports.performTCPSimultaneousOpen = exports.performUDPHolePunch = exports.performTCPHolePunch = exports.connectionRegistry = exports.getExternalAddressUPnP = exports.deleteUPnPMapping = exports.createUPnPMapping = exports.upnpClient = exports.promiseWithTimeout = exports.shuffleArray = exports.getRandomArrayValue = exports.base64ToBuffer = exports.bufferToBase64 = exports.getRandomPort = exports.isPrivateIP = exports.getLocalIPs = exports.calculateSHA256 = exports.discoverPublicIPs = exports.safeJSONParse = exports.sleep = exports.createConnectionString = exports.parseConnectionString = exports.CONNECTION_TYPE = exports.NetworkManager = exports.FileClient = exports.FileHost = void 0;
exports.createHost = createHost;
exports.createClient = createClient;
exports.createNetworkManager = createNetworkManager;
exports.downloadFile = downloadFile;
exports.connectToPeer = connectToPeer;
exports.findPeers = findPeers;
// Export types
__exportStar(require("./types/constants"), exports);
// Export main classes
const host_1 = __importDefault(require("./lib/host"));
exports.FileHost = host_1.default;
const client_1 = __importDefault(require("./lib/client"));
exports.FileClient = client_1.default;
const network_manager_1 = __importDefault(require("./lib/network-manager"));
exports.NetworkManager = network_manager_1.default;
const constants_1 = require("./types/constants");
Object.defineProperty(exports, "CONNECTION_TYPE", { enumerable: true, get: function () { return constants_1.CONNECTION_TYPE; } });
// Import utility functions
const utils_1 = require("./lib/utils");
Object.defineProperty(exports, "parseConnectionString", { enumerable: true, get: function () { return utils_1.parseConnectionString; } });
Object.defineProperty(exports, "createConnectionString", { enumerable: true, get: function () { return utils_1.createConnectionString; } });
Object.defineProperty(exports, "sleep", { enumerable: true, get: function () { return utils_1.sleep; } });
Object.defineProperty(exports, "safeJSONParse", { enumerable: true, get: function () { return utils_1.safeJSONParse; } });
Object.defineProperty(exports, "discoverPublicIPs", { enumerable: true, get: function () { return utils_1.discoverPublicIPs; } });
Object.defineProperty(exports, "getLocalIPs", { enumerable: true, get: function () { return utils_1.getLocalIPs; } });
Object.defineProperty(exports, "isPrivateIP", { enumerable: true, get: function () { return utils_1.isPrivateIP; } });
Object.defineProperty(exports, "getRandomPort", { enumerable: true, get: function () { return utils_1.getRandomPort; } });
Object.defineProperty(exports, "bufferToBase64", { enumerable: true, get: function () { return utils_1.bufferToBase64; } });
Object.defineProperty(exports, "base64ToBuffer", { enumerable: true, get: function () { return utils_1.base64ToBuffer; } });
Object.defineProperty(exports, "getRandomArrayValue", { enumerable: true, get: function () { return utils_1.getRandomArrayValue; } });
Object.defineProperty(exports, "shuffleArray", { enumerable: true, get: function () { return utils_1.shuffleArray; } });
Object.defineProperty(exports, "promiseWithTimeout", { enumerable: true, get: function () { return utils_1.promiseWithTimeout; } });
Object.defineProperty(exports, "calculateSHA256", { enumerable: true, get: function () { return utils_1.calculateSHA256; } });
// Import NAT traversal utilities from existing codebase
const upnp_1 = require("./lib/utils/upnp");
Object.defineProperty(exports, "upnpClient", { enumerable: true, get: function () { return upnp_1.upnpClient; } });
Object.defineProperty(exports, "createUPnPMapping", { enumerable: true, get: function () { return upnp_1.createUPnPMapping; } });
Object.defineProperty(exports, "deleteUPnPMapping", { enumerable: true, get: function () { return upnp_1.deleteUPnPMapping; } });
Object.defineProperty(exports, "getExternalAddressUPnP", { enumerable: true, get: function () { return upnp_1.getExternalAddressUPnP; } });
const connection_registry_1 = require("./lib/utils/connection-registry");
Object.defineProperty(exports, "connectionRegistry", { enumerable: true, get: function () { return connection_registry_1.connectionRegistry; } });
const hole_punch_1 = require("./lib/utils/hole-punch");
Object.defineProperty(exports, "performTCPHolePunch", { enumerable: true, get: function () { return hole_punch_1.performTCPHolePunch; } });
Object.defineProperty(exports, "performUDPHolePunch", { enumerable: true, get: function () { return hole_punch_1.performUDPHolePunch; } });
Object.defineProperty(exports, "performTCPSimultaneousOpen", { enumerable: true, get: function () { return hole_punch_1.performTCPSimultaneousOpen; } });
const ice_1 = require("./lib/utils/ice");
Object.defineProperty(exports, "ICEClient", { enumerable: true, get: function () { return ice_1.ICEClient; } });
Object.defineProperty(exports, "connectWithICE", { enumerable: true, get: function () { return ice_1.connectWithICE; } });
Object.defineProperty(exports, "ICECandidateType", { enumerable: true, get: function () { return ice_1.ICECandidateType; } });
const turn_1 = require("./lib/utils/turn");
Object.defineProperty(exports, "TURNClient", { enumerable: true, get: function () { return turn_1.TURNClient; } });
Object.defineProperty(exports, "createTURNAllocation", { enumerable: true, get: function () { return turn_1.createTURNAllocation; } });
const nat_traversal_manager_1 = require("./lib/utils/nat-traversal-manager");
Object.defineProperty(exports, "NATTraversalManager", { enumerable: true, get: function () { return nat_traversal_manager_1.NATTraversalManager; } });
Object.defineProperty(exports, "connectWithNATTraversal", { enumerable: true, get: function () { return nat_traversal_manager_1.connectWithNATTraversal; } });
// Import new peer discovery mechanisms
const dht_1 = require("./lib/utils/dht");
Object.defineProperty(exports, "DHTClient", { enumerable: true, get: function () { return dht_1.DHTClient; } });
const pex_1 = require("./lib/utils/pex");
Object.defineProperty(exports, "PexManager", { enumerable: true, get: function () { return pex_1.PexManager; } });
Object.defineProperty(exports, "PexMessageType", { enumerable: true, get: function () { return pex_1.PexMessageType; } });
const local_discovery_1 = require("./lib/utils/local-discovery");
Object.defineProperty(exports, "LocalDiscovery", { enumerable: true, get: function () { return local_discovery_1.LocalDiscovery; } });
const peer_discovery_manager_1 = require("./lib/utils/peer-discovery-manager");
Object.defineProperty(exports, "PeerDiscoveryManager", { enumerable: true, get: function () { return peer_discovery_manager_1.PeerDiscoveryManager; } });
/**
 * Create a new FileHost instance with default settings
 * @param options - Host configuration options
 * @returns A configured FileHost instance
 */
function createHost(options = {}) {
    return new host_1.default(options);
}
/**
 * Create a new FileClient instance with default settings
 * @param options - Client configuration options
 * @returns A configured FileClient instance
 */
function createClient(options = {}) {
    return new client_1.default(options);
}
/**
 * Create a network manager for multi-peer file transfers
 * @param options - Network manager configuration options
 * @returns A configured NetworkManager instance
 */
function createNetworkManager(options = {}) {
    return new network_manager_1.default(options);
}
/**
 * Helper function to download a file using the network manager
 * @param fileHash - SHA-256 hash of the file to download
 * @param savePath - Path where the file should be saved
 * @param peers - Array of peer connection strings
 * @param options - Download options
 * @returns Promise that resolves when the download is complete
 */
async function downloadFile(fileHash, savePath, peers, options = {}) {
    const networkManager = new network_manager_1.default({
        chunkSize: options.chunkSize,
        concurrency: options.concurrency,
        peerTimeout: options.peerTimeout,
        gunOptions: options.gunOptions,
        stunServers: options.stunServers
    });
    // Create MultiDownloadOptions object
    const downloadOptions = {
        savePath,
        chunkSize: options.chunkSize,
        stunServers: options.stunServers,
        onProgress: options.onProgress,
        onError: options.onError,
        startChunk: options.startChunk,
        onPeerStatus: options.onPeerStatus
    };
    // Call with the new parameter order: peers, fileHash, options
    await networkManager.downloadFile(peers, fileHash, downloadOptions);
}
/**
 * Helper function for establishing NAT traversal connections
 * @param localId - Local peer identifier
 * @param remoteId - Remote peer identifier
 * @param gunInstance - Gun.js instance for signaling
 * @param options - NAT traversal options
 * @returns Promise that resolves with the connection result
 */
async function connectToPeer(localId, remoteId, gunInstance, options = {}) {
    return (0, nat_traversal_manager_1.connectWithNATTraversal)({
        localId,
        remoteId,
        gun: gunInstance,
        ...options
    });
}
/**
 * Helper function to discover peers with specific content
 * @param infoHash - Info hash of the content to find peers for
 * @param announcePort - Port to announce for incoming connections
 * @param options - Peer discovery options
 * @returns Promise resolving to array of discovered peers
 */
async function findPeers(infoHash, announcePort = 0, options = {}) {
    const discoveryManager = new peer_discovery_manager_1.PeerDiscoveryManager({
        announcePort,
        ...options
    });
    await discoveryManager.start(announcePort);
    const peers = await discoveryManager.findPeers(infoHash);
    return peers;
}
// Export connection types
exports.ConnectionTypes = constants_1.CONNECTION_TYPE;
// Default export for the entire library
exports.default = {
    FileHost: host_1.default,
    FileClient: client_1.default,
    NetworkManager: network_manager_1.default,
    createHost,
    createClient,
    createNetworkManager,
    downloadFile,
    connectToPeer,
    findPeers,
    ConnectionTypes: exports.ConnectionTypes,
    // Utilities
    discoverPublicIPs: utils_1.discoverPublicIPs,
    calculateSHA256: utils_1.calculateSHA256,
    // NAT traversal exports
    upnpClient: upnp_1.upnpClient,
    createUPnPMapping: upnp_1.createUPnPMapping,
    deleteUPnPMapping: upnp_1.deleteUPnPMapping,
    getExternalAddressUPnP: upnp_1.getExternalAddressUPnP,
    connectionRegistry: connection_registry_1.connectionRegistry,
    performTCPHolePunch: hole_punch_1.performTCPHolePunch,
    performUDPHolePunch: hole_punch_1.performUDPHolePunch,
    performTCPSimultaneousOpen: hole_punch_1.performTCPSimultaneousOpen,
    connectWithICE: ice_1.connectWithICE,
    ICEClient: ice_1.ICEClient,
    ICECandidateType: ice_1.ICECandidateType,
    TURNClient: turn_1.TURNClient,
    createTURNAllocation: turn_1.createTURNAllocation,
    NATTraversalManager: nat_traversal_manager_1.NATTraversalManager,
    connectWithNATTraversal: nat_traversal_manager_1.connectWithNATTraversal,
    // Peer discovery mechanisms
    DHTClient: dht_1.DHTClient,
    PexManager: pex_1.PexManager,
    PexMessageType: pex_1.PexMessageType,
    LocalDiscovery: local_discovery_1.LocalDiscovery,
    PeerDiscoveryManager: peer_discovery_manager_1.PeerDiscoveryManager
};
//# sourceMappingURL=index.js.map
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
exports.ConnectionTypes = exports.connectWithNATTraversal = exports.NATTraversalManager = exports.connectViaTURN = exports.createTURNAllocation = exports.turnClient = exports.connectWithICE = exports.performTCPSimultaneousOpen = exports.performTCPHolePunch = exports.performUDPHolePunch = exports.connectionRegistry = exports.getExternalAddressUPnP = exports.deleteUPnPMapping = exports.createUPnPMapping = exports.upnpClient = exports.discoverPublicIPs = exports.promiseWithTimeout = exports.shuffleArray = exports.getRandomArrayValue = exports.base64ToBuffer = exports.bufferToBase64 = exports.safeJSONParse = exports.sleep = exports.calculateSHA256 = exports.createConnectionString = exports.parseConnectionString = exports.getRandomPort = exports.isPrivateIP = exports.getLocalIPs = exports.NetworkManager = exports.FileClient = exports.FileHost = void 0;
exports.createHost = createHost;
exports.createClient = createClient;
exports.createNetworkManager = createNetworkManager;
exports.downloadFile = downloadFile;
exports.connectToPeer = connectToPeer;
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
const utils_1 = require("./lib/utils");
// Import NAT traversal utilities
const upnp_1 = require("./lib/utils/upnp");
Object.defineProperty(exports, "upnpClient", { enumerable: true, get: function () { return upnp_1.upnpClient; } });
Object.defineProperty(exports, "createUPnPMapping", { enumerable: true, get: function () { return upnp_1.createUPnPMapping; } });
Object.defineProperty(exports, "deleteUPnPMapping", { enumerable: true, get: function () { return upnp_1.deleteUPnPMapping; } });
Object.defineProperty(exports, "getExternalAddressUPnP", { enumerable: true, get: function () { return upnp_1.getExternalAddressUPnP; } });
const connection_registry_1 = require("./lib/utils/connection-registry");
Object.defineProperty(exports, "connectionRegistry", { enumerable: true, get: function () { return connection_registry_1.connectionRegistry; } });
const hole_punch_1 = require("./lib/utils/hole-punch");
Object.defineProperty(exports, "performUDPHolePunch", { enumerable: true, get: function () { return hole_punch_1.performUDPHolePunch; } });
Object.defineProperty(exports, "performTCPHolePunch", { enumerable: true, get: function () { return hole_punch_1.performTCPHolePunch; } });
Object.defineProperty(exports, "performTCPSimultaneousOpen", { enumerable: true, get: function () { return hole_punch_1.performTCPSimultaneousOpen; } });
const ice_1 = require("./lib/utils/ice");
Object.defineProperty(exports, "connectWithICE", { enumerable: true, get: function () { return ice_1.connectWithICE; } });
const turn_1 = require("./lib/utils/turn");
Object.defineProperty(exports, "turnClient", { enumerable: true, get: function () { return turn_1.turnClient; } });
Object.defineProperty(exports, "createTURNAllocation", { enumerable: true, get: function () { return turn_1.createTURNAllocation; } });
Object.defineProperty(exports, "connectViaTURN", { enumerable: true, get: function () { return turn_1.connectViaTURN; } });
const nat_traversal_manager_1 = require("./lib/utils/nat-traversal-manager");
Object.defineProperty(exports, "connectWithNATTraversal", { enumerable: true, get: function () { return nat_traversal_manager_1.connectWithNATTraversal; } });
Object.defineProperty(exports, "NATTraversalManager", { enumerable: true, get: function () { return nat_traversal_manager_1.NATTraversalManager; } });
// Export utility functions
var utils_2 = require("./lib/utils");
Object.defineProperty(exports, "getLocalIPs", { enumerable: true, get: function () { return utils_2.getLocalIPs; } });
Object.defineProperty(exports, "isPrivateIP", { enumerable: true, get: function () { return utils_2.isPrivateIP; } });
Object.defineProperty(exports, "getRandomPort", { enumerable: true, get: function () { return utils_2.getRandomPort; } });
Object.defineProperty(exports, "parseConnectionString", { enumerable: true, get: function () { return utils_2.parseConnectionString; } });
Object.defineProperty(exports, "createConnectionString", { enumerable: true, get: function () { return utils_2.createConnectionString; } });
Object.defineProperty(exports, "calculateSHA256", { enumerable: true, get: function () { return utils_2.calculateSHA256; } });
Object.defineProperty(exports, "sleep", { enumerable: true, get: function () { return utils_2.sleep; } });
Object.defineProperty(exports, "safeJSONParse", { enumerable: true, get: function () { return utils_2.safeJSONParse; } });
Object.defineProperty(exports, "bufferToBase64", { enumerable: true, get: function () { return utils_2.bufferToBase64; } });
Object.defineProperty(exports, "base64ToBuffer", { enumerable: true, get: function () { return utils_2.base64ToBuffer; } });
Object.defineProperty(exports, "getRandomArrayValue", { enumerable: true, get: function () { return utils_2.getRandomArrayValue; } });
Object.defineProperty(exports, "shuffleArray", { enumerable: true, get: function () { return utils_2.shuffleArray; } });
Object.defineProperty(exports, "promiseWithTimeout", { enumerable: true, get: function () { return utils_2.promiseWithTimeout; } });
Object.defineProperty(exports, "discoverPublicIPs", { enumerable: true, get: function () { return utils_2.discoverPublicIPs; } });
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
        onProgress: options.progressCallback,
        onError: options.errorCallback,
        startChunk: options.startChunk,
        onPeerStatus: options.peerStatusCallback
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
    ConnectionTypes: exports.ConnectionTypes,
    discoverPublicIPs: utils_1.discoverPublicIPs,
    // NAT traversal exports
    upnpClient: upnp_1.upnpClient,
    createUPnPMapping: upnp_1.createUPnPMapping,
    deleteUPnPMapping: upnp_1.deleteUPnPMapping,
    getExternalAddressUPnP: upnp_1.getExternalAddressUPnP,
    connectionRegistry: connection_registry_1.connectionRegistry,
    performUDPHolePunch: hole_punch_1.performUDPHolePunch,
    performTCPHolePunch: hole_punch_1.performTCPHolePunch,
    performTCPSimultaneousOpen: hole_punch_1.performTCPSimultaneousOpen,
    connectWithICE: ice_1.connectWithICE,
    turnClient: turn_1.turnClient,
    createTURNAllocation: turn_1.createTURNAllocation,
    connectViaTURN: turn_1.connectViaTURN,
    NATTraversalManager: nat_traversal_manager_1.NATTraversalManager,
    connectWithNATTraversal: nat_traversal_manager_1.connectWithNATTraversal
};
//# sourceMappingURL=index.js.map
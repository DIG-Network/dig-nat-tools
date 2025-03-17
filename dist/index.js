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
exports.ConnectionTypes = exports.promiseWithTimeout = exports.shuffleArray = exports.getRandomArrayValue = exports.base64ToBuffer = exports.bufferToBase64 = exports.safeJSONParse = exports.sleep = exports.calculateSHA256 = exports.createConnectionString = exports.parseConnectionString = exports.getRandomPort = exports.isPrivateIP = exports.getLocalIPs = exports.NetworkManager = exports.FileClient = exports.FileHost = void 0;
exports.createHost = createHost;
exports.createClient = createClient;
exports.createNetworkManager = createNetworkManager;
exports.downloadFile = downloadFile;
// Export types
__exportStar(require("./types/constants"), exports);
// Export main classes
const host_1 = __importDefault(require("./lib/host"));
exports.FileHost = host_1.default;
const client_1 = __importDefault(require("./lib/client"));
exports.FileClient = client_1.default;
const network_manager_1 = __importDefault(require("./lib/network-manager"));
exports.NetworkManager = network_manager_1.default;
// Export utility functions
var utils_1 = require("./lib/utils");
Object.defineProperty(exports, "getLocalIPs", { enumerable: true, get: function () { return utils_1.getLocalIPs; } });
Object.defineProperty(exports, "isPrivateIP", { enumerable: true, get: function () { return utils_1.isPrivateIP; } });
Object.defineProperty(exports, "getRandomPort", { enumerable: true, get: function () { return utils_1.getRandomPort; } });
Object.defineProperty(exports, "parseConnectionString", { enumerable: true, get: function () { return utils_1.parseConnectionString; } });
Object.defineProperty(exports, "createConnectionString", { enumerable: true, get: function () { return utils_1.createConnectionString; } });
Object.defineProperty(exports, "calculateSHA256", { enumerable: true, get: function () { return utils_1.calculateSHA256; } });
Object.defineProperty(exports, "sleep", { enumerable: true, get: function () { return utils_1.sleep; } });
Object.defineProperty(exports, "safeJSONParse", { enumerable: true, get: function () { return utils_1.safeJSONParse; } });
Object.defineProperty(exports, "bufferToBase64", { enumerable: true, get: function () { return utils_1.bufferToBase64; } });
Object.defineProperty(exports, "base64ToBuffer", { enumerable: true, get: function () { return utils_1.base64ToBuffer; } });
Object.defineProperty(exports, "getRandomArrayValue", { enumerable: true, get: function () { return utils_1.getRandomArrayValue; } });
Object.defineProperty(exports, "shuffleArray", { enumerable: true, get: function () { return utils_1.shuffleArray; } });
Object.defineProperty(exports, "promiseWithTimeout", { enumerable: true, get: function () { return utils_1.promiseWithTimeout; } });
// Import connection types
const constants_1 = require("./types/constants");
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
    ConnectionTypes: exports.ConnectionTypes
};
//# sourceMappingURL=index.js.map
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
exports.signData = exports.createCryptoIdentity = exports.CryptoIdentity = exports.ConnectionTypes = exports.NODE_TYPE = exports.AnnouncePriority = exports.PeerDiscoveryManager = exports.GunDiscovery = exports.LocalDiscovery = exports.PexMessageType = exports.PexManager = exports.DHTClient = exports.NATTraversalManager = exports.natTraversalManager = exports.createTURNAllocation = exports.turnClient = exports.ICECandidateType = exports.performICE = exports.performTCPSimultaneousOpen = exports.performUDPHolePunch = exports.performTCPHolePunch = exports.connectionRegistry = exports.getExternalAddressUPnP = exports.deleteUPnPMapping = exports.createUPnPMapping = exports.upnpClient = exports.promiseWithTimeout = exports.shuffleArray = exports.getRandomArrayValue = exports.base64ToBuffer = exports.bufferToBase64 = exports.getRandomPort = exports.isPrivateIP = exports.getLocalIPs = exports.calculateSHA256 = exports.discoverPublicIPs = exports.safeJSONParse = exports.sleep = exports.createConnectionString = exports.parseConnectionString = exports.CONNECTION_TYPE = exports.NetworkManager = exports.FileClient = exports.FileHost = exports.createDiscoveryContentIntegration = exports.DiscoveryContentIntegration = exports.REANNOUNCE_INTERVAL = exports.DEFAULT_CONTENT_TTL = exports.createContentAvailabilityManager = exports.ContentAvailabilityManager = void 0;
exports.AuthenticatedVerificationResult = exports.createAuthenticatedContentAvailabilityManager = exports.AuthenticatedContentAvailabilityManager = exports.createAuthenticatedFileHost = exports.AuthenticatedFileHost = exports.decryptAES = exports.encryptAES = exports.generateRandomString = exports.generateRandomBuffer = exports.verifySignedData = void 0;
exports.createHost = createHost;
exports.createClient = createClient;
exports.createNetworkManager = createNetworkManager;
exports.downloadFile = downloadFile;
exports.connectToPeer = connectToPeer;
exports.findPeers = findPeers;
exports.announceFile = announceFile;
exports.addManualPeer = addManualPeer;
// Import Debug for logging
const debug_1 = __importDefault(require("debug"));
const debug = (0, debug_1.default)('dig-nat-tools:index');
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
// Import NAT traversal utilities from connection module
const upnp_1 = require("./lib/connection/traversal/upnp");
Object.defineProperty(exports, "upnpClient", { enumerable: true, get: function () { return upnp_1.upnpClient; } });
Object.defineProperty(exports, "createUPnPMapping", { enumerable: true, get: function () { return upnp_1.createUPnPMapping; } });
Object.defineProperty(exports, "deleteUPnPMapping", { enumerable: true, get: function () { return upnp_1.deleteUPnPMapping; } });
Object.defineProperty(exports, "getExternalAddressUPnP", { enumerable: true, get: function () { return upnp_1.getExternalAddressUPnP; } });
const connection_registry_1 = require("./lib/connection/registry/connection-registry");
Object.defineProperty(exports, "connectionRegistry", { enumerable: true, get: function () { return connection_registry_1.connectionRegistry; } });
const hole_punch_1 = require("./lib/connection/traversal/hole-punch");
Object.defineProperty(exports, "performTCPHolePunch", { enumerable: true, get: function () { return hole_punch_1.performTCPHolePunch; } });
Object.defineProperty(exports, "performUDPHolePunch", { enumerable: true, get: function () { return hole_punch_1.performUDPHolePunch; } });
Object.defineProperty(exports, "performTCPSimultaneousOpen", { enumerable: true, get: function () { return hole_punch_1.performTCPSimultaneousOpen; } });
const ice_1 = require("./lib/connection/traversal/ice");
Object.defineProperty(exports, "performICE", { enumerable: true, get: function () { return ice_1.performICE; } });
Object.defineProperty(exports, "ICECandidateType", { enumerable: true, get: function () { return ice_1.ICECandidateType; } });
const turn_1 = require("./lib/connection/traversal/turn");
Object.defineProperty(exports, "turnClient", { enumerable: true, get: function () { return turn_1.turnClient; } });
Object.defineProperty(exports, "createTURNAllocation", { enumerable: true, get: function () { return turn_1.createTURNAllocation; } });
const nat_traversal_manager_1 = require("./lib/connection/traversal/nat-traversal-manager");
Object.defineProperty(exports, "natTraversalManager", { enumerable: true, get: function () { return nat_traversal_manager_1.natTraversalManager; } });
Object.defineProperty(exports, "NATTraversalManager", { enumerable: true, get: function () { return nat_traversal_manager_1.NATTraversalManager; } });
// Import new peer discovery mechanisms
const dht_1 = require("./lib/utils/dht");
Object.defineProperty(exports, "DHTClient", { enumerable: true, get: function () { return dht_1.DHTClient; } });
const pex_1 = require("./lib/utils/pex");
Object.defineProperty(exports, "PexManager", { enumerable: true, get: function () { return pex_1.PexManager; } });
Object.defineProperty(exports, "PexMessageType", { enumerable: true, get: function () { return pex_1.PexMessageType; } });
const local_discovery_1 = require("./lib/utils/local-discovery");
Object.defineProperty(exports, "LocalDiscovery", { enumerable: true, get: function () { return local_discovery_1.LocalDiscovery; } });
const gun_discovery_1 = require("./lib/utils/gun-discovery");
Object.defineProperty(exports, "GunDiscovery", { enumerable: true, get: function () { return gun_discovery_1.GunDiscovery; } });
const peer_discovery_manager_1 = require("./lib/utils/peer-discovery-manager");
Object.defineProperty(exports, "PeerDiscoveryManager", { enumerable: true, get: function () { return peer_discovery_manager_1.PeerDiscoveryManager; } });
Object.defineProperty(exports, "AnnouncePriority", { enumerable: true, get: function () { return peer_discovery_manager_1.AnnouncePriority; } });
const constants_2 = require("./types/constants");
Object.defineProperty(exports, "NODE_TYPE", { enumerable: true, get: function () { return constants_2.NODE_TYPE; } });
// Import and export the content availability management system
const content_availability_manager_1 = require("./lib/utils/content-availability-manager");
Object.defineProperty(exports, "ContentAvailabilityManager", { enumerable: true, get: function () { return content_availability_manager_1.ContentAvailabilityManager; } });
Object.defineProperty(exports, "createContentAvailabilityManager", { enumerable: true, get: function () { return content_availability_manager_1.createContentAvailabilityManager; } });
Object.defineProperty(exports, "DEFAULT_CONTENT_TTL", { enumerable: true, get: function () { return content_availability_manager_1.DEFAULT_CONTENT_TTL; } });
Object.defineProperty(exports, "REANNOUNCE_INTERVAL", { enumerable: true, get: function () { return content_availability_manager_1.REANNOUNCE_INTERVAL; } });
const discovery_content_integration_1 = require("./lib/utils/discovery-content-integration");
Object.defineProperty(exports, "DiscoveryContentIntegration", { enumerable: true, get: function () { return discovery_content_integration_1.DiscoveryContentIntegration; } });
Object.defineProperty(exports, "createDiscoveryContentIntegration", { enumerable: true, get: function () { return discovery_content_integration_1.createDiscoveryContentIntegration; } });
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
 * @param contentId - Content identifier for the file (used for peer discovery)
 * @param fileHash - SHA-256 hash of the file (used for verification)
 * @param savePath - Path where the file should be saved
 * @param peers - Array of peer connection strings
 * @param options - Download options
 * @returns Promise that resolves when the download is complete
 */
async function downloadFile(contentId, fileHash, savePath, peers, options = {}) {
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
        onPeerStatus: options.onPeerStatus,
        verificationHash: fileHash // Use fileHash for verification
    };
    // Call with contentId for looking up content and fileHash for verification
    await networkManager.downloadFile(peers, contentId, downloadOptions);
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
    return connectWithNATTraversal({
        localId,
        remoteId,
        gun: gunInstance,
        ...options
    });
}
/**
 * Helper function to discover peers with specific content
 * @param infoHash - Info hash of the content to find peers for (can be either contentId or fileHash)
 * @param announcePort - Port to announce for incoming connections
 * @param options - Peer discovery options
 * @returns Promise resolving to array of discovered peers
 */
async function findPeers(infoHash, announcePort = 0, options = {}) {
    const discoveryManager = new peer_discovery_manager_1.PeerDiscoveryManager({
        announcePort,
        enableIPv6: options.enableIPv6 !== undefined ? options.enableIPv6 : false,
        ...options
    });
    await discoveryManager.start(announcePort);
    const peers = await discoveryManager.findPeers(infoHash);
    return peers;
}
/**
 * Announce that you have a file available for sharing
 * This makes the file discoverable by other peers via DHT, PEX, and local discovery
 *
 * @param contentId - Content identifier for the file
 * @param fileHash - SHA-256 hash of the file for verification
 * @param port - Port to listen for incoming connections
 * @param options - Configuration options for discovery
 * @returns Promise resolving to the discovery manager
 */
async function announceFile(contentId, fileHash, port, options = {}) {
    // Create a peer discovery manager with the provided options
    const manager = new peer_discovery_manager_1.PeerDiscoveryManager({
        nodeType: options.nodeType || constants_2.NODE_TYPE.STANDARD,
        enableDHT: options.enableDHT !== undefined ? options.enableDHT : true,
        enableLocal: options.enableLocal !== undefined ? options.enableLocal : true,
        enablePEX: options.enablePEX !== undefined ? options.enablePEX : true,
        enableIPv6: options.enableIPv6 !== undefined ? options.enableIPv6 : false,
        enablePersistence: options.enablePersistence,
        persistenceDir: options.persistenceDir,
        announcePort: port
    });
    // Start the discovery mechanisms
    await manager.start(port);
    // Announce the content ID (we'll use this for discovery)
    const priority = options.priority || peer_discovery_manager_1.AnnouncePriority.HIGH;
    await manager.addInfoHash(contentId, priority);
    // Always store the mapping between contentId and fileHash
    manager.addContentMapping(contentId, fileHash);
    debug(`Announced file with content ID ${contentId} and hash ${fileHash} on port ${port}`);
    return manager;
}
/**
 * Manually add a peer to the discovery system
 * Use this when you know the exact peer details and don't want to rely on automatic discovery
 *
 * @param peerId - Unique identifier of the peer
 * @param address - IP address of the peer
 * @param port - Port the peer is listening on
 * @param options - Additional options like info hash association
 * @returns The discovery manager with the added peer
 */
async function addManualPeer(peerId, address, port, options = {}) {
    // Create a peer discovery manager with the provided options
    const manager = new peer_discovery_manager_1.PeerDiscoveryManager({
        enableDHT: options.enableDHT !== undefined ? options.enableDHT : false,
        enableLocal: options.enableLocal !== undefined ? options.enableLocal : false,
        enablePEX: options.enablePEX !== undefined ? options.enablePEX : false,
        enableIPv6: options.enableIPv6 !== undefined ? options.enableIPv6 : false,
        announcePort: port
    });
    // Start the discovery mechanisms
    await manager.start();
    // Add the manual peer
    manager.addManualPeer(peerId, address, port, options.infoHash);
    return manager;
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
    announceFile,
    addManualPeer,
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
    performICE: ice_1.performICE,
    ICECandidateType: ice_1.ICECandidateType,
    turnClient: turn_1.turnClient,
    createTURNAllocation: turn_1.createTURNAllocation,
    natTraversalManager: nat_traversal_manager_1.natTraversalManager,
    NATTraversalManager: nat_traversal_manager_1.NATTraversalManager,
    NATTraversalOptions: nat_traversal_manager_1.NATTraversalOptions,
    NATTraversalResult: nat_traversal_manager_1.NATTraversalResult,
    // Peer discovery mechanisms
    DHTClient: dht_1.DHTClient,
    PexManager: pex_1.PexManager,
    PexMessageType: pex_1.PexMessageType,
    LocalDiscovery: local_discovery_1.LocalDiscovery,
    GunDiscovery: gun_discovery_1.GunDiscovery,
    PeerDiscoveryManager: peer_discovery_manager_1.PeerDiscoveryManager,
    AnnouncePriority: peer_discovery_manager_1.AnnouncePriority,
    NODE_TYPE: constants_2.NODE_TYPE,
    // Content Availability Management System
    ContentAvailabilityManager: content_availability_manager_1.ContentAvailabilityManager,
    createContentAvailabilityManager: content_availability_manager_1.createContentAvailabilityManager,
    PeerContentStatus,
    ReportLevel,
    DEFAULT_CONTENT_TTL: content_availability_manager_1.DEFAULT_CONTENT_TTL,
    REANNOUNCE_INTERVAL: content_availability_manager_1.REANNOUNCE_INTERVAL,
    // Discovery Content Integration
    DiscoveryContentIntegration: discovery_content_integration_1.DiscoveryContentIntegration,
    createDiscoveryContentIntegration: discovery_content_integration_1.createDiscoveryContentIntegration,
    VerificationResult: discovery_content_integration_3.VerificationResult
};
// Export content availability management system
// Note: Only exporting the factory functions to avoid type issues
var content_availability_manager_2 = require("./lib/utils/content-availability-manager");
Object.defineProperty(exports, "createContentAvailabilityManager", { enumerable: true, get: function () { return content_availability_manager_2.createContentAvailabilityManager; } });
var discovery_content_integration_2 = require("./lib/utils/discovery-content-integration");
Object.defineProperty(exports, "createDiscoveryContentIntegration", { enumerable: true, get: function () { return discovery_content_integration_2.createDiscoveryContentIntegration; } });
// Export Cryptographic Identity from the crypto module
var identity_1 = require("./lib/crypto/identity");
Object.defineProperty(exports, "CryptoIdentity", { enumerable: true, get: function () { return identity_1.CryptoIdentity; } });
Object.defineProperty(exports, "createCryptoIdentity", { enumerable: true, get: function () { return identity_1.createCryptoIdentity; } });
Object.defineProperty(exports, "signData", { enumerable: true, get: function () { return identity_1.signData; } });
Object.defineProperty(exports, "verifySignedData", { enumerable: true, get: function () { return identity_1.verifySignedData; } });
// Export core crypto utilities
var utils_2 = require("./lib/crypto/utils");
Object.defineProperty(exports, "calculateSHA256", { enumerable: true, get: function () { return utils_2.calculateSHA256; } });
Object.defineProperty(exports, "bufferToBase64", { enumerable: true, get: function () { return utils_2.bufferToBase64; } });
Object.defineProperty(exports, "base64ToBuffer", { enumerable: true, get: function () { return utils_2.base64ToBuffer; } });
Object.defineProperty(exports, "generateRandomBuffer", { enumerable: true, get: function () { return utils_2.generateRandomBuffer; } });
Object.defineProperty(exports, "generateRandomString", { enumerable: true, get: function () { return utils_2.generateRandomString; } });
Object.defineProperty(exports, "encryptAES", { enumerable: true, get: function () { return utils_2.encryptAES; } });
Object.defineProperty(exports, "decryptAES", { enumerable: true, get: function () { return utils_2.decryptAES; } });
// Export Authenticated File Host
var authenticated_file_host_1 = require("./lib/application/authenticated-file-host");
Object.defineProperty(exports, "AuthenticatedFileHost", { enumerable: true, get: function () { return authenticated_file_host_1.AuthenticatedFileHost; } });
Object.defineProperty(exports, "createAuthenticatedFileHost", { enumerable: true, get: function () { return authenticated_file_host_1.createAuthenticatedFileHost; } });
// Export Authenticated Content Availability Manager
var authenticated_content_availability_manager_1 = require("./lib/application/authenticated-content-availability-manager");
Object.defineProperty(exports, "AuthenticatedContentAvailabilityManager", { enumerable: true, get: function () { return authenticated_content_availability_manager_1.AuthenticatedContentAvailabilityManager; } });
Object.defineProperty(exports, "createAuthenticatedContentAvailabilityManager", { enumerable: true, get: function () { return authenticated_content_availability_manager_1.createAuthenticatedContentAvailabilityManager; } });
// Export the enum from authenticated manager separately to avoid conflicts
var authenticated_content_availability_manager_2 = require("./lib/application/authenticated-content-availability-manager");
Object.defineProperty(exports, "AuthenticatedVerificationResult", { enumerable: true, get: function () { return authenticated_content_availability_manager_2.VerificationResult; } });
//# sourceMappingURL=index.js.map
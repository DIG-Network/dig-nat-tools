/**
 * Entry point for the Dig NAT Tools library
 * Provides tools for NAT traversal and P2P file sharing
 */
export * from './types/constants';
import FileHost from './lib/host';
import FileClient from './lib/client';
import NetworkManager from './lib/network-manager';
import { CONNECTION_TYPE } from './types/constants';
import { HostOptions, ClientOptions, NetworkManagerOptions, DownloadOptions, MultiDownloadOptions, DownloadResult, PeerStats, GunOptions } from './lib/types';
import { parseConnectionString, createConnectionString, sleep, safeJSONParse, discoverPublicIPs, getLocalIPs, isPrivateIP, getRandomPort, bufferToBase64, base64ToBuffer, getRandomArrayValue, shuffleArray, promiseWithTimeout, calculateSHA256 } from './lib/utils';
import { upnpClient, createUPnPMapping, deleteUPnPMapping, getExternalAddressUPnP } from './lib/connection/traversal/upnp';
import { connectionRegistry } from './lib/connection/registry/connection-registry';
import { performTCPHolePunch, performUDPHolePunch, performTCPSimultaneousOpen } from './lib/connection/traversal/hole-punch';
import { performICE, ICECandidate, ICECandidateType } from './lib/connection/traversal/ice';
import { turnClient, createTURNAllocation } from './lib/connection/traversal/turn';
import { natTraversalManager, NATTraversalManager, NATTraversalOptions, NATTraversalResult } from './lib/connection/traversal/nat-traversal-manager';
import { DHTClient } from './lib/utils/dht';
import { PexManager, PexMessageType } from './lib/utils/pex';
import { LocalDiscovery } from './lib/utils/local-discovery';
import { GunDiscovery } from './lib/utils/gun-discovery';
import { PeerDiscoveryManager, PeerDiscoveryOptions, AnnouncePriority } from './lib/utils/peer-discovery-manager';
import { NODE_TYPE } from './types/constants';
import type { PexPeer } from './lib/utils/pex';
import type { LocalPeer } from './lib/utils/local-discovery';
import type { DiscoveredPeer } from './lib/utils/peer-discovery-manager';
import type { GunDiscoveryOptions } from './lib/utils/gun-discovery';
import { ContentAvailabilityManager, createContentAvailabilityManager, DEFAULT_CONTENT_TTL, REANNOUNCE_INTERVAL } from './lib/utils/content-availability-manager';
import { DiscoveryContentIntegration, createDiscoveryContentIntegration } from './lib/utils/discovery-content-integration';
import type { PeerContentStatus, ReportLevel } from './lib/utils/content-availability-manager';
import type { VerificationResult } from './lib/utils/discovery-content-integration';
export { ContentAvailabilityManager, createContentAvailabilityManager, DEFAULT_CONTENT_TTL, REANNOUNCE_INTERVAL, DiscoveryContentIntegration, createDiscoveryContentIntegration };
export type { PeerContentStatus, ReportLevel, VerificationResult };
export { FileHost, FileClient, NetworkManager, HostOptions, ClientOptions, NetworkManagerOptions, DownloadOptions, MultiDownloadOptions, DownloadResult, PeerStats, GunOptions, CONNECTION_TYPE, parseConnectionString, createConnectionString, sleep, safeJSONParse, discoverPublicIPs, calculateSHA256, getLocalIPs, isPrivateIP, getRandomPort, bufferToBase64, base64ToBuffer, getRandomArrayValue, shuffleArray, promiseWithTimeout, upnpClient, createUPnPMapping, deleteUPnPMapping, getExternalAddressUPnP, connectionRegistry, performTCPHolePunch, performUDPHolePunch, performTCPSimultaneousOpen, performICE, ICECandidateType, turnClient, createTURNAllocation, natTraversalManager, NATTraversalManager, NATTraversalOptions, NATTraversalResult, DHTClient, PexManager, PexMessageType, LocalDiscovery, GunDiscovery, PeerDiscoveryManager, AnnouncePriority, NODE_TYPE };
export type { PexPeer, LocalPeer, DiscoveredPeer, ICECandidate, GunDiscoveryOptions, PeerDiscoveryOptions };
/**
 * Create a new FileHost instance with default settings
 * @param options - Host configuration options
 * @returns A configured FileHost instance
 */
export declare function createHost(options?: HostOptions): FileHost;
/**
 * Create a new FileClient instance with default settings
 * @param options - Client configuration options
 * @returns A configured FileClient instance
 */
export declare function createClient(options?: ClientOptions): FileClient;
/**
 * Create a network manager for multi-peer file transfers
 * @param options - Network manager configuration options
 * @returns A configured NetworkManager instance
 */
export declare function createNetworkManager(options?: NetworkManagerOptions): NetworkManager;
/**
 * Helper function to download a file using the network manager
 * @param contentId - Content identifier for the file (used for peer discovery)
 * @param fileHash - SHA-256 hash of the file (used for verification)
 * @param savePath - Path where the file should be saved
 * @param peers - Array of peer connection strings
 * @param options - Download options
 * @returns Promise that resolves when the download is complete
 */
export declare function downloadFile(contentId: string, fileHash: string, savePath: string, peers: string[], options?: Partial<NetworkManagerOptions & MultiDownloadOptions>): Promise<void>;
/**
 * Helper function for establishing NAT traversal connections
 * @param localId - Local peer identifier
 * @param remoteId - Remote peer identifier
 * @param gunInstance - Gun.js instance for signaling
 * @param options - NAT traversal options
 * @returns Promise that resolves with the connection result
 */
export declare function connectToPeer(localId: string, remoteId: string, gunInstance: any, options?: any): Promise<any>;
/**
 * Helper function to discover peers with specific content
 * @param infoHash - Info hash of the content to find peers for (can be either contentId or fileHash)
 * @param announcePort - Port to announce for incoming connections
 * @param options - Peer discovery options
 * @returns Promise resolving to array of discovered peers
 */
export declare function findPeers(infoHash: string, announcePort?: number, options?: Partial<PeerDiscoveryOptions>): Promise<DiscoveredPeer[]>;
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
export declare function announceFile(contentId: string, fileHash: string, port: number, options?: {
    nodeType?: NODE_TYPE;
    enableDHT?: boolean;
    enableLocal?: boolean;
    enablePEX?: boolean;
    enableIPv6?: boolean;
    enablePersistence?: boolean;
    persistenceDir?: string;
    priority?: AnnouncePriority;
}): Promise<PeerDiscoveryManager>;
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
export declare function addManualPeer(peerId: string, address: string, port: number, options?: {
    infoHash?: string;
    enableDHT?: boolean;
    enablePEX?: boolean;
    enableLocal?: boolean;
    enableIPv6?: boolean;
}): Promise<PeerDiscoveryManager>;
export declare const ConnectionTypes: typeof CONNECTION_TYPE;
declare const _default: {
    FileHost: typeof FileHost;
    FileClient: typeof FileClient;
    NetworkManager: typeof NetworkManager;
    createHost: typeof createHost;
    createClient: typeof createClient;
    createNetworkManager: typeof createNetworkManager;
    downloadFile: typeof downloadFile;
    connectToPeer: typeof connectToPeer;
    findPeers: typeof findPeers;
    announceFile: typeof announceFile;
    addManualPeer: typeof addManualPeer;
    ConnectionTypes: typeof CONNECTION_TYPE;
    discoverPublicIPs: typeof discoverPublicIPs;
    calculateSHA256: typeof calculateSHA256;
    upnpClient: import("./lib/connection/traversal/upnp").UPnPClient;
    createUPnPMapping: typeof createUPnPMapping;
    deleteUPnPMapping: typeof deleteUPnPMapping;
    getExternalAddressUPnP: typeof getExternalAddressUPnP;
    connectionRegistry: import("./lib/connection/registry/connection-registry").ConnectionRegistry;
    performTCPHolePunch: typeof performTCPHolePunch;
    performUDPHolePunch: typeof performUDPHolePunch;
    performTCPSimultaneousOpen: typeof performTCPSimultaneousOpen;
    performICE: typeof performICE;
    ICECandidateType: typeof ICECandidateType;
    turnClient: import("./lib/connection/traversal/turn").TURNClient;
    createTURNAllocation: typeof createTURNAllocation;
    natTraversalManager: NATTraversalManager;
    NATTraversalManager: typeof NATTraversalManager;
    NATTraversalOptions: any;
    NATTraversalResult: any;
    DHTClient: typeof DHTClient;
    PexManager: typeof PexManager;
    PexMessageType: typeof PexMessageType;
    LocalDiscovery: typeof LocalDiscovery;
    GunDiscovery: typeof GunDiscovery;
    PeerDiscoveryManager: typeof PeerDiscoveryManager;
    AnnouncePriority: typeof AnnouncePriority;
    NODE_TYPE: typeof NODE_TYPE;
    ContentAvailabilityManager: typeof ContentAvailabilityManager;
    createContentAvailabilityManager: typeof createContentAvailabilityManager;
    PeerContentStatus: typeof PeerContentStatus;
    ReportLevel: typeof ReportLevel;
    DEFAULT_CONTENT_TTL: number;
    REANNOUNCE_INTERVAL: number;
    DiscoveryContentIntegration: typeof DiscoveryContentIntegration;
    createDiscoveryContentIntegration: typeof createDiscoveryContentIntegration;
    VerificationResult: any;
};
export default _default;
export { createContentAvailabilityManager } from './lib/utils/content-availability-manager';
export { createDiscoveryContentIntegration } from './lib/utils/discovery-content-integration';
export type { ContentAvailabilityOptions, PeerContentStatus, ReportLevel } from './lib/utils/content-availability-manager';
export type { DiscoveryContentIntegrationOptions, VerificationResult } from './lib/utils/discovery-content-integration';
export { CryptoIdentity, createCryptoIdentity, SignatureAlgorithm, SignedData, signData, verifySignedData } from './lib/crypto/identity';
export { calculateSHA256, bufferToBase64, base64ToBuffer, generateRandomBuffer, generateRandomString, encryptAES, decryptAES } from './lib/crypto/utils';
export { AuthenticatedFileHost, createAuthenticatedFileHost, AuthenticatedFileHostOptions, AuthenticatedFileInfo, ConnectionChallenge, ConnectionResponse } from './lib/application/authenticated-file-host';
export { AuthenticatedContentAvailabilityManager, createAuthenticatedContentAvailabilityManager, AuthenticatedContentAvailabilityOptions, ContentAnnouncement, SignedContentAnnouncement, ContentReport, SignedContentReport, } from './lib/application/authenticated-content-availability-manager';
export { VerificationResult as AuthenticatedVerificationResult } from './lib/application/authenticated-content-availability-manager';

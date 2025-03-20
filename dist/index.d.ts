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
import { upnpClient, createUPnPMapping, deleteUPnPMapping, getExternalAddressUPnP } from './lib/utils/upnp';
import { connectionRegistry } from './lib/utils/connection-registry';
import { performTCPHolePunch, performUDPHolePunch, performTCPSimultaneousOpen } from './lib/utils/hole-punch';
import { ICEClient, ICECandidate, connectWithICE, ICECandidateType } from './lib/utils/ice';
import { TURNClient, createTURNAllocation } from './lib/utils/turn';
import { NATTraversalManager, connectWithNATTraversal } from './lib/utils/nat-traversal-manager';
import { DHTClient } from './lib/utils/dht';
import { PexManager, PexMessageType } from './lib/utils/pex';
import { LocalDiscovery } from './lib/utils/local-discovery';
import { PeerDiscoveryManager, PeerDiscoveryOptions } from './lib/utils/peer-discovery-manager';
import type { PexPeer } from './lib/utils/pex';
import type { LocalPeer } from './lib/utils/local-discovery';
import type { DiscoveredPeer } from './lib/utils/peer-discovery-manager';
export { FileHost, FileClient, NetworkManager, HostOptions, ClientOptions, NetworkManagerOptions, DownloadOptions, MultiDownloadOptions, DownloadResult, PeerStats, GunOptions, CONNECTION_TYPE, parseConnectionString, createConnectionString, sleep, safeJSONParse, discoverPublicIPs, calculateSHA256, getLocalIPs, isPrivateIP, getRandomPort, bufferToBase64, base64ToBuffer, getRandomArrayValue, shuffleArray, promiseWithTimeout, upnpClient, createUPnPMapping, deleteUPnPMapping, getExternalAddressUPnP, connectionRegistry, performTCPHolePunch, performUDPHolePunch, performTCPSimultaneousOpen, connectWithICE, ICEClient, ICECandidateType, TURNClient, createTURNAllocation, NATTraversalManager, connectWithNATTraversal, DHTClient, PexManager, PexMessageType, LocalDiscovery, PeerDiscoveryManager };
export type { PexPeer, LocalPeer, DiscoveredPeer, ICECandidate };
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
 * @param fileHash - SHA-256 hash of the file to download
 * @param savePath - Path where the file should be saved
 * @param peers - Array of peer connection strings
 * @param options - Download options
 * @returns Promise that resolves when the download is complete
 */
export declare function downloadFile(fileHash: string, savePath: string, peers: string[], options?: Partial<NetworkManagerOptions & MultiDownloadOptions>): Promise<void>;
/**
 * Helper function for establishing NAT traversal connections
 * @param localId - Local peer identifier
 * @param remoteId - Remote peer identifier
 * @param gunInstance - Gun.js instance for signaling
 * @param options - NAT traversal options
 * @returns Promise that resolves with the connection result
 */
export declare function connectToPeer(localId: string, remoteId: string, gunInstance: any, options?: any): Promise<import("./lib/utils/nat-traversal-manager").NATTraversalResult>;
/**
 * Helper function to discover peers with specific content
 * @param infoHash - Info hash of the content to find peers for
 * @param announcePort - Port to announce for incoming connections
 * @param options - Peer discovery options
 * @returns Promise resolving to array of discovered peers
 */
export declare function findPeers(infoHash: string, announcePort?: number, options?: Partial<PeerDiscoveryOptions>): Promise<DiscoveredPeer[]>;
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
    ConnectionTypes: typeof CONNECTION_TYPE;
    discoverPublicIPs: typeof discoverPublicIPs;
    calculateSHA256: typeof calculateSHA256;
    upnpClient: import("./lib/utils/upnp").UPnPClient;
    createUPnPMapping: typeof createUPnPMapping;
    deleteUPnPMapping: typeof deleteUPnPMapping;
    getExternalAddressUPnP: typeof getExternalAddressUPnP;
    connectionRegistry: import("./lib/utils/connection-registry").ConnectionRegistry;
    performTCPHolePunch: typeof performTCPHolePunch;
    performUDPHolePunch: typeof performUDPHolePunch;
    performTCPSimultaneousOpen: typeof performTCPSimultaneousOpen;
    connectWithICE: typeof connectWithICE;
    ICEClient: typeof ICEClient;
    ICECandidateType: typeof ICECandidateType;
    TURNClient: typeof TURNClient;
    createTURNAllocation: typeof createTURNAllocation;
    NATTraversalManager: typeof NATTraversalManager;
    connectWithNATTraversal: typeof connectWithNATTraversal;
    DHTClient: typeof DHTClient;
    PexManager: typeof PexManager;
    PexMessageType: typeof PexMessageType;
    LocalDiscovery: typeof LocalDiscovery;
    PeerDiscoveryManager: typeof PeerDiscoveryManager;
};
export default _default;

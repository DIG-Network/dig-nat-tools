/**
 * Entry point for the Dig NAT Tools library
 * Provides tools for NAT traversal and P2P file sharing
 */
export * from './types/constants';
import FileHost from './lib/host';
import FileClient from './lib/client';
import NetworkManager from './lib/network-manager';
import { CONNECTION_TYPE } from './types/constants';
import { discoverPublicIPs } from './lib/utils';
import { upnpClient, createUPnPMapping, deleteUPnPMapping, getExternalAddressUPnP } from './lib/utils/upnp';
import { connectionRegistry } from './lib/utils/connection-registry';
import { performUDPHolePunch, performTCPHolePunch, performTCPSimultaneousOpen } from './lib/utils/hole-punch';
import { connectWithICE } from './lib/utils/ice';
import { turnClient, createTURNAllocation, connectViaTURN } from './lib/utils/turn';
import { connectWithNATTraversal, NATTraversalManager } from './lib/utils/nat-traversal-manager';
export { FileHost, FileClient, NetworkManager };
export { getLocalIPs, isPrivateIP, getRandomPort, parseConnectionString, createConnectionString, calculateSHA256, sleep, safeJSONParse, bufferToBase64, base64ToBuffer, getRandomArrayValue, shuffleArray, promiseWithTimeout, discoverPublicIPs } from './lib/utils';
export { upnpClient, createUPnPMapping, deleteUPnPMapping, getExternalAddressUPnP, connectionRegistry, performUDPHolePunch, performTCPHolePunch, performTCPSimultaneousOpen, connectWithICE, turnClient, createTURNAllocation, connectViaTURN, NATTraversalManager, connectWithNATTraversal };
/**
 * Create a new FileHost instance with default settings
 * @param options - Host configuration options
 * @returns A configured FileHost instance
 */
export declare function createHost(options?: any): FileHost;
/**
 * Create a new FileClient instance with default settings
 * @param options - Client configuration options
 * @returns A configured FileClient instance
 */
export declare function createClient(options?: any): FileClient;
/**
 * Create a network manager for multi-peer file transfers
 * @param options - Network manager configuration options
 * @returns A configured NetworkManager instance
 */
export declare function createNetworkManager(options?: any): NetworkManager;
/**
 * Helper function to download a file using the network manager
 * @param fileHash - SHA-256 hash of the file to download
 * @param savePath - Path where the file should be saved
 * @param peers - Array of peer connection strings
 * @param options - Download options
 * @returns Promise that resolves when the download is complete
 */
export declare function downloadFile(fileHash: string, savePath: string, peers: string[], options?: any): Promise<void>;
/**
 * Helper function for establishing NAT traversal connections
 * @param localId - Local peer identifier
 * @param remoteId - Remote peer identifier
 * @param gunInstance - Gun.js instance for signaling
 * @param options - NAT traversal options
 * @returns Promise that resolves with the connection result
 */
export declare function connectToPeer(localId: string, remoteId: string, gunInstance: any, options?: any): Promise<import("./lib/utils/nat-traversal-manager").NATTraversalResult>;
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
    ConnectionTypes: typeof CONNECTION_TYPE;
    discoverPublicIPs: typeof discoverPublicIPs;
    upnpClient: import("./lib/utils/upnp").UPnPClient;
    createUPnPMapping: typeof createUPnPMapping;
    deleteUPnPMapping: typeof deleteUPnPMapping;
    getExternalAddressUPnP: typeof getExternalAddressUPnP;
    connectionRegistry: import("./lib/utils/connection-registry").ConnectionRegistry;
    performUDPHolePunch: typeof performUDPHolePunch;
    performTCPHolePunch: typeof performTCPHolePunch;
    performTCPSimultaneousOpen: typeof performTCPSimultaneousOpen;
    connectWithICE: typeof connectWithICE;
    turnClient: import("./lib/utils/turn").TURNClient;
    createTURNAllocation: typeof createTURNAllocation;
    connectViaTURN: typeof connectViaTURN;
    NATTraversalManager: typeof NATTraversalManager;
    connectWithNATTraversal: typeof connectWithNATTraversal;
};
export default _default;

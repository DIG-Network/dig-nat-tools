/**
 * Entry point for the Dig NAT Tools library
 * Provides tools for NAT traversal and P2P file sharing
 */
export * from './types/constants';
import FileHost from './lib/host';
import FileClient from './lib/client';
import NetworkManager from './lib/network-manager';
export { FileHost, FileClient, NetworkManager };
export { getLocalIPs, isPrivateIP, getRandomPort, parseConnectionString, createConnectionString, calculateSHA256, sleep, safeJSONParse, bufferToBase64, base64ToBuffer, getRandomArrayValue, shuffleArray, promiseWithTimeout } from './lib/utils';
import { CONNECTION_TYPE } from './types/constants';
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
export declare const ConnectionTypes: typeof CONNECTION_TYPE;
declare const _default: {
    FileHost: typeof FileHost;
    FileClient: typeof FileClient;
    NetworkManager: typeof NetworkManager;
    createHost: typeof createHost;
    createClient: typeof createClient;
    createNetworkManager: typeof createNetworkManager;
    downloadFile: typeof downloadFile;
    ConnectionTypes: typeof CONNECTION_TYPE;
};
export default _default;

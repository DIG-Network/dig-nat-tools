/**
 * Entry point for the Dig NAT Tools library
 * Provides tools for NAT traversal and P2P file sharing
 */

// Export types
export * from './types/constants';

// Export main classes
import FileHost from './lib/host';
import FileClient from './lib/client';
import NetworkManager from './lib/network-manager';
import { CONNECTION_TYPE } from './types/constants';
import { discoverPublicIPs } from './lib/utils';

export { FileHost, FileClient, NetworkManager };

// Export utility functions
export {
  getLocalIPs,
  isPrivateIP,
  getRandomPort,
  parseConnectionString,
  createConnectionString,
  calculateSHA256,
  sleep,
  safeJSONParse,
  bufferToBase64,
  base64ToBuffer,
  getRandomArrayValue,
  shuffleArray,
  promiseWithTimeout,
  discoverPublicIPs
} from './lib/utils';

/**
 * Create a new FileHost instance with default settings
 * @param options - Host configuration options
 * @returns A configured FileHost instance
 */
export function createHost(options: any = {}) {
  return new FileHost(options);
}

/**
 * Create a new FileClient instance with default settings
 * @param options - Client configuration options
 * @returns A configured FileClient instance
 */
export function createClient(options: any = {}) {
  return new FileClient(options);
}

/**
 * Create a network manager for multi-peer file transfers
 * @param options - Network manager configuration options
 * @returns A configured NetworkManager instance
 */
export function createNetworkManager(options: any = {}) {
  return new NetworkManager(options);
}

/**
 * Helper function to download a file using the network manager
 * @param fileHash - SHA-256 hash of the file to download
 * @param savePath - Path where the file should be saved
 * @param peers - Array of peer connection strings
 * @param options - Download options
 * @returns Promise that resolves when the download is complete
 */
export async function downloadFile(
  fileHash: string,
  savePath: string,
  peers: string[],
  options: any = {}
): Promise<void> {
  const networkManager = new NetworkManager({
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
export const ConnectionTypes = CONNECTION_TYPE;

// Default export for the entire library
export default {
  FileHost,
  FileClient,
  NetworkManager,
  createHost,
  createClient,
  createNetworkManager,
  downloadFile,
  ConnectionTypes,
  discoverPublicIPs: discoverPublicIPs
}; 
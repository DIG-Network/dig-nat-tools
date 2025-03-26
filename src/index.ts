/**
 * Dig NAT Tools - Main Export
 * 
 * This library provides tools for NAT traversal and P2P file sharing
 */

// Import Debug for logging
import Debug from 'debug';
const debug = Debug('dig-nat-tools:index');

// Export version information
export const VERSION = '1.1.1';

// Export constants
export * from './types/constants';

// Import main classes
import { NetworkManager } from './lib';
import FileHost from './lib/transport/host';
import FileClient from './lib/transport/client';
import { CONNECTION_TYPE } from './types/constants';
import { 
  createAuthenticatedFileHost, 
  AuthenticatedFileHost, 
  AuthenticatedFileHostOptions 
} from './lib/application/authenticated-file-host';
import { NODE_TYPE } from './lib/discovery/peer/peer-discovery-manager';

// Import types from layers
import type { 
  HostOptions, 
  ClientOptions, 
  NetworkManagerOptions, 
  MultiDownloadOptions,
  DownloadOptions
} from './lib/types';

// Import from layers - using the new organized structure
import * as Application from './lib/application';
import * as Connection from './lib/connection';
import * as Crypto from './lib/crypto';
import * as Discovery from './lib/discovery';
import * as Transport from './lib/transport';

// Import NAT traversal function
import { connectWithNATTraversal } from './lib/connection/traversal';

// Re-export the layers for advanced usage
export { Application, Connection, Crypto, Discovery, Transport };

// Export the NetworkManager as the primary class
export { NetworkManager };
export { FileHost, FileClient };

// Re-export types with proper 'export type' syntax for TypeScript
export type { DownloadOptions } from './lib/transport/types';
export type { TransportOptions } from './lib/transport';
export type { DiscoveredPeer } from './lib/discovery/peer';

// Export constants for easier access
export { CONNECTION_TYPE, NODE_TYPE };

// Core factories and helper functions

/**
 * Create a new authenticated file host instance with default settings
 * @param options - Host configuration options
 * @returns A configured AuthenticatedFileHost instance
 */
export function createHost(options: Partial<AuthenticatedFileHostOptions> = {}): AuthenticatedFileHost {
  // Generate a random private key if not provided
  if (!options.privateKey) {
    const crypto = require('crypto');
    options.privateKey = crypto.randomBytes(32);
  }

  // Set default port if not provided
  if (!options.port) {
    options.port = 0; // Let the system assign a random port
  }

  // Set default directory if not provided
  if (!options.directory) {
    const os = require('os');
    const path = require('path');
    options.directory = path.join(os.tmpdir(), 'dig-nat-tools-host');
  }

  return createAuthenticatedFileHost(options as AuthenticatedFileHostOptions);
}

/**
 * Create a new FileClient instance with default settings
 * @param options - Client configuration options
 * @returns A configured FileClient instance
 */
export function createClient(options: any = {}): FileClient {
  return new FileClient(options);
}

/**
 * Create a network manager for multi-peer file transfers
 * @param options - Network manager configuration options
 * @returns A configured NetworkManager instance
 */
export function createNetworkManager(options: any = {}): NetworkManager {
  return new NetworkManager(options);
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
export async function downloadFile(
  contentId: string,
  fileHash: string,
  savePath: string,
  peers: string[],
  options: Partial<NetworkManagerOptions & MultiDownloadOptions> = {}
): Promise<void> {
  const networkManager = new NetworkManager({
    chunkSize: options.chunkSize,
    concurrency: options.concurrency,
    peerTimeout: options.peerTimeout,
    gunOptions: options.gunOptions,
    stunServers: options.stunServers
  });

  // Create MultiDownloadOptions object
  const downloadOptions: MultiDownloadOptions = {
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
export async function connectToPeer(
  localId: string,
  remoteId: string,
  gunInstance: any,
  options: any = {}
) {
  // Use the imported NAT traversal function
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
export async function findPeers(
  infoHash: string,
  announcePort: number = 0,
  options: Partial<Discovery.PeerDiscoveryOptions> = {}
): Promise<Discovery.DiscoveredPeer[]> {
  const discoveryManager = new Discovery.PeerDiscoveryManager({
    announcePort,
    enableIPv6: options.enableIPv6 !== undefined ? options.enableIPv6 : false,
    ...options
  });
  
  // Start discovery with the correct parameters
  await discoveryManager.start();
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
export async function announceFile(
  contentId: string, 
  fileHash: string,
  port: number,
  options: {
    nodeType?: NODE_TYPE,
    enableDHT?: boolean,
    enableLocal?: boolean,
    enablePEX?: boolean,
    enableIPv6?: boolean,
    enablePersistence?: boolean,
    persistenceDir?: string,
    priority?: Discovery.AnnouncePriority
  } = {}
): Promise<Discovery.PeerDiscoveryManager> {
  // Create a peer discovery manager with the provided options
  const manager = new Discovery.PeerDiscoveryManager({
    nodeType: options.nodeType as any, // Cast to any to avoid enum mismatch
    enableDHT: options.enableDHT !== undefined ? options.enableDHT : true,
    enableLocal: options.enableLocal !== undefined ? options.enableLocal : true,
    enablePEX: options.enablePEX !== undefined ? options.enablePEX : true,
    enableIPv6: options.enableIPv6 !== undefined ? options.enableIPv6 : false,
    enablePersistence: options.enablePersistence,
    persistenceDir: options.persistenceDir,
    announcePort: port
  });
  
  // Start the discovery mechanisms with correct parameters
  await manager.start();
  
  // Announce the content ID (we'll use this for discovery)
  const priority = options.priority || Discovery.AnnouncePriority.HIGH;
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
export async function addManualPeer(
  peerId: string,
  address: string,
  port: number,
  options: {
    infoHash?: string,
    enableDHT?: boolean,
    enablePEX?: boolean,
    enableLocal?: boolean,
    enableIPv6?: boolean
  } = {}
): Promise<Discovery.PeerDiscoveryManager> {
  // Create a peer discovery manager with the provided options
  const manager = new Discovery.PeerDiscoveryManager({
    enableDHT: options.enableDHT !== undefined ? options.enableDHT : false,
    enableLocal: options.enableLocal !== undefined ? options.enableLocal : false,
    enablePEX: options.enablePEX !== undefined ? options.enablePEX : false,
    enableIPv6: options.enableIPv6 !== undefined ? options.enableIPv6 : false,
    announcePort: port
  });
  
  // Start the discovery mechanisms with the correct parameters
  await manager.start();
  
  // Add the manual peer
  manager.addManualPeer(peerId, address, port, options.infoHash);
  
  return manager;
}

// Default export for the entire library
export default {
  // Main classes
  NetworkManager,
  FileHost,
  FileClient,
  
  // Core factory functions
  createHost,
  createClient,
  createNetworkManager,
  
  // Helper functions
  downloadFile,
  connectToPeer,
  findPeers,
  announceFile,
  addManualPeer,
  
  // Constants
  CONNECTION_TYPE,
  NODE_TYPE,
  VERSION,
  
  // Layer exports for advanced usage
  Application,
  Connection,
  Crypto,
  Discovery,
  Transport
}; 
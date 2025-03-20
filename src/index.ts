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
import { 
  HostOptions, 
  ClientOptions, 
  NetworkManagerOptions, 
  DownloadOptions, 
  MultiDownloadOptions, 
  DownloadResult, 
  PeerStats, 
  GunOptions 
} from './lib/types';

// Import utility functions
import {
  parseConnectionString,
  createConnectionString,
  sleep,
  safeJSONParse,
  discoverPublicIPs,
  getLocalIPs,
  isPrivateIP,
  getRandomPort,
  bufferToBase64,
  base64ToBuffer,
  getRandomArrayValue,
  shuffleArray,
  promiseWithTimeout,
  calculateSHA256
} from './lib/utils';

// Import NAT traversal utilities from existing codebase
import { 
  upnpClient, 
  createUPnPMapping, 
  deleteUPnPMapping, 
  getExternalAddressUPnP 
} from './lib/utils/upnp';
import { connectionRegistry } from './lib/utils/connection-registry';
import { 
  performTCPHolePunch,
  performUDPHolePunch,
  performTCPSimultaneousOpen 
} from './lib/utils/hole-punch';
import { 
  ICEClient, 
  ICECandidate,
  connectWithICE,
  ICECandidateType 
} from './lib/utils/ice';
import { 
  TURNClient, 
  createTURNAllocation 
} from './lib/utils/turn';
import { NATTraversalManager, connectWithNATTraversal } from './lib/utils/nat-traversal-manager';

// Import new peer discovery mechanisms
import { DHTClient } from './lib/utils/dht';
import { PexManager, PexMessageType } from './lib/utils/pex';
import { LocalDiscovery } from './lib/utils/local-discovery';
import { PeerDiscoveryManager, PeerDiscoveryOptions, AnnouncePriority } from './lib/utils/peer-discovery-manager';
import { NODE_TYPE } from './types/constants';

// Type imports (these don't produce runtime code)
import type { PexPeer } from './lib/utils/pex';
import type { LocalPeer } from './lib/utils/local-discovery';
import type { DiscoveredPeer } from './lib/utils/peer-discovery-manager';

// Main exports
export {
  FileHost,
  FileClient,
  NetworkManager,
  
  // Types
  HostOptions,
  ClientOptions,
  NetworkManagerOptions,
  DownloadOptions,
  MultiDownloadOptions,
  DownloadResult,
  PeerStats,
  GunOptions,
  CONNECTION_TYPE,
  
  // Utility functions
  parseConnectionString,
  createConnectionString,
  sleep,
  safeJSONParse,
  discoverPublicIPs,
  calculateSHA256,
  getLocalIPs,
  isPrivateIP,
  getRandomPort,
  bufferToBase64,
  base64ToBuffer,
  getRandomArrayValue,
  shuffleArray,
  promiseWithTimeout,
  
  // NAT traversal utilities
  upnpClient,
  createUPnPMapping,
  deleteUPnPMapping,
  getExternalAddressUPnP,
  connectionRegistry,
  performTCPHolePunch,
  performUDPHolePunch,
  performTCPSimultaneousOpen,
  connectWithICE,
  ICEClient,
  ICECandidateType,
  TURNClient,
  createTURNAllocation,
  NATTraversalManager,
  connectWithNATTraversal,
  
  // Peer discovery mechanisms
  DHTClient,
  PexManager,
  PexMessageType,
  LocalDiscovery,
  PeerDiscoveryManager,
  AnnouncePriority,
  NODE_TYPE
};

// Also export types
export type { PexPeer, LocalPeer, DiscoveredPeer, ICECandidate };

/**
 * Create a new FileHost instance with default settings
 * @param options - Host configuration options
 * @returns A configured FileHost instance
 */
export function createHost(options: HostOptions = {} as HostOptions) {
  return new FileHost(options);
}

/**
 * Create a new FileClient instance with default settings
 * @param options - Client configuration options
 * @returns A configured FileClient instance
 */
export function createClient(options: ClientOptions = {} as ClientOptions) {
  return new FileClient(options);
}

/**
 * Create a network manager for multi-peer file transfers
 * @param options - Network manager configuration options
 * @returns A configured NetworkManager instance
 */
export function createNetworkManager(options: NetworkManagerOptions = {} as NetworkManagerOptions) {
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
export async function connectToPeer(
  localId: string,
  remoteId: string,
  gunInstance: any,
  options: any = {}
) {
  return connectWithNATTraversal({
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
export async function findPeers(
  infoHash: string,
  announcePort: number = 0,
  options: Partial<PeerDiscoveryOptions> = {}
): Promise<DiscoveredPeer[]> {
  const discoveryManager = new PeerDiscoveryManager({
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
 * @param fileHash - SHA-256 hash of the file to announce
 * @param port - Port to listen for incoming connections
 * @param options - Configuration options for discovery
 * @returns Promise resolving to the discovery manager
 */
export async function announceFile(
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
    priority?: AnnouncePriority
  } = {}
): Promise<PeerDiscoveryManager> {
  // Create a peer discovery manager with the provided options
  const manager = new PeerDiscoveryManager({
    nodeType: options.nodeType || NODE_TYPE.STANDARD,
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
  
  // Announce the file hash
  const priority = options.priority || AnnouncePriority.HIGH;
  await manager.addInfoHash(fileHash, priority);
  
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
): Promise<PeerDiscoveryManager> {
  // Create a peer discovery manager with the provided options
  const manager = new PeerDiscoveryManager({
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
  connectToPeer,
  findPeers,
  announceFile,
  addManualPeer,
  ConnectionTypes,
  
  // Utilities
  discoverPublicIPs,
  calculateSHA256,
  
  // NAT traversal exports
  upnpClient,
  createUPnPMapping,
  deleteUPnPMapping,
  getExternalAddressUPnP,
  connectionRegistry,
  performTCPHolePunch,
  performUDPHolePunch,
  performTCPSimultaneousOpen,
  connectWithICE,
  ICEClient,
  ICECandidateType,
  TURNClient,
  createTURNAllocation,
  NATTraversalManager,
  connectWithNATTraversal,
  
  // Peer discovery mechanisms
  DHTClient,
  PexManager,
  PexMessageType,
  LocalDiscovery,
  PeerDiscoveryManager,
  AnnouncePriority,
  NODE_TYPE
}; 
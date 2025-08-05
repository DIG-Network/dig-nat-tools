/**
 * Peer Discovery Module
 * 
 * This file exports the main classes and types related to peer discovery
 */

// Import the main peer discovery manager and its types
import { PeerDiscoveryManager, NODE_TYPE, AnnouncePriority } from './peer-discovery-manager';
import type { PeerDiscoveryOptions } from './peer-discovery-manager';
import type { DiscoveryPeer } from './types';

// Export discovery components 
export { DHTClient } from './dht';
export { PexManager } from './pex';
export { LocalDiscovery } from './local-discovery';
export { GunDiscovery } from './gun-discovery';

// Export types and classes
export { PeerDiscoveryManager, NODE_TYPE, AnnouncePriority };
export type { DiscoveryPeer, PeerDiscoveryOptions };

/**
 * Interface for a discovered peer
 * @deprecated Use DiscoveryPeer from './types' instead
 */
export interface DiscoveredPeer {
  id?: string;           // Peer ID (if available)
  address: string;       // IP address of the peer
  port: number;          // Port the peer is listening on
  source: string;        // Which discovery mechanism found this peer
  infoHashes?: string[]; // Info hashes this peer is known to have
  additionalData?: Record<string, unknown>; // Additional data from discovery
}

/**
 * Create a new peer discovery manager
 */
export function createPeerDiscoveryManager(options: PeerDiscoveryOptions = {}): PeerDiscoveryManager {
  return new PeerDiscoveryManager(options);
}

// Default export
export default PeerDiscoveryManager; 
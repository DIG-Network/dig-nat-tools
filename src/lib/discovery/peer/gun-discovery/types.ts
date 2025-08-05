/**
 * Type definitions for Gun.js discovery implementation
 */

// Import GunInstance from its original location
import type { GunInstance } from '../../../types/gun';
import type { DiscoveryPeer, DiscoveryEvents, DiscoveryComponent } from '../types';
import { PEER_SOURCES } from '../../../discovery/types';
// Re-export GunInstance and other needed types
export type { GunInstance, DiscoveryPeer, DiscoveryEvents };

// Define Gun callback data types
export interface GunData {
  _?: Record<string, unknown>;     // Gun metadata marker
  [key: string]: unknown;          // Additional properties
}

export interface GunPeerMapData extends Record<string, unknown> {
  _?: Record<string, unknown>;     // Gun metadata marker
  [nodeId: string]: GunPeerData | Record<string, unknown> | undefined;
}

export interface GunContentMapsData extends Record<string, unknown> {
  _?: Record<string, unknown>;     // Gun metadata marker
  [contentId: string]: GunContentMapData | Record<string, unknown> | undefined;
}

// Define types directly in the file instead of importing

/**
 * Event types for Gun discovery
 * Make this extend DiscoveryEvents to ensure compatibility
 */
export interface Events extends DiscoveryEvents {
  // Already includes 'peer-discovered' from DiscoveryEvents
}

/**
 * Internal type for storing peers with additional metadata
 */
export interface GunPeerMetadata {
  lastSeen: number;
}

/**
 * Internal type for storing peers with multiple hashes
 */
export interface GunPeer extends DiscoveryPeer {
  infoHashes: string[];
  metadata: GunPeerMetadata;
}

/**
 * Configuration options for Gun.js discovery
 */
export interface GunDiscoveryOptions {
  gun: GunInstance;                     // Gun.js instance
  nodeId?: string;              // Unique node identifier
  announceInterval?: number;    // How often to announce (ms)
  announcePort?: number;        // TCP port to announce
  enablePersistence?: boolean;  // Whether to persist data
  persistenceDir?: string;      // Directory for persistent data
  peerTTL?: number;             // How long to keep peers (ms)
  cleanupInterval?: number;     // Interval for cleaning up peers (ms)
  externalIp?: string | null;   // External IP for announcements
  externalPort?: number | null; // External port for announcements
}

/**
 * Hash set for tracking info hashes
 */
export interface HashData {
  infoHashes: Set<string>;
  highPriorityHashes: Set<string>;
  contentHashMap: Map<string, string>; // contentId -> hash
}

/**
 * Gun discovery event handlers
 */
export interface GunDiscoveryEvents {
  'peer-discovered': (peer: DiscoveryPeer) => void;
}

/**
 * Data structure for peer information stored in Gun
 */
export interface GunPeerData {
  ip: string;
  port: number;
  timestamp: number;
  ver: string;
}

/**
 * Data structure for content mapping stored in Gun
 */
export interface GunContentMapData {
  hash: string;
}

/**
 * Interface for the Gun discovery class
 * Extends DiscoveryComponent with additional Gun-specific methods
 */
export interface GunDiscovery extends DiscoveryComponent {
  readonly gun: GunInstance;
  
  addInfoHash(infoHash: string, highPriority?: boolean): void;
  removeInfoHash(infoHash: string): void;
  findPeers(infoHash: string, maxPeers?: number, timeout?: number): Promise<DiscoveryPeer[]>;
  addContentMapping(contentId: string, infoHash: string): void;
  removeContentMapping(contentId: string): void;
  getHashForContent(contentId: string): string | undefined;
  getContentForHash(infoHash: string): string | undefined;
  announce(infoHash: string, peerId: string): void;
}

// Re-export PEER_SOURCES from the central location
export { PEER_SOURCES };

/**
 * Type definitions for the Peer Discovery Manager
 */

import type { SimpleBloomFilter } from './utils';
import type { GunInstance } from '../../../types/gun';
import { PeerContentStatus } from '../types';

/**
 * Base interface for discovered peers
 */
export interface DiscoveryPeer {
  id?: string;           // Peer ID (optional)
  address: string;       // IP address
  port: number;          // Port number
  source?: string;       // Source of discovery (e.g., 'dht', 'pex', 'local')
  confidence?: number;   // Confidence level (0-1) that this peer has the content
  infoHashes?: string[]; // Info hashes this peer is known to have
}

/**
 * Interface for DHT nodes in the routing table
 */
export interface DHTNode extends DiscoveryPeer {
  id: string;           // Node ID (required for DHT nodes)
  lastSeen?: number;    // Timestamp of last activity
  token?: string;       // Token for announcing
}

/**
 * Event types for discovery components
 */
export interface DiscoveryEvents {
  'peer-discovered': [peer: DiscoveryPeer];
  'peer-removed': [peerId: string, infoHash: string];
  'peer-added': [peer: DiscoveryPeer, infoHash: string];
  'peer-failed': [peer: DiscoveryPeer, infoHash: string];
  'peer-statusChanged': [{
    peerId: string;
    infoHash: string;
    previousStatus: PeerContentStatus;
    status: PeerContentStatus;
  }];
  'content:announced': [infoHash: string];
  'content:removed': [infoHash: string];
  'verification:needed': [peerId: string, infoHash: string];
  'error': [error: Error];
}

/**
 * Common interface for all discovery components
 */
export interface DiscoveryComponent {
  on<E extends keyof DiscoveryEvents>(event: E, listener: (...args: DiscoveryEvents[E]) => void): this;
  off<E extends keyof DiscoveryEvents>(event: E, listener: (...args: DiscoveryEvents[E]) => void): this;
  emit<E extends keyof DiscoveryEvents>(event: E, ...args: DiscoveryEvents[E]): boolean;
  
  start(): Promise<void>;
  stop(): Promise<void>;
  findPeers(infoHash: string): Promise<DiscoveryPeer[]>;
}

/**
 * DHT client interface
 */
export interface DHTClient extends DiscoveryComponent {
  addInfoHash(infoHash: string): void;
  removeInfoHash(infoHash: string): void;
  removePeer?(peerId: string, infoHash: string): void;
  findNode?(targetId: string): Promise<DHTNode[]>;
  announcePeer?(infoHash: string, port: number, interval?: number): Promise<void>;
}

/**
 * PEX manager interface
 */
export interface PEXManager extends DiscoveryComponent {
  addInfoHash(infoHash: string): void;
  removeInfoHash(infoHash: string): void;
  addPeer(peerId: string, infoHash: string): void;
  removePeer(peerId: string, infoHash: string): void;
}

/**
 * Define node types
 */
export enum NODE_TYPE {
  LIGHT = 'light',     // Lightweight node with minimal capabilities
  STANDARD = 'standard', // Standard node with all core capabilities
  SUPER = 'super'      // Super node with extended capabilities
}

/**
 * BloomFilter type alias
 */
export type BloomFilter = SimpleBloomFilter;

/**
 * Interface representing a peer with connection information
 * Extends DiscoveryPeer with required fields for discovery manager
 */
export interface DiscoveredPeer extends DiscoveryPeer {
  source: string;       // Source of discovery (e.g., 'dht', 'pex', 'local')
  confidence: number;   // Confidence level (0-1) that this peer has the content
  lastSeen?: number;    // When the peer was last seen
  infoHash?: string;    // Info hash of the content (if known)
  additionalData?: Record<string, unknown>; // Additional data from discovery
}

/**
 * Priority level for content announcements
 */
export enum AnnouncePriority {
  HIGH = 'high',       // Announce to all mechanisms, store in memory
  MEDIUM = 'medium',   // Announce to DHT and local, but not in memory
  LOW = 'low'          // Only announce locally
}

/**
 * Configuration options for peer discovery
 */
export interface PeerDiscoveryOptions {
  enableDHT?: boolean;        // Whether to use DHT for discovery
  enablePEX?: boolean;        // Whether to use PEX for discovery
  enableLocal?: boolean;      // Whether to use local discovery
  enableGun?: boolean;        // Whether to use Gun.js for discovery
  enableIPv6?: boolean;       // Whether to enable IPv6 support
  dhtOptions?: Record<string, unknown>;  // Options for DHT client
  pexOptions?: Record<string, unknown>;  // Options for PEX manager
  localOptions?: Record<string, unknown>; // Options for local discovery
  gunOptions?: Record<string, unknown>;  // Options for Gun discovery
  gun?: GunInstance;              // Existing Gun instance to use
  deduplicate?: boolean;      // Whether to deduplicate peers from different sources
  announcePort?: number;      // Port to announce for incoming connections
  maxPeers?: number;          // Maximum number of peers to track
  nodeType?: NODE_TYPE;       // Type of node (LIGHT, STANDARD, SUPER)
  enablePersistence?: boolean; // Whether to use persistent storage
  persistenceDir?: string;    // Directory for persistent storage
  useBloomFilter?: boolean;   // Whether to use Bloom filter for hash tracking
  nodeId?: string;            // Unique identifier for this node
} 
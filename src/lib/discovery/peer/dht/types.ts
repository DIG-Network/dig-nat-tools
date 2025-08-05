/**
 * Type definitions for DHT (Distributed Hash Table) implementation
 */

import type { DHTClient as DHTClientInterface, DHTNode } from '../types';
import { NODE_TYPE } from '../types';

/**
 * Types of DHT messages
 */
export enum MessageType {
  PING = 'ping',
  FIND_NODE = 'find_node',
  GET_PEERS = 'get_peers',
  ANNOUNCE_PEER = 'announce_peer',
  RESPONSE = 'response',
  ERROR = 'error',
  QUERY = 'query'
}

/**
 * Interface for DHT queries
 */
export interface DHTQuery {
  t: string; // Transaction ID
  y: string; // Message type
  q?: string; // Query name
  a?: Record<string, unknown>; // Query arguments
  r?: Record<string, unknown>; // Response
  e?: [number, string]; // Error: [code, message]
}

/**
 * Interface for peers returned from DHT queries
 */
export interface DHTPeer {
  address: string; // IP address
  port: number; // Port number
}

/**
 * Result of a DHT query
 */
export interface DHTQueryResult {
  nodes?: DHTNode[];
  values?: string[];
  token?: string;
  id?: string; // Node ID from response
  [key: string]: unknown;
}

/**
 * Options for the DHT client
 */
export interface DHTClientOptions {
  bootstrapNodes?: Array<{ address: string, port: number }>; // Bootstrap nodes
  udpPort?: number; // Port for UDP socket
  nodeId?: string; // Our node ID (20 bytes hex)
  nodeType?: NODE_TYPE; // Type of node (LIGHT, STANDARD, SUPER)
  enablePersistence?: boolean; // Whether to persist routing table and cache
  persistenceDir?: string; // Directory for persistence
  maxCachedHashes?: number; // Maximum number of info hashes to cache peers for
  maxCachedPeersPerHash?: number; // Maximum number of peers to cache per hash
  ttl?: number; // Time to live for cached peers in milliseconds
  updateAgeOnGet?: boolean; // Whether to update the age of cached entries on get
  shardPrefixes?: string[]; // Prefixes of info hashes to handle in this shard
  enableIPv6?: boolean; // Whether to enable IPv6
}

/**
 * Interface for rate limiting
 */
export interface RateLimit {
  count: number;
  timestamp: number;
}

/**
 * Interface for blacklisted nodes
 */
export interface BlacklistedNode {
  address: string;
  timestamp: number;
  reason: string;
}

/**
 * Interface for the DHT client implementation
 */
export interface DHTClient extends DHTClientInterface {
  start(): Promise<void>;
  stop(): Promise<void>;
  findNode(targetId: string): Promise<DHTNode[]>;
  findPeers(infoHash: string, maxPeers?: number): Promise<DHTPeer[]>;
  announcePeer(infoHash: string, port: number, interval?: number): Promise<void>;
  addInfoHash(infoHash: string): void;
  removeInfoHash(infoHash: string): void;
  removePeer(peerId: string, infoHash: string): void;
} 
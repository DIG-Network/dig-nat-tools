/**
 * Type definitions for PEX (Peer Exchange) implementation
 */

import type { DiscoveryPeer } from '../types';
import type { GunInstance } from '../../../types/gun';

/**
 * Internal peer tracking interface that extends DiscoveryPeer
 */
export interface InternalPeer extends DiscoveryPeer {
  lastSeen: number;
  flags?: PexPeerFlags;
}

/**
 * Flags that can be set on a peer
 */
export interface PexPeerFlags {
  preferEncryption?: boolean;
  canUseUTP?: boolean;
  isReachable?: boolean;
  supportsNetCrypto?: boolean;
}

/**
 * Configuration options for the PEX manager
 */
export interface PexManagerOptions {
  maxPeers?: number;
  peerExpiration?: number;
  announcePeriod?: number;
  peerDeduplication?: boolean;
  gun: GunInstance;
  nodeId: string;
  port: number;
  peerFlags?: PexPeerFlags;
}

/**
 * Message types for PEX
 */
export enum PexMessageType {
  ADD_PEERS = 'add_peers',
  REMOVE_PEERS = 'remove_peers'
}

/**
 * Message for PEX protocol
 */
export interface PexMessage {
  type: PexMessageType;
  peers: Array<DiscoveryPeer & { flags?: PexPeerFlags }>;
} 
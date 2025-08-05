/**
 * Type definitions for local peer discovery implementation
 */

import type { DiscoveryPeer, DiscoveryEvents, DiscoveryComponent } from '../types';

/**
 * Configuration options for local discovery
 */
export interface LocalDiscoveryOptions {
  serviceType?: string;        // Service type identifier
  announceInterval?: number;   // How often to announce (ms)
  peerTTL?: number;           // How long to keep peers (ms)
  port?: number;              // Port to announce
  enableIPv6?: boolean;       // Whether to enable IPv6
}

/**
 * Interface for the Local Discovery implementation
 * Extends DiscoveryComponent to ensure proper implementation
 */
export interface LocalDiscovery extends DiscoveryComponent {
  /**
   * Start local discovery
   */
  start(): Promise<void>;
  
  /**
   * Stop local discovery
   */
  stop(): Promise<void>;
  
  /**
   * Add an info hash to announce
   */
  addInfoHash(infoHash: string): void;
  
  /**
   * Remove an info hash
   */
  removeInfoHash(infoHash: string): void;
  
  /**
   * Find peers that have announced a specific info hash
   */
  findPeers(infoHash: string): Promise<DiscoveryPeer[]>;
}

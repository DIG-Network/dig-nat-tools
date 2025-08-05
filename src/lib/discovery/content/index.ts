/**
 * Content Discovery Module
 * 
 * This module provides functionality for tracking content availability across the network
 * and integrating with peer discovery systems to maintain consistent content records.
 */

// Export all components
export * from './content-availability-manager';
export * from './discovery-content-integration';

// Default exports for convenience
export { default as ContentAvailabilityManager } from './content-availability-manager';

/**
 * Peer content status enumeration
 */
export enum PeerContentStatus {
  AVAILABLE = 'available',    // Content is available
  SUSPECT = 'suspect',        // Content availability is suspect
  UNAVAILABLE = 'unavailable' // Content is unavailable
}

/**
 * Content verification result
 */
export interface VerificationResult {
  peerId: string;       // ID of the peer
  infoHash: string;     // Hash of the content
  hasContent: boolean;  // Whether the peer has the content
  timestamp: number;    // When the verification was performed
  responseTime?: number; // Time taken to verify
  error?: string;       // Error message if verification failed
}

/**
 * Options for content availability manager
 */
export interface ContentAvailabilityOptions {
  nodeId: string;                // Local node ID
  gun?: any;                    // Gun.js instance
  contentTTL?: number;          // Time-to-live for content
  reannounceInterval?: number;  // Interval for reannouncements
  enableVerification?: boolean; // Enable content verification
  persistenceEnabled?: boolean; // Enable persistence
  persistenceDir?: string;      // Directory for persistence
}

/**
 * Options for discovery content integration
 */
export interface DiscoveryContentIntegrationOptions extends ContentAvailabilityOptions {
  verificationTimeout?: number;   // Timeout for verification
  verificationRetryDelay?: number; // Delay between retries
  enableDHTIntegration?: boolean;  // Enable DHT integration
  enablePEXIntegration?: boolean;  // Enable PEX integration
  enableGunIntegration?: boolean;  // Enable Gun.js integration
}

/**
 * Helper function to create a discovery content integration
 * @param options - Integration options
 * @returns Discovery content integration instance
 */
export function createDiscoveryIntegration(options: Partial<DiscoveryContentIntegrationOptions> = {}) {
  if (!options.nodeId) {
    throw new Error('nodeId is required for content discovery integration');
  }
  const { DiscoveryContentIntegration } = require('./discovery-content-integration');
  return new DiscoveryContentIntegration(options as DiscoveryContentIntegrationOptions);
}

/**
 * Helper function to create a content availability manager
 * @param options - Configuration options
 * @returns Content availability manager instance
 */
export function createContentAvailabilityManager(options: ContentAvailabilityOptions) {
  const { ContentAvailabilityManager } = require('./content-availability-manager');
  return new ContentAvailabilityManager(options);
} 
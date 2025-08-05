/**
 * Discovery Module
 * 
 * This module provides peer and content discovery functionalities for the Dig NAT Tools system.
 * It includes components for DHT, PEX, local discovery, Gun.js based discovery, and content
 * availability tracking.
 */

// Re-export all components from peer discovery
export * from './peer';

// Re-export all components from content discovery
export * from './content';

// Helper to determine the type of discovery engine available
export enum DiscoveryType {
  DHT = 'dht',
  PEX = 'pex',
  LOCAL = 'local',
  GUN = 'gun'
}

/**
 * Unified discovery options
 */
export interface DiscoveryOptions {
  // Peer discovery options
  enableDHT?: boolean;
  enablePEX?: boolean;
  enableLocal?: boolean;
  enableGun?: boolean;
  enableIPv6?: boolean;
  
  // Content tracking options
  enableContentTracking?: boolean;
  
  // Common options
  nodeId?: string;
  persistenceEnabled?: boolean;
  persistenceDir?: string;
  gun?: any;
}

/**
 * Create a unified discovery system with both peer and content discovery
 * @param options Discovery configuration options
 * @returns Object containing both peer discovery and content discovery managers
 */
export function createDiscoverySystem(options: DiscoveryOptions = {}) {
  const nodeId = options.nodeId || generateNodeId();
  
  // Create peer discovery manager
  const { PeerDiscoveryManager } = require('./peer');
  const peerDiscovery = new PeerDiscoveryManager({
    enableDHT: options.enableDHT !== false,
    enablePEX: options.enablePEX !== false,
    enableLocal: options.enableLocal !== false,
    enableGun: options.enableGun !== false,
    enableIPv6: options.enableIPv6 || false,
    nodeId,
    enablePersistence: options.persistenceEnabled,
    persistenceDir: options.persistenceDir,
    gun: options.gun
  });
  
  // Create content discovery if enabled
  let contentDiscovery = null;
  if (options.enableContentTracking !== false) {
    const { DiscoveryContentIntegration } = require('./content/discovery-content-integration');
    contentDiscovery = new DiscoveryContentIntegration({
      nodeId,
      gun: options.gun,
      persistenceEnabled: options.persistenceEnabled,
      persistenceDir: options.persistenceDir
    });
  }
  
  return {
    peerDiscovery,
    contentDiscovery,
    start: async () => {
      await peerDiscovery.start();
      if (contentDiscovery) {
        await contentDiscovery.start();
        
        // Register peer discovery components with content integration
        if (peerDiscovery.dht && contentDiscovery.registerDHTClient) {
          contentDiscovery.registerDHTClient(peerDiscovery.dht);
        }
        if (peerDiscovery.pex && contentDiscovery.registerPEXManager) {
          contentDiscovery.registerPEXManager(peerDiscovery.pex);
        }
        if (peerDiscovery.gun && contentDiscovery.registerGunDiscovery) {
          contentDiscovery.registerGunDiscovery(peerDiscovery.gun);
        }
      }
    },
    stop: async () => {
      if (contentDiscovery) {
        await contentDiscovery.stop();
      }
      peerDiscovery.stop();
    }
  };
}

/**
 * Generate a random node ID
 * @returns A random node ID as a hex string
 */
function generateNodeId(): string {
  const crypto = require('crypto');
  return crypto.randomBytes(16).toString('hex');
} 
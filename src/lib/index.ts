/**
 * Main library export file
 * 
 * This file exports all components from the various layers of the library
 * in a unified and organized manner.
 */

// Export from each layer in namespaces to avoid name collisions
import * as ApplicationExports from './application';
import * as ConnectionExports from './connection';
import * as CryptoExports from './crypto';
import * as DiscoveryExports from './discovery';
import * as TransportExports from './transport';
import * as InterfacesExports from './interfaces';

// Export namespaces
export const Application = ApplicationExports;
export const Connection = ConnectionExports;
export const Crypto = CryptoExports;
export const Discovery = DiscoveryExports;
export const Transport = TransportExports;
export const Interfaces = InterfacesExports;

// Export the network manager
export { default as NetworkManager } from './network-manager';

// Re-export common types and utilities
export * from './types';
export * from './utils';

// Export constants from types directory if needed
export { CONNECTION_TYPE, NODE_TYPE } from '../types/constants';

// Re-export specific common types that should be available at the top level
export { FileHost, FileClient } from './transport';
export { DownloadOptions } from './transport/types';
export { TransportOptions } from './transport';
export { PeerDiscoveryManager, DiscoveredPeer } from './discovery/peer';
export { connectWithNATTraversal } from './connection';
export { calculateSHA256 } from './crypto'; 
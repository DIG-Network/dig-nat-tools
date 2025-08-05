/**
 * Network Module
 * 
 * Exports network management functionality and types.
 */

export * from './types';
export { NetworkManager } from './network-manager';
export {
  connectToFirstAvailableAddress,
  connectWithIPv6Preference,
  createTCPServerBound,
  createUDPSocketBound
} from './network-utils'; 
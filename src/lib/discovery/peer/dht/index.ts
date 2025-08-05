/**
 * DHT (Distributed Hash Table) module exports
 * Using Gun.js as the underlying communication layer
 */

// Export the main DHT implementation
import { DHT } from './dht';
import type { DHTOptions, DHTNode } from './dht';
import createDHT from './dht';

// Export the client interface type
import type { DHTClient } from './types';

// Legacy client factory function
import createDHTClient from './dht';

// Export core API and types
export { DHT };
export type { DHTOptions, DHTNode, DHTClient };

// Export other useful types
export { MessageType } from './types';
export type { 
  DHTClientOptions,
  DHTQuery,
  DHTQueryResult
} from './types';

// Export factory functions
export { createDHT, createDHTClient };

// Default export is the Gun-based implementation
export default createDHT; 
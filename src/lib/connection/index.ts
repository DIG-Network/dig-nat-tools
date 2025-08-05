/**
 * Connection Module
 * 
 * Provides a unified interface for establishing connections with peers.
 * The ConnectionClient is the primary public interface for this module,
 * encapsulating all the underlying implementation details.
 */

import { ConnectionClient } from './client/connection-client';
import { CONNECTION_TYPE } from '../../types/constants';

// Export only the ConnectionClient class as the primary interface
export { ConnectionClient };

// Export the connection type enum which is needed by consumers
export { CONNECTION_TYPE };

// Export types that are needed in the public API
export type { Connection } from '../types/connection';

// Create a singleton instance for convenience
export const connectionClient = new ConnectionClient();

// Default export is the singleton instance
export default connectionClient;
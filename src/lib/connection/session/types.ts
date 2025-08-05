/**
 * Session Module Types
 * 
 * Type definitions for the connection session module.
 */

import type { Connection } from '../client/types';

/**
 * Session options interface
 */
export interface SessionOptions {
  id?: string;
  timeout?: number;
  maxConnections?: number;
  keepAlive?: boolean;
}

/**
 * Session state interface
 */
export interface SessionState {
  id: string;
  startTime: number;
  lastActivity: number;
  connections: Map<string, Connection>;
}

/**
 * Session events interface
 */
export interface SessionEvents {
  'connection:added': (peerId: string, connection: Connection) => void;
  'connection:removed': (peerId: string) => void;
  'session:expired': () => void;
  'session:closed': () => void;
} 
/**
 * Network Module Types
 * 
 * Type definitions for the network management module.
 */

import type { Socket } from 'net';
import type { Socket as DgramSocket } from 'dgram';

/**
 * Network manager configuration
 */
export interface NetworkManagerConfig {
  // IP preferences
  enableIPv6?: boolean;
  preferIPv6?: boolean;
  
  // Port configuration
  tcpPort?: number;
  udpPort?: number;
  portRange?: {
    start: number;
    end: number;
  };
  
  // Connection limits
  maxConnections?: number;
  connectionTimeout?: number;
  
  // Network interface
  interface?: string;
  allowPrivate?: boolean;
}

/**
 * Network connection result
 */
export interface NetworkConnectionResult {
  success: boolean;
  socket?: Socket | DgramSocket;
  localAddress?: string;
  localPort?: number;
  error?: string;
}

/**
 * Connection options for network operations
 */
export interface NetworkConnectionOptions {
  // Target address
  address: string;
  port: number;
  
  // Protocol preferences
  protocol?: 'TCP' | 'UDP';
  
  // Timeouts and retries
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
  
  // Local binding
  localPort?: number;
  localAddress?: string;
} 
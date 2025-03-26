/**
 * Common types for NAT traversal functionality
 */

import type { Socket } from 'net';
import type { Socket as DgramSocket } from 'dgram';
import type { CONNECTION_TYPE } from './constants';
import type { GunInstance } from './gun';
import type { ICEResult } from './ice';
export type { ICEResult };

/**
 * Result of a NAT traversal attempt
 */
export interface NATTraversalResult {
  success: boolean;
  connectionType?: CONNECTION_TYPE;
  socket?: Socket | DgramSocket;
  remoteAddress?: string;
  remotePort?: number;
  error?: string;
  details?: Record<string, unknown>;
  
  // WebRTC specific properties
  peerConnection?: any; // For WebRTC connections
  dataChannel?: any; // For WebRTC connections
  protocol?: 'TCP' | 'UDP'; // For TURN connections
}

/**
 * NAT traversal method options
 */
export interface NATTraversalOptions {
  // Target peer
  peerId: string;
  address?: string;
  port?: number;
  
  // Local configuration
  localPort?: number;
  localPorts?: number[];
  protocol?: 'TCP' | 'UDP';
  preferredFamily?: 'IPv6' | 'IPv4'; // Address family preference
  
  // Signaling
  gun?: GunInstance;
  
  // Timeouts
  methodTimeout?: number;
  overallTimeout?: number;
  
  // Method selection
  methods?: CONNECTION_TYPE[];
  failFast?: boolean;
  
  // Infrastructure
  stunServers?: string[];
  turnServer?: string;
  turnUsername?: string;
  turnCredential?: string;
}

/**
 * Options for hole punching
 */
export interface HolePunchOptions {
  localPort: number;
  punchTimeout: number;
  gun: GunInstance;
  localId: string;
  remoteId: string;
  validatePeer?: boolean;
}

/**
 * Result of a hole punching attempt
 */
export interface HolePunchResult {
  success: boolean;
  socket?: Socket | DgramSocket;
  remoteAddress?: string;
  remotePort?: number;
  error?: string;
}

/**
 * Result of a TURN allocation request
 */
export interface TURNResult {
  success: boolean;
  connectionType: CONNECTION_TYPE.TURN;
  relayedAddress?: string;
  relayedPort?: number;
  lifetime?: number;
  error?: string;
}

/**
 * UPnP client interface
 */
export interface UPnPClient {
  isAvailable(): Promise<boolean>;
  initialize(): Promise<boolean>;
  getExternalAddress(timeout?: number): Promise<string | null>;
  createPortMapping(options: {
    internalPort: number;
    externalPort?: number;
    protocol?: 'TCP' | 'UDP';
    description?: string;
    ttl?: number;
    timeout?: number;
  }): Promise<{
    success: boolean;
    externalPort?: number;
    externalAddress?: string;
    lifetime?: number;
    error?: string;
  }>;
  deletePortMapping(options: {
    externalPort: number;
    protocol?: 'TCP' | 'UDP';
    timeout?: number;
  }): Promise<boolean>;
}

/**
 * NAT-PMP client interface
 */
export interface NatPmpClient {
  createPortMapping(options: {
    internalPort: number;
    protocol: string;
    description?: string;
    timeout?: number;
  }): Promise<{
    success: boolean;
    externalPort: number;
    externalAddress: string;
    error?: string;
  }>;
  deletePortMapping(options: {
    externalPort: number;
    protocol: string;
  }): Promise<{
    success: boolean;
    error?: string;
  }>;
  getExternalAddress(): Promise<string | null>;
} 
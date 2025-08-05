/**
 * Registry Module Types
 * 
 * Type definitions for the connection registry module.
 */

import type { CONNECTION_TYPE } from '../../../types/constants';

/**
 * Registry entry interface
 */
export interface RegistryEntry {
  peerId: string;
  connectionType: CONNECTION_TYPE;
  address?: string;
  port?: number;
  lastSuccessTime: number;
  successCount: number;
  metadata?: Record<string, any>;
}

/**
 * Registry options interface
 */
export interface RegistryOptions {
  registryDir?: string;
  maxAgeDays?: number;
  cleanupInterval?: number;
}

/**
 * Connection method details
 */
export interface ConnectionMethodDetails {
  address?: string;
  port?: number;
  metadata?: Record<string, any>;
} 
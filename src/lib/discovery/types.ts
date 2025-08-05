/**
 * Central type definitions for the Discovery module
 * This file contains common types used across different discovery mechanisms
 */

/**
 * Status of peer content
 */
export enum PeerContentStatus {
  AVAILABLE = 'available',
  UNAVAILABLE = 'unavailable',
  CONNECTING = 'connecting',
  DOWNLOADING = 'downloading',
  UPLOADING = 'uploading',
  FAILED = 'failed',
  COMPLETED = 'completed'
}

/**
 * Source identifiers for discovered peers
 */
export const PEER_SOURCES = {
  DHT: 'dht',
  PEX: 'pex',
  LOCAL: 'local',
  GUN: 'gun',
  MANUAL: 'manual'
};

/**
 * Re-export peer-specific types to maintain a clean hierarchy
 */
export * from './peer/types'; 
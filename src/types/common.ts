/**
 * Common type definitions
 */

/**
 * Peer content status enum
 */
export enum PeerContentStatus {
  AVAILABLE = 'available',
  SUSPECT = 'suspect',
  UNAVAILABLE = 'unavailable'
}

/**
 * Content announcement interface
 */
export interface ContentAnnouncement {
  peerId: string;
  infoHash: string;
  port?: number;
  contentId?: string;
  timestamp: number;
  ttl?: number;
  signature?: string;
}

/**
 * Content report interface
 */
export interface ContentReport {
  reporterId: string;
  peerId: string;
  infoHash: string;
  status: PeerContentStatus;
  timestamp: number;
  signature?: string;
}

/**
 * Content verification result interface
 */
export interface ContentVerificationResult {
  peerId: string;
  infoHash: string;
  status: PeerContentStatus;
  timestamp: number;
  responseTime?: number;
  error?: string;
}

/**
 * Peer reputation interface
 */
export interface PeerReputation {
  peerId: string;
  score: number;
  lastUpdate: number;
  reports: {
    positive: number;
    negative: number;
  };
}

/**
 * Content mapping interface
 */
export interface ContentMapping {
  contentId: string;
  infoHash: string;
  timestamp: number;
  signature?: string;
} 
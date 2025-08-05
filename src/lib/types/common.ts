/**
 * Common type definitions for the Dig NAT Tools library
 */

/**
 * Signed data interface
 */
export interface SignedData<T> {
  data: T;
  signature: string;
  publicKey: string;
  timestamp: number;
}

/**
 * Content announcement data
 */
export interface ContentAnnouncement {
  hash: string;
  port?: number;
  contentId?: string;
  available: boolean;
  peerId: string;
}

/**
 * Content unavailability report
 */
export interface ContentReport {
  reporterId: string;
  reportedPeerId: string;
  contentHash: string;
  reason?: string;
}

/**
 * Content status enum
 */
export enum PeerContentStatus {
  AVAILABLE = 'available',
  SUSPECT = 'suspect',
  UNAVAILABLE = 'unavailable'
}

/**
 * Report level enum
 */
export enum ReportLevel {
  NONE = 'none',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

/**
 * Content verification result
 */
export enum VerificationResult {
  AVAILABLE = 'available',
  UNAVAILABLE = 'unavailable',
  TIMEOUT = 'timeout',
  ERROR = 'error'
}

/**
 * Content record stored in the manager
 */
export interface ContentRecord {
  peerId: string;
  hash: string;
  contentId?: string;
  status: PeerContentStatus;
  port?: number;
  lastUpdated: number;
  reports: SignedData<ContentReport>[];
  reportLevel: ReportLevel;
  verified?: boolean;
  publicKey: string;
} 
/**
 * UPnP Types
 * 
 * Type definitions for UPnP functionality with security and signaling support.
 */

import type { IGunInstance } from 'gun';
import type { CryptoIdentity } from '../../../crypto/identity';

/**
 * UPnP client interface
 */
export interface UPnPClient {
  createMapping(options: UPnPMappingOptions): Promise<UPnPResult>;
  deleteMapping(options: UPnPMappingOptions): Promise<UPnPResult>;
  getExternalAddress(): Promise<string | null>;
  getMappings(): Promise<UPnPMapping[]>;
  close(): void;
  on(event: 'error' | 'warning' | 'status', listener: (data: any) => void): this;
  off(event: 'error' | 'warning' | 'status', listener: (data: any) => void): this;
}

/**
 * UPnP mapping options
 */
export interface UPnPMappingOptions {
  protocol: 'TCP' | 'UDP';
  internalPort: number;
  externalPort: number;
  description?: string;
  ttl?: number;
  security?: UPnPSecurityOptions;
  signaling?: UPnPSignalingOptions;
}

/**
 * UPnP mapping entry
 */
export interface UPnPMapping {
  protocol: 'TCP' | 'UDP';
  internalPort: number;
  externalPort: number;
  remoteHost?: string;
  description?: string;
  ttl: number;
  enabled: boolean;
  secure: boolean;
  lastVerified?: number;
}

/**
 * UPnP result interface
 */
export interface UPnPResult {
  success: boolean;
  externalPort?: number;
  externalAddress?: string;
  lifetime?: number;
  error?: string;
  details?: {
    secure: boolean;
    signaling?: {
      channel?: string;
      latency?: number;
    };
    verification?: {
      lastChecked: number;
      method: 'direct' | 'peer' | 'stun';
    };
  };
}

/**
 * UPnP security options
 */
export interface UPnPSecurityOptions {
  requireEncryption?: boolean;
  validateSignature?: boolean;
  allowLoopback?: boolean;
  allowPrivateNetwork?: boolean;
  maxTTL?: number;
  minTTL?: number;
  maxMappings?: number;
  allowedProtocols?: ('TCP' | 'UDP')[];
  allowedPorts?: {
    min: number;
    max: number;
  };
  identity?: CryptoIdentity;
}

/**
 * UPnP signaling options
 */
export interface UPnPSignalingOptions {
  gun: IGunInstance;
  peerId: string;
  room?: string;
  channelPrefix?: string;
  verificationInterval?: number;
  peerTimeout?: number;
}

/**
 * UPnP signaling message
 */
export interface UPnPSignalingMessage {
  type: 'mapping-request' | 'mapping-response' | 'verification-request' | 'verification-response';
  from: string;
  to?: string;
  mapping?: UPnPMapping;
  result?: UPnPResult;
  timestamp: number;
  signature?: string;
  encrypted?: boolean;
}

/**
 * UPnP status
 */
export enum UPnPStatus {
  IDLE = 'idle',
  DISCOVERING = 'discovering',
  READY = 'ready',
  MAPPING = 'mapping',
  VERIFYING = 'verifying',
  ERROR = 'error'
} 
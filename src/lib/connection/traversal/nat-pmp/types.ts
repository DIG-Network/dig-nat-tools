/**
 * NAT-PMP Types
 * 
 * Type definitions for NAT Port Mapping Protocol functionality.
 */

/**
 * NAT-PMP client interface
 */
export interface NATPMPClient {
  createMapping(options: NATPMPMappingOptions): Promise<NATPMPResult>;
  deleteMapping(options: NATPMPMappingOptions): Promise<NATPMPResult>;
  getExternalAddress(): Promise<string | null>;
  close(): void;
}

/**
 * NAT-PMP mapping options
 */
export interface NATPMPMappingOptions {
  protocol: 'TCP' | 'UDP';
  internalPort: number;
  externalPort: number;
  ttl?: number;
}

/**
 * NAT-PMP result interface
 */
export interface NATPMPResult {
  success: boolean;
  externalPort?: number;
  externalAddress?: string;
  lifetime?: number;
  error?: string;
}

/**
 * NAT-PMP error codes
 */
export enum NATPMPErrorCode {
  UNSUPPORTED_VERSION = 1,
  NOT_AUTHORIZED = 2,
  NETWORK_FAILURE = 3,
  OUT_OF_RESOURCES = 4,
  UNSUPPORTED_OPCODE = 5
} 
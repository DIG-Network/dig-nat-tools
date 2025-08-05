/**
 * Types for the transport module
 */

import type { CONNECTION_TYPE } from '../../types/constants';
import type { Connection } from '../types/connection';
import type * as dgram from 'dgram';
import type * as net from 'net';

/**
 * Options for downloading files
 */
export interface DownloadOptions {
  /** Path where the file should be saved */
  savePath: string;
  /** Optional starting chunk for resuming downloads */
  startChunk?: number;
  /** Optional callback for progress updates */
  onProgress?: (progress: number, totalSize: number) => void;
}

/**
 * Interface for file connection configuration
 */
export interface FileConnectionConfig {
  /** Type of connection */
  type: CONNECTION_TYPE;
  /** IP address or hostname */
  address?: string;
  /** Port number */
  port?: number;
}

/**
 * Interface for file client configuration
 */
export interface FileClientConfig {
  /** Chunk size in bytes */
  chunkSize?: number;
  /** STUN servers for WebRTC */
  stunServers?: string[];
  /** Request timeout in milliseconds */
  requestTimeout?: number;
  /** Whether to enable WebRTC */
  enableWebRTC?: boolean;
  /** Whether to enable NAT-PMP */
  enableNATPMP?: boolean;
  /** Whether to enable IPv6 */
  enableIPv6?: boolean;
  /** Whether to prefer IPv6 over IPv4 */
  preferIPv6?: boolean;
  /** Port mapping lifetime in seconds */
  portMappingLifetime?: number;
  /** Existing Gun instance */
  gunInstance?: any;
  /** Gun options */
  gunOptions?: Record<string, any>;
  /** Existing socket from NAT traversal */
  existingSocket?: net.Socket | dgram.Socket;
  /** Connection type */
  connectionType?: CONNECTION_TYPE;
  /** Remote address */
  remoteAddress?: string | null;
  /** Remote port */
  remotePort?: number | null;
}

/**
 * Interface for pipeline request options
 */
export interface PipelineRequestOptions {
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Interface for file metadata
 */
export interface FileMetadata {
  /** Total file size in bytes */
  totalBytes: number;
  /** Total number of chunks */
  totalChunks: number;
  /** Hash of the file */
  sha256: string;
  /** Optional file name */
  fileName?: string;
  /** Optional MIME type */
  mimeType?: string;
} 
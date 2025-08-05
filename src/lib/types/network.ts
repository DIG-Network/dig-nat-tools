/**
 * Common network types for the Dig NAT Tools system
 */

import type * as net from 'net';
import type * as dgram from 'dgram';
import type { CONNECTION_TYPE } from './constants';

/**
 * Socket types for TCP and UDP
 */
export type SocketType = 'tcp4' | 'tcp6' | 'udp4' | 'udp6';

/**
 * Connection options for network operations
 */
export interface ConnectionOptions {
  /** Connection timeout in milliseconds */
  timeout?: number;
  /** Whether to prefer IPv6 over IPv4 */
  preferIPv6?: boolean;
  /** Whether to enable IPv6 support */
  enableIPv6?: boolean;
  /** Callback when connection is established */
  onConnection?: (socket: net.Socket | dgram.Socket, address: string) => void;
  /** Callback when connection error occurs */
  onError?: (error: Error, address: string) => void;
}

/**
 * Network connection result
 */
export interface NetworkConnectionResult {
  /** Connected socket */
  socket: net.Socket | dgram.Socket;
  /** Remote address */
  address: string;
  /** Remote port */
  port: number;
  /** Socket type used for connection */
  socketType: SocketType;
  /** Connection type established */
  connectionType: CONNECTION_TYPE;
}

/**
 * Configuration for the NetworkManager
 */
export interface NetworkManagerConfig {
  /** Whether to enable IPv6 support */
  enableIPv6?: boolean;
  /** Whether to prefer IPv6 over IPv4 */
  preferIPv6?: boolean;
  /** Whether to enable TCP support */
  enableTCP?: boolean;
  /** Whether to enable UDP support */
  enableUDP?: boolean;
  /** TCP port to listen on (0 for random) */
  tcpPort?: number;
  /** UDP port to listen on (0 for random) */
  udpPort?: number;
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
  /** Whether to reuse address */
  reuseAddr?: boolean;
  /** TCP server backlog */
  backlog?: number;
} 
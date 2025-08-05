/**
 * Transport Module
 * 
 * This module provides transport layer functionality for the Dig NAT Tools system,
 * including file transfer, connection management, and network utilities.
 */

// Export main components
export { default as FileClient } from './client';
export { default as FileHost } from './host';

// Export types
export { DownloadOptions } from './types';

// Export utility functions - selectively export to avoid naming conflicts
export {
  // From dual-stack.ts
  createDualStackSocket,
  connectWithIPv6Preference,
  connectToFirstAvailableAddress,
  getSocketTypeForAddress,
  getBindAddressForSocketType,
  SocketType,
} from './utils/dual-stack';

export {
  // From ip-helper.ts
  IPVersion,
  NetworkInterfaceInfo,
  isIPv4,
  isIPv6,
  isLinkLocalIPv6,
  getInterfaceFamily,
  collectIPAddresses,
  getPreferredIPs,
} from './utils/ip-helper';

export {
  // From network.ts
  discoverPublicIPs,
  createPortMapping,
  deletePortMapping,
  DEFAULT_STUN_SERVERS,
  IPAddresses,
  PortMappingResult,
} from './utils/network';

// Re-export types
export interface TransportOptions {
  // Basic options
  stunServers?: string[];
  chunkSize?: number;
  concurrency?: number;
  enableIPv6?: boolean;
  preferIPv6?: boolean;
  
  // Host-specific options
  hostId?: string;
  tcpPort?: number;
  udpPort?: number;
  
  // Client-specific options
  clientId?: string;
  requestTimeout?: number;
  
  // NAT traversal options
  enableNATPMP?: boolean;
  portMappingLifetime?: number;
  
  // Connection types
  enableTCP?: boolean;
  enableUDP?: boolean;
  enableWebRTC?: boolean;
  enableGunRelay?: boolean;
}

/**
 * Connection types supported by the transport system
 */
export enum CONNECTION_TYPE {
  TCP = 'tcp',
  UDP = 'udp',
  WEBRTC = 'webrtc',
  GUN = 'gun'
}

/**
 * Node types for transport capabilities
 */
export enum NODE_TYPE {
  LIGHT = 'light',     // Minimal capabilities
  STANDARD = 'standard', // Standard capabilities
  SUPER = 'super'      // Enhanced capabilities
}

/**
 * Connection interface
 */
export interface Connection {
  type: CONNECTION_TYPE;
  peerId: string;
  send: (messageType: string, data: any) => Promise<void>;
  on: (messageType: string, handler: (data: any) => void) => void;
  close: () => void;
  removeListener: (messageType: string, handler: (data: any) => void) => void;
}

/**
 * Create a transport system with both client and host capabilities
 * @param options Transport options
 * @returns Object with file client and host
 */
export function createTransportSystem(options: TransportOptions = {}) {
  const FileClient = require('./client').default;
  const FileHost = require('./host').default;
  
  const client = new FileClient({
    stunServers: options.stunServers,
    chunkSize: options.chunkSize,
    enableIPv6: options.enableIPv6,
    preferIPv6: options.preferIPv6,
    requestTimeout: options.requestTimeout,
    enableWebRTC: options.enableWebRTC,
    enableNATPMP: options.enableNATPMP,
    portMappingLifetime: options.portMappingLifetime,
  });
  
  const host = new FileHost({
    hostId: options.hostId,
    stunServers: options.stunServers,
    chunkSize: options.chunkSize,
    tcpPort: options.tcpPort,
    udpPort: options.udpPort,
    enableTCP: options.enableTCP,
    enableUDP: options.enableUDP,
    enableWebRTC: options.enableWebRTC,
    enableIPv6: options.enableIPv6,
    enableNATPMP: options.enableNATPMP,
  });
  
  return {
    client,
    host,
    async start() {
      await host.start();
      // Client doesn't need explicit start
      return { 
        tcpPort: host.getTcpPort(),
        udpPort: host.getUdpPort(),
        hostId: host.getHostId()
      };
    },
    async stop() {
      await Promise.all([
        host.stop(),
        client.stop()
      ]);
    }
  };
}

/**
 * Create a transport client
 * @param options Client options
 * @returns Configured file client
 */
export function createClient(options: TransportOptions = {}) {
  const FileClient = require('./client').default;
  return new FileClient({
    stunServers: options.stunServers,
    chunkSize: options.chunkSize,
    enableIPv6: options.enableIPv6,
    preferIPv6: options.preferIPv6,
    requestTimeout: options.requestTimeout,
    enableWebRTC: options.enableWebRTC,
    enableNATPMP: options.enableNATPMP,
    portMappingLifetime: options.portMappingLifetime,
  });
}

/**
 * Create a transport host
 * @param options Host options
 * @returns Configured file host
 */
export function createHost(options: TransportOptions = {}) {
  const FileHost = require('./host').default;
  return new FileHost({
    hostId: options.hostId,
    stunServers: options.stunServers,
    chunkSize: options.chunkSize,
    tcpPort: options.tcpPort,
    udpPort: options.udpPort,
    enableTCP: options.enableTCP,
    enableUDP: options.enableUDP,
    enableWebRTC: options.enableWebRTC,
    enableIPv6: options.enableIPv6,
    enableNATPMP: options.enableNATPMP,
  });
} 
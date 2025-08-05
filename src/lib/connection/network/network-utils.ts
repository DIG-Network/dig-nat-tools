/**
 * Network Connection Utilities
 * 
 * Provides network connection utilities for the Dig NAT Tools system.
 * This module includes IPv4/IPv6 dual-stack support, socket creation,
 * and connection establishment functions.
 */

import * as net from 'net';
import * as dgram from 'dgram';
import Debug from 'debug';
import { 
  isIPv4,
  isIPv6,
  isPrivateIP,
  isLinkLocalIPv6,
  sortIPAddressesByPreference,
  collectIPAddresses
} from '../../utils/ip-helper';
import type {
  SocketType,
  ConnectionOptions,
  NetworkConnectionResult
} from '../../types/network';
import { CONNECTION_TYPE } from '../../../types/constants';

const debug = Debug('dig-nat-tools:connection:network');

// Export types from common types file
export type { SocketType, ConnectionOptions, NetworkConnectionResult };

/**
 * Get the appropriate socket type based on address and protocol
 * @param address - IP address to connect to
 * @param protocol - Protocol ('tcp' or 'udp')
 * @param preferIPv6 - Whether to prefer IPv6 when address format is unknown
 * @returns Socket type based on address format
 */
export function getSocketTypeForAddress(
  address: string, 
  protocol: 'tcp' | 'udp', 
  preferIPv6: boolean = true
): SocketType {
  if (isIPv6(address)) {
    return protocol === 'tcp' ? 'tcp6' : 'udp6';
  } else if (isIPv4(address)) {
    return protocol === 'tcp' ? 'tcp4' : 'udp4';
  } else {
    // Default when format is unclear
    if (preferIPv6) {
      return protocol === 'tcp' ? 'tcp6' : 'udp6';
    } else {
      return protocol === 'tcp' ? 'tcp4' : 'udp4';
    }
  }
}

/**
 * Get the appropriate bind address for a socket type
 * @param socketType - Type of socket ('udp4', 'udp6', etc.)
 * @returns Bind address ('0.0.0.0' for IPv4, '::' for IPv6)
 */
export function getBindAddressForSocketType(socketType: SocketType): string {
  if (socketType === 'tcp6' || socketType === 'udp6') {
    return '::';  // IPv6 wildcard address (binds to all interfaces)
  } else {
    return '0.0.0.0';  // IPv4 wildcard address (binds to all interfaces)
  }
}

/**
 * Create a dual-stack socket that attempts IPv6 first and falls back to IPv4
 * @param protocol - Protocol to use ('tcp' or 'udp')
 * @returns A socket of the appropriate type
 */
export function createDualStackSocket(protocol: 'tcp' | 'udp'): dgram.Socket | net.Server {
  // Check if IPv6 is supported on this system by looking for any IPv6 addresses
  const ipAddresses = collectIPAddresses({ enableIPv6: true });
  const hasIPv6Support = ipAddresses.ipv6.length > 0;
  
  debug(`Creating dual-stack ${protocol} socket, IPv6 support: ${hasIPv6Support}`);
  
  try {
    if (protocol === 'udp') {
      const socketOptions: dgram.SocketOptions = hasIPv6Support 
        ? { type: 'udp6', ipv6Only: false, reuseAddr: true }
        : { type: 'udp4', reuseAddr: true };
      
      return dgram.createSocket(socketOptions);
    } else { // tcp
      const server = net.createServer();
      
      // Set dual-stack options when listening
      server.on('listening', () => {
        debug(`TCP server listening in dual-stack mode, IPv6 support: ${hasIPv6Support}`);
      });
      
      return server;
    }
  } catch (error) {
    // If dual-stack fails, fall back to IPv4
    debug(`Failed to create dual-stack socket, falling back to IPv4: ${(error as Error).message}`);
    
    if (protocol === 'udp') {
      return dgram.createSocket({ type: 'udp4', reuseAddr: true });
    } else { // tcp
      return net.createServer();
    }
  }
}

/**
 * Connect to a peer with IPv6 preference and IPv4 fallback
 * @param address - Peer address (can be IPv4 or IPv6)
 * @param port - Port to connect to
 * @param protocol - 'tcp' or 'udp'
 * @param options - Connection options
 * @returns Promise resolving to connected socket and address info
 */
export async function connectWithIPv6Preference(
  address: string,
  port: number,
  protocol: 'tcp' | 'udp',
  options: ConnectionOptions = {}
): Promise<NetworkConnectionResult> {
  const timeout = options.timeout || 10000; // Default 10 second timeout
  
  debug(`Connecting to ${address}:${port} via ${protocol}`);
  
  // Check if IPv6 is supported on this system
  const ipAddresses = collectIPAddresses({ enableIPv6: true });
  const hasIPv6Support = ipAddresses.ipv6.length > 0;
  
  // Check if the address is private and log it
  if (isPrivateIP(address)) {
    debug(`Address ${address} is a private IP address`);
  }
  
  // Check if IPv6 address is link-local
  if (isIPv6(address) && isLinkLocalIPv6(address)) {
    debug(`Address ${address} is an IPv6 link-local address`);
  }
  
  // If IPv6 address is provided, use it directly
  if (isIPv6(address)) {
    if (protocol === 'tcp') {
      const socket = await createTCPConnection(address, port, 'tcp6', timeout, options.onError, options.onConnection);
      return { 
        socket, 
        address, 
        port, 
        socketType: 'tcp6',
        connectionType: CONNECTION_TYPE.TCP
      };
    } else {
      const socket = createUDPConnection(address, port, 'udp6');
      return { 
        socket, 
        address, 
        port, 
        socketType: 'udp6',
        connectionType: CONNECTION_TYPE.UDP
      };
    }
  } 
  // For IPv4 address or unclear format, try IPv6 first if supported
  else {
    if (!hasIPv6Support) {
      debug('IPv6 not supported on this system, using IPv4');
      if (protocol === 'tcp') {
        const socket = await createTCPConnection(address, port, 'tcp4', timeout, options.onError, options.onConnection);
        return { 
          socket, 
          address, 
          port, 
          socketType: 'tcp4',
          connectionType: CONNECTION_TYPE.TCP
        };
      } else {
        const socket = createUDPConnection(address, port, 'udp4');
        return { 
          socket, 
          address, 
          port, 
          socketType: 'udp4',
          connectionType: CONNECTION_TYPE.UDP
        };
      }
    }
    
    debug(`Attempting IPv6 connection first for ${address}:${port}`);
    if (protocol === 'tcp') {
      try {
        const socket = await createTCPConnection(address, port, 'tcp6', timeout/2, options.onError, options.onConnection);
        return { 
          socket, 
          address, 
          port, 
          socketType: 'tcp6',
          connectionType: CONNECTION_TYPE.TCP
        };
      } catch (error) {
        debug(`IPv6 TCP connection failed, falling back to IPv4: ${(error as Error).message}`);
        const socket = await createTCPConnection(address, port, 'tcp4', timeout/2, options.onError, options.onConnection);
        return { 
          socket, 
          address, 
          port, 
          socketType: 'tcp4',
          connectionType: CONNECTION_TYPE.TCP
        };
      }
    } else {
      try {
        const socket = createUDPConnection(address, port, 'udp6');
        return { 
          socket, 
          address, 
          port, 
          socketType: 'udp6',
          connectionType: CONNECTION_TYPE.UDP
        };
      } catch (error) {
        debug(`IPv6 UDP connection failed, falling back to IPv4: ${(error as Error).message}`);
        const socket = createUDPConnection(address, port, 'udp4');
        return { 
          socket, 
          address, 
          port, 
          socketType: 'udp4',
          connectionType: CONNECTION_TYPE.UDP
        };
      }
    }
  }
}

/**
 * Connect to the first available address from a list of addresses
 * @param addresses - List of IP addresses to try
 * @param port - Port to connect to
 * @param protocol - 'tcp' or 'udp'
 * @param options - Connection options
 * @returns Promise resolving to connected socket and address info
 */
export async function connectToFirstAvailableAddress(
  addresses: string[],
  port: number,
  protocol: 'tcp' | 'udp',
  options: ConnectionOptions = {}
): Promise<NetworkConnectionResult> {
  const timeout = options.timeout || 10000;
  const preferIPv6 = options.preferIPv6 !== false;
  
  // Filter out invalid addresses
  const validAddresses = addresses.filter(addr => isIPv4(addr) || isIPv6(addr));
  
  if (validAddresses.length === 0) {
    throw new Error('No valid IP addresses provided for connection attempt');
  }
  
  // Sort addresses by preference (IPv6 first if preferred)
  const sortedAddresses = sortIPAddressesByPreference(validAddresses, preferIPv6);
  
  debug(`Attempting to connect to ${sortedAddresses.length} addresses (${protocol}), IPv6 ${preferIPv6 ? 'preferred' : 'not preferred'}`);
  
  // For a single address, try direct connection with IPv6 preference
  if (sortedAddresses.length === 1) {
    return connectWithIPv6Preference(sortedAddresses[0], port, protocol, options);
  }
  
  // Try connecting to each address sequentially
  let lastError: Error | null = null;
  
  for (const address of sortedAddresses) {
    try {
      debug(`Trying connection to ${address}:${port} (${protocol})`);
      
      const socketType = getSocketTypeForAddress(address, protocol, preferIPv6);
      
      if (protocol === 'tcp') {
        const socket = await createTCPConnection(
          address, 
          port, 
          socketType as 'tcp4' | 'tcp6', 
          timeout / sortedAddresses.length, // Divide timeout among all attempts
          options.onError,
          socket => options.onConnection?.(socket, address)
        );
        return { 
          socket, 
          address, 
          port, 
          socketType,
          connectionType: CONNECTION_TYPE.TCP
        };
      } else {
        const socket = createUDPConnection(address, port, socketType as 'udp4' | 'udp6');
        if (options.onConnection) {
          options.onConnection(socket, address);
        }
        return { 
          socket, 
          address, 
          port, 
          socketType,
          connectionType: CONNECTION_TYPE.UDP
        };
      }
    } catch (error) {
      lastError = error as Error;
      if (options.onError) {
        options.onError(error as Error, address);
      }
      debug(`Connection to ${address}:${port} failed: ${(error as Error).message}`);
    }
  }
  
  // If we get here, all connection attempts failed
  throw new Error(`Failed to connect to any address: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Create a TCP connection
 * @param host - Host address
 * @param port - Port number
 * @param socketType - Socket type ('tcp4' or 'tcp6')
 * @param timeout - Connection timeout in milliseconds
 * @param onError - Optional error callback
 * @param onConnection - Optional connection callback
 * @returns Promise resolving to connected socket
 */
export function createTCPConnection(
  host: string,
  port: number,
  socketType: 'tcp4' | 'tcp6',
  timeout: number,
  onError?: (error: Error, address: string) => void,
  onConnection?: (socket: net.Socket, address: string) => void
): Promise<net.Socket> {
  return new Promise<net.Socket>((resolve, reject) => {
    // Create socket with the appropriate family
    const socket = new net.Socket();
    
    let timeoutId: NodeJS.Timeout | null = null;
    
    // Set up timeout
    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Connection to ${host}:${port} timed out after ${timeout}ms`));
      }, timeout);
    }
    
    // Connection event handler
    socket.once('connect', () => {
      if (timeoutId) clearTimeout(timeoutId);
      
      if (onConnection) {
        try {
          onConnection(socket, host);
        } catch (error) {
          debug(`Error in onConnection callback: ${(error as Error).message}`);
        }
      }
      
      resolve(socket);
    });
    
    // Error event handler
    socket.once('error', (err) => {
      if (timeoutId) clearTimeout(timeoutId);
      
      if (onError) {
        try {
          onError(err, host);
        } catch (error) {
          debug(`Error in onError callback: ${(error as Error).message}`);
        }
      }
      
      socket.destroy();
      reject(err);
    });
    
    // Start the connection attempt with the appropriate family
    const connectOptions = {
      port,
      host,
      family: socketType === 'tcp6' ? 6 : 4
    };
    socket.connect(connectOptions);
  });
}

/**
 * Create a UDP "connection" (association)
 * @param host - Host address
 * @param port - Port number
 * @param socketType - Socket type ('udp4' or 'udp6')
 * @returns UDP socket
 */
export function createUDPConnection(
  host: string,
  port: number,
  socketType: 'udp4' | 'udp6'
): dgram.Socket {
  try {
    // Create a UDP socket with the appropriate family
    const socket = dgram.createSocket({ type: socketType, reuseAddr: true });
    
    // Bind to a random port
    socket.bind();
    
    // Send a test packet to establish the association
    const testPacket = Buffer.from('CONN_TEST');
    socket.send(testPacket, 0, testPacket.length, port, host);
    
    debug(`Created UDP ${socketType} association to ${host}:${port}`);
    return socket;
  } catch (error) {
    debug(`Failed to create UDP ${socketType} association: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * Create a UDP socket bound to a specific port
 * @param port - Port to bind to (0 for random)
 * @param options - Socket options
 * @returns Bound UDP socket
 */
export function createUDPSocketBound(
  port: number = 0,
  options: {
    enableIPv6?: boolean;
    ipv6Only?: boolean;
    reuseAddr?: boolean;
    bindAddress?: string;
  } = {}
): Promise<dgram.Socket> {
  const enableIPv6 = options.enableIPv6 !== false;
  const ipv6Only = options.ipv6Only === true;
  const reuseAddr = options.reuseAddr !== false;
  
  return new Promise<dgram.Socket>((resolve, reject) => {
    try {
      // Create the socket with proper type
      const socket = dgram.createSocket({
        type: enableIPv6 ? 'udp6' : 'udp4',
        reuseAddr,
        ipv6Only: enableIPv6 ? ipv6Only : undefined
      });
      
      // Handle errors
      socket.once('error', (err) => {
        debug(`UDP socket creation error: ${err.message}`);
        socket.close();
        reject(err);
      });
      
      // Set bind address, using custom or appropriate wildcard
      let bindAddress = options.bindAddress;
      if (!bindAddress) {
        if (enableIPv6) {
          bindAddress = '::'; // IPv6 wildcard
        } else {
          bindAddress = '0.0.0.0'; // IPv4 wildcard
        }
      } else {
        // Validate bind address
        if (enableIPv6 && !isIPv6(bindAddress)) {
          debug(`Warning: binding IPv6 socket to non-IPv6 address: ${bindAddress}`);
        } else if (!enableIPv6 && !isIPv4(bindAddress)) {
          debug(`Warning: binding IPv4 socket to non-IPv4 address: ${bindAddress}`);
        }
      }
      
      // Bind the socket
      socket.bind(port, bindAddress, () => {
        debug(`UDP socket bound to ${bindAddress}:${socket.address().port}`);
        resolve(socket);
      });
    } catch (error) {
      debug(`Error creating UDP socket: ${(error as Error).message}`);
      reject(error);
    }
  });
}

/**
 * Create a TCP server bound to a specific port
 * @param port - Port to bind to (0 for random)
 * @param options - Server options
 * @returns Promise resolving to the bound server
 */
export function createTCPServerBound(
  port: number = 0,
  options: {
    enableIPv6?: boolean;
    ipv6Only?: boolean;
    bindAddress?: string;
    backlog?: number;
  } = {}
): Promise<net.Server> {
  const enableIPv6 = options.enableIPv6 !== false;
  const ipv6Only = options.ipv6Only === true;
  const backlog = options.backlog || 511;
  
  return new Promise<net.Server>((resolve, reject) => {
    try {
      // Create the server
      const server = net.createServer();
      
      // Handle errors
      server.once('error', (err) => {
        debug(`TCP server creation error: ${err.message}`);
        server.close();
        reject(err);
      });
      
      // Set bind address, using custom or appropriate wildcard
      let bindAddress = options.bindAddress;
      if (!bindAddress) {
        if (enableIPv6) {
          bindAddress = '::'; // IPv6 wildcard
        } else {
          bindAddress = '0.0.0.0'; // IPv4 wildcard
        }
      } else {
        // Validate bind address
        if (enableIPv6 && !isIPv6(bindAddress)) {
          debug(`Warning: binding IPv6 server to non-IPv6 address: ${bindAddress}`);
        } else if (!enableIPv6 && !isIPv4(bindAddress)) {
          debug(`Warning: binding IPv4 server to non-IPv4 address: ${bindAddress}`);
        }
      }
      
      // Set IPv6 only if requested
      if (enableIPv6 && ipv6Only) {
        server.on('listening', () => {
          try {
            // Set IPv6 only
            (server as any).setIPv6Only?.(true);
          } catch (error) {
            debug(`Failed to set IPv6 only: ${(error as Error).message}`);
          }
        });
      }
      
      // Listen on the specified port
      server.listen(port, bindAddress, backlog, () => {
        debug(`TCP server listening on ${bindAddress}:${(server.address() as net.AddressInfo).port}`);
        resolve(server);
      });
    } catch (error) {
      debug(`Error creating TCP server: ${(error as Error).message}`);
      reject(error);
    }
  });
} 
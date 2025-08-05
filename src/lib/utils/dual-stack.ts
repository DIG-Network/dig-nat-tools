/**
 * Dual-stack (IPv6/IPv4) utility functions
 * Provides helper functions for prioritizing IPv6 when available
 * with automatic fallback to IPv4 when necessary
 */

import * as os from 'os';
import * as dgram from 'dgram';
import * as net from 'net';
import * as ip from 'ip';
import Debug from 'debug';

// Configure debug logger
const debug = Debug('dig-nat-tools:utils:dual-stack');

/**
 * Interface for network interface info that handles both string and number family types
 */
interface NetworkInterfaceInfo {
  address: string;
  netmask: string;
  family: string | number;
  mac: string;
  internal: boolean;
  cidr: string | null;
  scopeid?: number;
}

/**
 * Socket types for TCP and UDP
 */
export type SocketType = 'tcp4' | 'tcp6' | 'udp4' | 'udp6';

/**
 * Determine the IP version of an address
 * @param address - IP address to check
 * @returns 'IPv6', 'IPv4', or null if invalid
 */
export function getIPVersion(address: string): 'IPv6' | 'IPv4' | null {
  if (!address) {
    return null;
  }

  // IPv6 addresses contain colons
  if (address.includes(':')) {
    // Basic IPv6 validation
    const segments = address.split(':').filter(Boolean);
    if (segments.length > 0 && segments.length <= 8) {
      return 'IPv6';
    }
  } 
  // IPv4 addresses contain dots
  else if (address.includes('.')) {
    // Basic IPv4 validation
    const segments = address.split('.');
    if (segments.length === 4 && segments.every(s => {
      const num = parseInt(s, 10);
      return !isNaN(num) && num >= 0 && num <= 255;
    })) {
      return 'IPv4';
    }
  }
  
  return null;
}

/**
 * Sort IP addresses with IPv6 prioritized
 * @param addresses - Array of IP addresses
 * @returns Sorted array with IPv6 addresses first, then IPv4
 */
export function sortIPAddressesByPreference(addresses: string[]): string[] {
  return [...addresses].sort((a, b) => {
    const aVersion = getIPVersion(a);
    const bVersion = getIPVersion(b);
    
    // Invalid addresses go last
    if (!aVersion) return 1;
    if (!bVersion) return -1;
    
    // IPv6 comes before IPv4
    if (aVersion === 'IPv6' && bVersion === 'IPv4') return -1;
    if (aVersion === 'IPv4' && bVersion === 'IPv6') return 1;
    
    // Same version, keep original order
    return 0;
  });
}

/**
 * Create appropriate socket type based on address format
 * @param address - IP address to connect to
 * @param protocol - Protocol ('tcp' or 'udp')
 * @param preferIPv6 - Whether to prefer IPv6 when address format is unknown
 * @returns Socket type ('udp4', 'udp6', 'tcp4', 'tcp6') based on address
 */
export function getSocketTypeForAddress(
  address: string, 
  protocol: 'tcp' | 'udp', 
  preferIPv6: boolean = true
): SocketType {
  const ipVersion = getIPVersion(address);
  
  if (ipVersion === 'IPv6') {
    return protocol === 'tcp' ? 'tcp6' : 'udp6';
  } else if (ipVersion === 'IPv4') {
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
 * Determine the appropriate bind address based on socket type
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
 * Check if an IP address is likely to be private/internal
 * @param ipAddress - The IP address to check
 * @returns True if the IP is private/internal
 */
export function isPrivateIP(ipAddress: string): boolean {
  try {
    return ip.isPrivate(ipAddress);
  } catch (err) {
    debug(`Error checking if IP is private: ${(err as Error).message}`);
    // Default to true (assume private) if there's an error
    return true;
  }
}

/**
 * Create a dual-stack socket that attempts IPv6 first and falls back to IPv4
 * @param protocol - Protocol to use ('tcp' or 'udp')
 * @returns A socket of the appropriate type
 */
export function createDualStackSocket(protocol: 'tcp' | 'udp'): dgram.Socket | net.Server {
  // Determine if IPv6 is supported on this system
  const hasIPv6Support = Object.values(os.networkInterfaces()).some(iface => {
    return iface?.some(info => {
      // Type-safe check for family property across different Node.js versions
      if (!info) return false;
      
      // Type guard function for checking IPv6 family
      const isIPv6Family = (family: string | number): boolean => {
        return family === 'IPv6' || family === 6 || family === '6';
      };
      
      return isIPv6Family(info.family);
    });
  });
  
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
 * @param port - Peer port
 * @param protocol - 'tcp' or 'udp'
 * @param options - Connection options
 * @returns Promise resolving to connected socket
 */
export async function connectWithIPv6Preference(
  address: string,
  port: number,
  protocol: 'tcp' | 'udp',
  options: {
    timeout?: number,
    onError?: (error: Error) => void,
    onConnection?: (socket: net.Socket | dgram.Socket) => void
  } = {}
): Promise<net.Socket | dgram.Socket> {
  const timeout = options.timeout || 10000; // Default 10 second timeout
  const ipVersion = getIPVersion(address);
  
  debug(`Connecting to ${address}:${port} via ${protocol}, detected IP version: ${ipVersion}`);
  
  // If IPv6, try IPv6 directly
  if (ipVersion === 'IPv6') {
    if (protocol === 'tcp') {
      return createTCPConnection(address, port, 'tcp6', timeout, options.onError, options.onConnection);
    } else {
      return createUDPConnection(address, port, 'udp6');
    }
  } 
  // If IPv4, try IPv4 directly
  else if (ipVersion === 'IPv4') {
    if (protocol === 'tcp') {
      return createTCPConnection(address, port, 'tcp4', timeout, options.onError, options.onConnection);
    } else {
      return createUDPConnection(address, port, 'udp4');
    }
  } 
  // If unclear, try IPv6 first then fall back to IPv4
  else {
    if (protocol === 'tcp') {
      try {
        debug(`Attempting IPv6 TCP connection to ${address}:${port}`);
        return await createTCPConnection(address, port, 'tcp6', timeout/2, options.onError, options.onConnection);
      } catch (error) {
        debug(`IPv6 TCP connection failed, falling back to IPv4: ${(error as Error).message}`);
        return createTCPConnection(address, port, 'tcp4', timeout/2, options.onError, options.onConnection);
      }
    } else {
      try {
        debug(`Attempting IPv6 UDP connection to ${address}:${port}`);
        return createUDPConnection(address, port, 'udp6');
      } catch (error) {
        debug(`IPv6 UDP connection failed, falling back to IPv4: ${(error as Error).message}`);
        return createUDPConnection(address, port, 'udp4');
      }
    }
  }
}

/**
 * Create a TCP connection with specific socket type
 * @param host - Host to connect to
 * @param port - Port to connect to
 * @param socketType - Socket type ('tcp4' or 'tcp6')
 * @param timeout - Connection timeout in ms
 * @param onError - Optional error callback
 * @param onConnection - Optional connection callback
 * @returns Promise resolving to connected socket
 */
function createTCPConnection(
  host: string,
  port: number,
  socketType: 'tcp4' | 'tcp6',
  timeout: number,
  onError?: (error: Error) => void,
  onConnection?: (socket: net.Socket) => void
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const family = socketType === 'tcp6' ? 6 : 4;
    debug(`Creating ${socketType} connection to ${host}:${port}`);
    
    const socket = net.createConnection({ host, port, family }, () => {
      debug(`${socketType} connection established to ${host}:${port}`);
      if (onConnection) {
        onConnection(socket);
      }
      resolve(socket);
    });
    
    socket.on('error', (err) => {
      debug(`${socketType} connection error: ${err.message}`);
      if (onError) {
        onError(err);
      }
      reject(err);
    });
    
    // Set connection timeout
    socket.setTimeout(timeout);
    socket.on('timeout', () => {
      const timeoutError = new Error(`Connection to ${host}:${port} timed out after ${timeout}ms`);
      socket.destroy(timeoutError);
      reject(timeoutError);
    });
  });
}

/**
 * Create a UDP socket with specific socket type
 * @param host - Host to connect to
 * @param port - Port to connect to
 * @param socketType - Socket type ('udp4' or 'udp6')
 * @returns UDP Socket
 */
function createUDPConnection(
  host: string,
  port: number,
  socketType: 'udp4' | 'udp6'
): dgram.Socket {
  debug(`Creating ${socketType} socket for communication with ${host}:${port}`);
  
  const socket = dgram.createSocket({ type: socketType, reuseAddr: true });
  
  socket.on('error', (err) => {
    debug(`${socketType} socket error: ${err.message}`);
    socket.close();
  });
  
  return socket;
}

/**
 * Get local IP addresses (both IPv4 and IPv6) with IPv6 prioritization
 * @param options - Options for filtering addresses
 * @returns Object with sorted IP addresses
 */
export function getLocalIPs(options: {
  includeInternal?: boolean,
  includePrivate?: boolean,
  preferIPv6?: boolean
} = {}): { v4: string[], v6: string[] } {
  const includeInternal = options.includeInternal || false;
  const includePrivate = options.includePrivate || false;
  const preferIPv6 = options.preferIPv6 !== false; // Default to true
  
  const addresses = { v4: [] as string[], v6: [] as string[] };
  const interfaces = os.networkInterfaces();
  
  // Type guard functions for checking IP address family
  const isIPv4Family = (family: string | number): boolean => {
    return family === 'IPv4' || family === 4 || family === '4';
  };
  
  const isIPv6Family = (family: string | number): boolean => {
    return family === 'IPv6' || family === 6 || family === '6';
  };
  
  // Process all network interfaces
  for (const ifaceName of Object.keys(interfaces)) {
    const iface = interfaces[ifaceName];
    if (!iface) continue;
    
    for (const info of iface) {
      if (!info) continue;
      
      // Skip internal interfaces if not requested
      if (info.internal && !includeInternal) continue;
      
      // Skip private addresses if not requested
      if (!includePrivate && isPrivateIP(info.address)) continue;
      
      // Check the address family using type guard functions
      if (isIPv4Family(info.family)) {
        addresses.v4.push(info.address);
      } else if (isIPv6Family(info.family)) {
        // Skip link-local addresses (they're not useful for external connections)
        if (!info.address.startsWith('fe80:')) {
          addresses.v6.push(info.address);
        }
      }
    }
  }
  
  // Sort the arrays based on preference (preferIPv6 just affects logging, not the actual result)
  if (preferIPv6) {
    debug(`Found ${addresses.v6.length} IPv6 addresses and ${addresses.v4.length} IPv4 addresses (IPv6 preferred)`);
  } else {
    debug(`Found ${addresses.v4.length} IPv4 addresses and ${addresses.v6.length} IPv6 addresses (IPv4 preferred)`);
  }
  
  return addresses;
}

/**
 * Try to connect to a peer using multiple addresses with IPv6 preference
 * @param peerAddresses - Array of peer addresses (IPv4 and/or IPv6)
 * @param port - Port to connect to
 * @param protocol - 'tcp' or 'udp'
 * @param options - Connection options
 * @returns Promise resolving to the first successful connection
 */
export async function connectToFirstAvailableAddress(
  peerAddresses: string[],
  port: number,
  protocol: 'tcp' | 'udp',
  options: {
    timeout?: number,
    preferIPv6?: boolean,
    onConnection?: (socket: net.Socket | dgram.Socket, address: string) => void,
    onError?: (error: Error, address: string) => void
  } = {}
): Promise<{ socket: net.Socket | dgram.Socket, address: string }> {
  const timeout = options.timeout || 10000;
  const preferIPv6 = options.preferIPv6 !== false; // Default to true
  
  // Sort addresses based on preference (IPv6 first if preferIPv6 is true)
  const sortedAddresses = preferIPv6 
    ? sortIPAddressesByPreference(peerAddresses)
    : [...peerAddresses].reverse(); // Reverse to prioritize IPv4 if not preferring IPv6
  
  if (sortedAddresses.length === 0) {
    throw new Error('No peer addresses provided');
  }
  
  debug(`Attempting connections to ${sortedAddresses.length} addresses, preference: ${preferIPv6 ? 'IPv6-first' : 'IPv4-first'}`);
  
  // For TCP, we can use Promise.race to connect to the first successful address
  if (protocol === 'tcp') {
    const connectionPromises = sortedAddresses.map(address => 
      createTCPConnection(
        address, 
        port, 
        getSocketTypeForAddress(address, 'tcp', preferIPv6) as 'tcp4' | 'tcp6',
        timeout,
        error => options.onError && options.onError(error, address),
        socket => options.onConnection && options.onConnection(socket, address)
      ).then(socket => ({ socket, address }))
      .catch(error => {
        debug(`Connection to ${address}:${port} failed: ${error.message}`);
        throw error; // Re-throw to be caught by Promise.race
      })
    );
    
    // Add a timeout for all connections
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`All connections to port ${port} timed out after ${timeout}ms`));
      }, timeout);
    });
    
    // Race all connections against the timeout
    return Promise.race([...connectionPromises, timeoutPromise]);
  } 
  // For UDP, we create a socket for the first address
  else {
    // Select the first address based on preference
    const address = sortedAddresses[0];
    const socketType = getSocketTypeForAddress(address, 'udp', preferIPv6) as 'udp4' | 'udp6';
    const socket = createUDPConnection(address, port, socketType);
    
    if (options.onConnection) {
      options.onConnection(socket, address);
    }
    
    return { socket, address };
  }
} 
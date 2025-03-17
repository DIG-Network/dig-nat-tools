/**
 * Network utility functions for IP discovery and network interface analysis
 */

import * as os from 'os';
import * as ip from 'ip';
import Debug from 'debug';
import * as stun from 'stun';
import { natPmpClient } from './nat-pmp';

const debug = Debug('dig-nat-tools:utils:network');

/**
 * Interface for IP addresses
 */
export interface IPAddresses {
  v4: string[];
  v6: string[];
}

/**
 * Interface for network interface info
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
 * Get local IP addresses (both IPv4 and IPv6)
 * @returns Object with 'v4' and 'v6' arrays of IP addresses
 */
export function getLocalIPs(): IPAddresses {
  const interfaces = os.networkInterfaces();
  const addresses: IPAddresses = {
    v4: [],
    v6: []
  };

  // Iterate over network interfaces
  Object.keys(interfaces).forEach(interfaceName => {
    const networkInterface = interfaces[interfaceName];
    if (!networkInterface) return;
    
    networkInterface.forEach((addr) => {
      const addrInfo = addr as NetworkInterfaceInfo;
      // Skip internal addresses
      if (addrInfo.internal) return;
      
      // Check for IPv4 address (can be string 'IPv4' or number 4)
      if (addrInfo.family === 'IPv4' || (typeof addrInfo.family === 'number' && addrInfo.family === 4)) {
        addresses.v4.push(addrInfo.address);
      } 
      // Check for IPv6 address (can be string 'IPv6' or number 6)
      else if (addrInfo.family === 'IPv6' || (typeof addrInfo.family === 'number' && addrInfo.family === 6)) {
        // Skip link-local IPv6 addresses (fe80::)
        if (!addrInfo.address.startsWith('fe80:')) {
          addresses.v6.push(addrInfo.address);
        }
      }
    });
  });

  return addresses;
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
 * Discover public IP addresses (both IPv4 and IPv6)
 * 
 * This function attempts to discover the user's public IP addresses using
 * only decentralized methods:
 * 1. NAT-PMP/PCP (preferred)
 * 2. STUN servers (for NAT traversal)
 * 3. Local network interface analysis
 * 
 * @param options Configuration options
 * @param options.stunServers Array of STUN server URLs (defaults to a list of public STUN servers)
 * @param options.timeout Timeout in milliseconds (default: 5000)
 * @param options.tryMultipleServers Whether to try multiple STUN servers (enabled by default)
 * @param options.useNATPMP Whether to use NAT-PMP/PCP for IP discovery (enabled by default)
 * @returns Promise that resolves to an object with IPv4 and IPv6 addresses
 */
export async function discoverPublicIPs(options: {
  stunServers?: string[];
  timeout?: number;
  tryMultipleServers?: boolean;
  useNATPMP?: boolean;
} = {}): Promise<{ ipv4: string | null; ipv6: string | null }> {
  const stunServers = options.stunServers || [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
    'stun:stun2.l.google.com:19302',
    'stun:stun3.l.google.com:19302',
    'stun:stun4.l.google.com:19302',
    'stun:stun.stunprotocol.org:3478',
    'stun:stun.voip.blackberry.com:3478',
    'stun:stun.sip.us:3478'
  ];
  const timeout = options.timeout || 5000; // 5 seconds default
  const tryMultipleServers = options.tryMultipleServers !== false;
  const useNATPMP = options.useNATPMP !== false; // Default to true
  
  const debug = Debug('dig-nat-tools:utils:discover-ip');
  
  // Initialize result
  const result = {
    ipv4: null as string | null,
    ipv6: null as string | null
  };
  
  debug('Starting public IP discovery using decentralized methods');
  
  // Try NAT-PMP/PCP first (preferred method)
  if (useNATPMP) {
    try {
      debug('Attempting to discover IP using NAT-PMP/PCP');
      
      // Discover gateway
      const gatewayIP = await natPmpClient.discoverGateway();
      if (gatewayIP) {
        debug(`Found gateway IP: ${gatewayIP}`);
        
        // Try to get external IP address using NAT-PMP
        const externalIP = await natPmpClient.getExternalAddress(timeout);
        if (externalIP) {
          debug(`Found IPv4 address via NAT-PMP: ${externalIP}`);
          result.ipv4 = externalIP;
          
          // NAT-PMP/PCP only provides IPv4, so we still need to try other methods for IPv6
        }
      }
    } catch (err) {
      debug(`NAT-PMP/PCP discovery failed: ${(err as Error).message}`);
    }
  }
  
  // If we don't have both addresses, try STUN next
  if (!result.ipv4 || !result.ipv6) {
    try {
      debug('Attempting to discover IPs using STUN');
      const stunResult = await discoverIPsViaSTUN(stunServers, timeout, tryMultipleServers);
      
      // Only use STUN results for addresses we don't already have
      if (!result.ipv4 && stunResult.ipv4) {
        result.ipv4 = stunResult.ipv4;
        debug(`Found IPv4 (${result.ipv4}) via STUN`);
      }
      
      if (!result.ipv6 && stunResult.ipv6) {
        result.ipv6 = stunResult.ipv6;
        debug(`Found IPv6 (${result.ipv6}) via STUN`);
      }
      
      // If we got both addresses, return early
      if (result.ipv4 && result.ipv6) {
        debug(`Found both IPv4 (${result.ipv4}) and IPv6 (${result.ipv6})`);
        return result;
      }
    } catch (err) {
      debug(`STUN discovery failed: ${(err as Error).message}`);
    }
  }
  
  // If we still don't have both addresses, try to analyze local network interfaces
  // This is less reliable but can provide hints in some cases
  if (!result.ipv4 || !result.ipv6) {
    try {
      debug('Attempting to analyze local network interfaces');
      const localResult = analyzeLocalNetworkInterfaces();
      
      // Only use these results if other methods didn't provide them
      if (!result.ipv4 && localResult.ipv4) {
        result.ipv4 = localResult.ipv4;
        debug(`Found potential IPv4 (${result.ipv4}) via local network analysis`);
      }
      
      if (!result.ipv6 && localResult.ipv6) {
        result.ipv6 = localResult.ipv6;
        debug(`Found potential IPv6 (${result.ipv6}) via local network analysis`);
      }
    } catch (err) {
      debug(`Local network analysis failed: ${(err as Error).message}`);
    }
  }
  
  // Log the final result
  debug(`Discovery complete. IPv4: ${result.ipv4 || 'not found'}, IPv6: ${result.ipv6 || 'not found'}`);
  
  return result;
}

/**
 * Discover public IPs using STUN servers
 * 
 * @param stunServers Array of STUN server URLs
 * @param timeout Timeout in milliseconds
 * @param tryMultipleServers Whether to try multiple STUN servers
 * @returns Promise that resolves to an object with IPv4 and IPv6 addresses
 */
export async function discoverIPsViaSTUN(
  stunServers: string[],
  timeout: number,
  tryMultipleServers: boolean
): Promise<{ ipv4: string | null; ipv6: string | null }> {
  const result = {
    ipv4: null as string | null,
    ipv6: null as string | null
  };
  
  // Try each STUN server until we get a result or run out of servers
  for (const stunServer of stunServers) {
    try {
      // Parse the STUN server URL
      const stunUrl = new URL(stunServer);
      const host = stunUrl.hostname;
      const port = parseInt(stunUrl.port || '3478', 10);
      
      debug(`Trying STUN server: ${host}:${port}`);
      
      // Create a promise that resolves with the STUN response
      const stunPromise = new Promise<{ ipv4?: string; ipv6?: string }>((resolve, reject) => {
        const client = new stun.StunClient(host, port);
        
        client.on('response', (res: any) => {
          try {
            const { address, family } = res.getXorMappedAddressAttribute();
            debug(`STUN response from ${host}:${port}: ${address} (${family})`);
            
            if (family === 'IPv4') {
              resolve({ ipv4: address });
            } else if (family === 'IPv6') {
              resolve({ ipv6: address });
            } else {
              reject(new Error(`Unknown address family: ${family}`));
            }
          } catch (err) {
            reject(new Error(`Error processing STUN response: ${(err as Error).message}`));
          }
        });
        
        client.on('error', (err: Error) => {
          debug(`STUN client error with ${host}:${port}: ${err.message}`);
          reject(err);
        });
        
        // Send STUN binding request
        client.sendBindingRequest();
      });
      
      // Add timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`STUN request to ${stunServer} timed out after ${timeout}ms`));
        }, timeout);
      });
      
      // Race the STUN request against the timeout
      const stunResult = await Promise.race([stunPromise, timeoutPromise]);
      
      // Update our result with any new information
      if (stunResult.ipv4) result.ipv4 = stunResult.ipv4;
      if (stunResult.ipv6) result.ipv6 = stunResult.ipv6;
      
      // If we have both IPv4 and IPv6 or we're not trying multiple servers, we can stop
      if ((result.ipv4 && result.ipv6) || !tryMultipleServers) break;
      
    } catch (err) {
      debug(`Error with STUN server ${stunServer}: ${(err as Error).message}`);
      // Continue to the next STUN server on error
      continue;
    }
  }
  
  return result;
}

/**
 * Analyze local network interfaces to find potential public IPs
 * This is less reliable than STUN but can provide hints in some cases
 * 
 * @returns Object with potential public IPv4 and IPv6 addresses
 */
export function analyzeLocalNetworkInterfaces(): { ipv4: string | null; ipv6: string | null } {
  const interfaces = os.networkInterfaces();
  const result = {
    ipv4: null as string | null,
    ipv6: null as string | null
  };
  
  // Collect all external addresses
  const externalIPv4: string[] = [];
  const externalIPv6: string[] = [];
  
  // Iterate over network interfaces
  for (const interfaceName in interfaces) {
    const networkInterface = interfaces[interfaceName];
    if (!networkInterface) continue;
    
    // Iterate over each interface address
    for (let i = 0; i < networkInterface.length; i++) {
      // Use type assertion to tell TypeScript about the structure
      const addrInfo = networkInterface[i] as NetworkInterfaceInfo;
      
      // Skip internal addresses
      if (addrInfo.internal) continue;
      
      // Check for IPv4 address
      if (addrInfo.family === 'IPv4' || (typeof addrInfo.family === 'number' && addrInfo.family === 4)) {
        // Skip private addresses
        if (!isPrivateIP(addrInfo.address)) {
          externalIPv4.push(addrInfo.address);
        }
      } 
      // Check for IPv6 address
      else if (addrInfo.family === 'IPv6' || (typeof addrInfo.family === 'number' && addrInfo.family === 6)) {
        // Skip link-local IPv6 addresses (fe80::)
        if (!addrInfo.address.startsWith('fe80:')) {
          // Skip private/local IPv6 addresses
          // Global unicast addresses typically start with 2 or 3
          if (addrInfo.address.match(/^[23]/)) {
            externalIPv6.push(addrInfo.address);
          }
        }
      }
    }
  }
  
  // Use the first external address found for each type
  if (externalIPv4.length > 0) {
    result.ipv4 = externalIPv4[0];
  }
  
  if (externalIPv6.length > 0) {
    result.ipv6 = externalIPv6[0];
  }
  
  return result;
} 
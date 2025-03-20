/**
 * Network utility functions for IP discovery and network interface analysis
 */

import * as os from 'os';
import * as ip from 'ip';
import Debug from 'debug';
import * as stun from 'stun';
import { natPmpClient } from './nat-pmp';
import * as dgram from 'dgram';
// Import our dual-stack utilities for network interface handling
import { isPrivateIP } from './dual-stack';
// Import our new IP helper utils
import { getPreferredIPs } from './ip-helper';

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
 * Discover public IP addresses using STUN, NAT-PMP/PCP, and local interfaces
 * @param options Configuration options
 * @param options.stunServers STUN servers to use
 * @param options.timeout Timeout for STUN and NAT-PMP/PCP requests
 * @param options.tryMultipleServers Whether to try multiple STUN servers
 * @param options.useNATPMP Whether to use NAT-PMP/PCP for IP discovery (enabled by default)
 * @param options.enableIPv6 Whether to enable IPv6 discovery (disabled by default)
 * @param options.preferIPv6 Whether to prefer IPv6 over IPv4 when both are available
 * @returns Promise that resolves to an object with IPv4 and IPv6 addresses
 */
export async function discoverPublicIPs(options: {
  stunServers?: string[];
  timeout?: number;
  tryMultipleServers?: boolean;
  useNATPMP?: boolean;
  enableIPv6?: boolean;
  preferIPv6?: boolean;
} = {}): Promise<{ ipv4: string | null; ipv6: string | null }> {
  const stunServers = options.stunServers || [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
    'stun:stun.ekiga.net'
  ];
  
  const timeout = options.timeout || 5000; // 5 seconds default
  const tryMultipleServers = options.tryMultipleServers !== false; // Default to true
  const useNATPMP = options.useNATPMP !== false; // Default to true
  const enableIPv6 = options.enableIPv6 === true; // Default to false for backward compatibility
  const preferIPv6 = options.preferIPv6 === true; // Default to false for backward compatibility
  
  const ipDiscoveryDebug = Debug('dig-nat-tools:utils:discover-ip');
  ipDiscoveryDebug(`Starting IP discovery with options: enableIPv6=${enableIPv6}, preferIPv6=${preferIPv6}`);
  
  // Result object
  const result: { ipv4: string | null; ipv6: string | null } = {
    ipv4: null,
    ipv6: null
  };
  
  // Try all methods in parallel for speed
  const stunPromise = discoverIPsViaSTUN(stunServers, timeout, tryMultipleServers, enableIPv6)
    .catch(err => {
      ipDiscoveryDebug(`STUN discovery error: ${err.message}`);
      return { ipv4: null, ipv6: null };
    });
  
  // NAT-PMP/PCP
  const natpmpPromise = useNATPMP
    ? discoverIPsViaNATPMP(timeout)
      .catch(err => {
        ipDiscoveryDebug(`NAT-PMP/PCP discovery error: ${err.message}`);
        return { ipv4: null, ipv6: null };
      })
    : Promise.resolve({ ipv4: null, ipv6: null });
  
  // Local interfaces
  const localInterfacesPromise = Promise.resolve()
    .then(() => {
      try {
        ipDiscoveryDebug('Analyzing local network interfaces');
        return getPreferredIPs({
          enableIPv6,
          preferIPv6,
          includeInternal: false,
          includePrivate: false
        });
      } catch (err) {
        ipDiscoveryDebug(`Local interfaces analysis error: ${err}`);
        return { ipv4: null, ipv6: null };
      }
    });
  
  // Wait for all methods to complete
  const [stunResult, natpmpResult, localResult] = await Promise.all([
    stunPromise,
    natpmpPromise,
    localInterfacesPromise
  ]);
  
  // Prioritize results: NAT-PMP/PCP > STUN > Local Interfaces
  if (natpmpResult.ipv4) {
    result.ipv4 = natpmpResult.ipv4;
    ipDiscoveryDebug(`Using NAT-PMP/PCP IPv4: ${natpmpResult.ipv4}`);
  } else if (stunResult.ipv4) {
    result.ipv4 = stunResult.ipv4;
    ipDiscoveryDebug(`Using STUN IPv4: ${stunResult.ipv4}`);
  } else if (localResult.ipv4) {
    result.ipv4 = localResult.ipv4;
    ipDiscoveryDebug(`Using local interface IPv4: ${localResult.ipv4}`);
  }
  
  // Similar for IPv6
  if (enableIPv6) {
    if (natpmpResult.ipv6) {
      result.ipv6 = natpmpResult.ipv6;
      ipDiscoveryDebug(`Using NAT-PMP/PCP IPv6: ${natpmpResult.ipv6}`);
    } else if (stunResult.ipv6) {
      result.ipv6 = stunResult.ipv6;
      ipDiscoveryDebug(`Using STUN IPv6: ${stunResult.ipv6}`);
    } else if (localResult.ipv6) {
      result.ipv6 = localResult.ipv6;
      ipDiscoveryDebug(`Using local interface IPv6: ${localResult.ipv6}`);
    }
  }
  
  // If we have both IPv4 and IPv6 and prefer IPv6, make sure IPv6 is preferred
  if (preferIPv6 && enableIPv6 && result.ipv4 && result.ipv6) {
    ipDiscoveryDebug('IPv6 is preferred over IPv4');
  }
  
  ipDiscoveryDebug(`IP discovery completed. IPv4: ${result.ipv4}, IPv6: ${result.ipv6}`);
  return result;
}

/**
 * Discover public IP addresses using STUN
 * @param servers - STUN server URLs
 * @param timeout - Timeout in milliseconds
 * @param tryMultiple - Whether to try multiple servers
 * @param enableIPv6 - Whether to try IPv6 as well
 * @returns Promise that resolves to an object with IPv4 and IPv6 addresses
 */
async function discoverIPsViaSTUN(
  servers: string[],
  timeout: number,
  tryMultiple: boolean,
  enableIPv6: boolean
): Promise<{ ipv4: string | null; ipv6: string | null }> {
  const stunDebug = Debug('dig-nat-tools:utils:stun');
  const result: { ipv4: string | null; ipv6: string | null } = {
    ipv4: null,
    ipv6: null
  };
  
  // Extract hosts and ports from STUN URLs
  const stunServers = servers.map(url => {
    // Remove stun: prefix and split host:port
    const hostPort = url.replace(/^stun:/, '');
    const [host, port] = hostPort.split(':');
    return {
      host,
      port: port ? parseInt(port, 10) : 3478 // Default STUN port
    };
  });
  
  // Try IPv4 STUN
  for (const server of stunServers) {
    try {
      stunDebug(`Trying STUN IPv4 with server ${server.host}:${server.port}`);
      
      // Create a promise with timeout
      const stunResponse = await Promise.race([
        new Promise<string>((resolve, reject) => {
          // Create STUN client
          const client = stun.createClient();
          
          // Create UDP socket
          const socket = dgram.createSocket('udp4');
          
          // Wait for response
          client.once('response', (response: any) => {
            const address = response.getXorMappedAddressAttribute()?.address;
            if (address) {
              resolve(address);
            } else {
              reject(new Error('No XOR-MAPPED-ADDRESS in response'));
            }
            socket.close();
          });
          
          // Handle errors
          client.once('error', (err: Error) => {
            reject(err);
            socket.close();
          });
          
          // Send request
          client.sendBindingRequest(socket, {
            host: server.host,
            port: server.port
          });
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`STUN request timed out after ${timeout}ms`));
          }, timeout);
        })
      ]);
      
      if (stunResponse) {
        result.ipv4 = stunResponse;
        stunDebug(`STUN server ${server.host}:${server.port} returned IPv4: ${stunResponse}`);
        
        // If we got a successful response and don't need to try multiple servers, break
        if (!tryMultiple) break;
      }
    } catch (err) {
      stunDebug(`STUN IPv4 request to ${server.host}:${server.port} failed: ${(err as Error).message}`);
      
      // Continue to next server
      continue;
    }
  }
  
  // Try IPv6 STUN if enabled
  if (enableIPv6) {
    for (const server of stunServers) {
      try {
        stunDebug(`Trying STUN IPv6 with server ${server.host}:${server.port}`);
        
        // Create a promise with timeout
        const stunResponse = await Promise.race([
          new Promise<string>((resolve, reject) => {
            // Create STUN client
            const client = stun.createClient();
            
            // Create UDP socket
            const socket = dgram.createSocket('udp6');
            
            // Wait for response
            client.once('response', (response: any) => {
              const address = response.getXorMappedAddressAttribute()?.address;
              if (address) {
                resolve(address);
              } else {
                reject(new Error('No XOR-MAPPED-ADDRESS in response'));
              }
              socket.close();
            });
            
            // Handle errors
            client.once('error', (err: Error) => {
              reject(err);
              socket.close();
            });
            
            // Send request
            client.sendBindingRequest(socket, {
              host: server.host,
              port: server.port
            });
          }),
          new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error(`STUN IPv6 request timed out after ${timeout}ms`));
            }, timeout);
          })
        ]);
        
        if (stunResponse) {
          result.ipv6 = stunResponse;
          stunDebug(`STUN server ${server.host}:${server.port} returned IPv6: ${stunResponse}`);
          
          // If we got a successful response and don't need to try multiple servers, break
          if (!tryMultiple) break;
        }
      } catch (err) {
        stunDebug(`STUN IPv6 request to ${server.host}:${server.port} failed: ${(err as Error).message}`);
        
        // Continue to next server
        continue;
      }
    }
  }
  
  return result;
}

/**
 * Discover public IP addresses using NAT-PMP/PCP
 * @param timeout - Timeout in milliseconds
 * @returns Promise that resolves to an object with IPv4 and IPv6 addresses
 */
async function discoverIPsViaNATPMP(
  timeout: number
): Promise<{ ipv4: string | null; ipv6: string | null }> {
  const natpmpDebug = Debug('dig-nat-tools:utils:natpmp');
  const result: { ipv4: string | null; ipv6: string | null } = {
    ipv4: null,
    ipv6: null
  };
  
  try {
    natpmpDebug('Requesting public IP via NAT-PMP/PCP');
    
    // Use the NAT-PMP client with timeout
    const client = natPmpClient({
      timeout
    });
    
    // Request external address
    const externalAddress = await client.externalIp();
    
    if (externalAddress && externalAddress.ip) {
      // Convert IP bytes to string
      const ipBytes = externalAddress.ip;
      result.ipv4 = `${ipBytes[0]}.${ipBytes[1]}.${ipBytes[2]}.${ipBytes[3]}`;
      natpmpDebug(`NAT-PMP/PCP returned IPv4: ${result.ipv4}`);
    }
    
    // TODO: Add IPv6 support when NAT-PMP client supports it
    
  } catch (err) {
    natpmpDebug(`NAT-PMP/PCP error: ${(err as Error).message}`);
    // Ignore errors - we'll fall back to other methods
  }
  
  return result;
}

/**
 * Analyze local network interfaces for IP addresses
 * Will attempt to find non-internal, non-private IP addresses
 * @param enableIPv6 - Whether to include IPv6 addresses (default: false)
 * @param preferIPv6 - Whether to prefer IPv6 addresses over IPv4 when both are available (default: false)
 * @returns Object with IPv4 and IPv6 addresses
 */
function analyzeLocalNetworkInterfaces(
  enableIPv6: boolean = false,
  preferIPv6: boolean = false
): { ipv4: string | null; ipv6: string | null } {
  const debug = Debug('dig-nat-tools:utils:network-interfaces');
  const result = { ipv4: null as string | null, ipv6: null as string | null };
  
  const interfaces = os.networkInterfaces();
  
  // Collect candidate addresses for IPv4 and IPv6
  const ipv4Candidates: string[] = [];
  const ipv6Candidates: string[] = [];

  for (const name in interfaces) {
    const networkInterface = interfaces[name];
    if (!networkInterface) continue;

    for (const iface of networkInterface) {
      if (!iface) continue;
      
      // Skip internal interfaces - we're looking for public-facing ones
      if (iface.internal) continue;
      
      // Handle IPv4 addresses
      if (iface.family === 'IPv4' || iface.family === '4' || iface.family === 4) {
        // Skip private IP ranges like 10.x.x.x, 192.168.x.x, etc.
        if (!isPrivateIP(iface.address)) {
          ipv4Candidates.push(iface.address);
          debug(`Found candidate public IPv4: ${iface.address}`);
        }
      } 
      // Handle IPv6 addresses if enabled
      else if (enableIPv6 && (iface.family === 'IPv6' || iface.family === '6' || iface.family === 6)) {
        // Skip link-local addresses (fe80::)
        if (!iface.address.startsWith('fe80:')) {
          ipv6Candidates.push(iface.address);
          debug(`Found candidate public IPv6: ${iface.address}`);
        }
      }
    }
  }

  // Choose the best candidates - prioritize IPv6 if enabled and preferred
  if (preferIPv6 && enableIPv6 && ipv6Candidates.length > 0) {
    result.ipv6 = ipv6Candidates[0];
    // Still set IPv4 as fallback
    if (ipv4Candidates.length > 0) {
      result.ipv4 = ipv4Candidates[0];
    }
  } else {
    // Default prioritization: IPv4 first, then IPv6 if available
    if (ipv4Candidates.length > 0) {
      result.ipv4 = ipv4Candidates[0];
    }
    if (enableIPv6 && ipv6Candidates.length > 0) {
      result.ipv6 = ipv6Candidates[0];
    }
  }
  
  debug(`Selected IPv4: ${result.ipv4}, IPv6: ${result.ipv6}`);
  return result;
} 
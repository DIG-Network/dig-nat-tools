/**
 * IP Helper Utilities
 * 
 * This module provides utilities for working with IP addresses, including
 * detection, validation, and preference management between IPv4 and IPv6.
 */

import * as os from 'os';
import { isIP, isIPv6 } from 'net';
import Debug from 'debug';

const debug = Debug('dig-nat-tools:utils:ip-helper');

interface IPAddresses {
  ipv4: string[];
  ipv6: string[];
}

/**
 * Interface for NetworkInterfaceInfo that handles different Node.js versions
 * where family can be either string or number
 */
export interface NetworkInterfaceInfo {
  address: string;
  netmask: string;
  family: string | number;
  mac: string;
  internal: boolean;
  cidr: string | null;
  scopeid?: number;
}

/**
 * IP address version enum
 */
export enum IPVersion {
  IPv4 = 'IPv4',
  IPv6 = 'IPv6',
  Unknown = 'Unknown'
}

/**
 * Determine the version of an IP address
 * @param address - IP address to check
 * @returns IPVersion enum value
 */
export function getIPVersion(address: string): IPVersion {
  if (!address) {
    return IPVersion.Unknown;
  }

  if (address.includes(':')) {
    return IPVersion.IPv6;
  } else if (address.includes('.')) {
    return IPVersion.IPv4;
  }

  return IPVersion.Unknown;
}

/**
 * Check if an IP address is IPv4
 * @param address - IP address to check
 * @returns True if IPv4, false otherwise
 */
export function isIPv4(address: string): boolean {
  return getIPVersion(address) === IPVersion.IPv4;
}

/**
 * Check if an IP address is IPv6
 * @param address - IP address to check
 * @returns True if IPv6, false otherwise
 */
export function isIPv6(address: string): boolean {
  return getIPVersion(address) === IPVersion.IPv6;
}

/**
 * Check if an IP address is private
 * @param address - IP address to check
 * @returns True if private, false otherwise
 */
export function isPrivateIP(address: string): boolean {
  try {
    if (isIPv4(address)) {
      return ip.isPrivate(address);
    } else if (isIPv6(address)) {
      // Handle IPv6 private addresses
      // fc00::/7 are private
      return address.toLowerCase().startsWith('fc') || 
             address.toLowerCase().startsWith('fd');
    }
    return true; // Unknown format, assume private
  } catch (err) {
    debug(`Error checking if IP is private: ${(err as Error).message}`);
    return true; // Assume private in case of error
  }
}

/**
 * Check if an IPv6 address is link-local
 * @param address - IPv6 address to check
 * @returns True if link-local, false otherwise
 */
export function isLinkLocalIPv6(address: string): boolean {
  return isIPv6(address) && address.toLowerCase().startsWith('fe80:');
}

/**
 * Sort IP addresses with IPv6 first if preferred
 * @param addresses - Array of IP addresses
 * @param preferIPv6 - Whether to prefer IPv6 addresses
 * @returns Sorted array of IP addresses
 */
export function sortIPAddressesByPreference(
  addresses: string[], 
  preferIPv6: boolean = true
): string[] {
  return [...addresses].sort((a, b) => {
    const aIsIPv6 = isIPv6(a);
    const bIsIPv6 = isIPv6(b);
    
    if (preferIPv6) {
      // If preferring IPv6, sort IPv6 first
      if (aIsIPv6 && !bIsIPv6) return -1;
      if (!aIsIPv6 && bIsIPv6) return 1;
    } else {
      // If preferring IPv4, sort IPv4 first
      if (aIsIPv6 && !bIsIPv6) return 1;
      if (!aIsIPv6 && bIsIPv6) return -1;
    }
    
    // Same version, maintain original order
    return 0;
  });
}

/**
 * Get the family value for a network interface safely
 * Handles different Node.js versions where family can be string or number
 * @param iface - Network interface info
 * @returns IPVersion enum value
 */
export function getInterfaceFamily(iface: NetworkInterfaceInfo): IPVersion {
  const family = iface.family;
  
  if (typeof family === 'string') {
    if (family === 'IPv4') return IPVersion.IPv4;
    if (family === 'IPv6') return IPVersion.IPv6;
  } else if (typeof family === 'number') {
    if (family === 4) return IPVersion.IPv4;
    if (family === 6) return IPVersion.IPv6;
  }
  
  return IPVersion.Unknown;
}

/**
 * Collect IP addresses from network interfaces with filtering
 * @param options - Options for filtering
 * @returns Object with arrays of IPv4 and IPv6 addresses
 */
export function collectIPAddresses(options: {
  includeInternal?: boolean,
  includePrivate?: boolean,
  includeLinkLocal?: boolean,
  enableIPv6?: boolean
} = {}): { ipv4: string[], ipv6: string[] } {
  const includeInternal = options.includeInternal || false;
  const includePrivate = options.includePrivate || false;
  const includeLinkLocal = options.includeLinkLocal || false;
  const enableIPv6 = options.enableIPv6 || false;
  
  const result = {
    ipv4: [] as string[],
    ipv6: [] as string[]
  };
  
  const interfaces = os.networkInterfaces();
  
  // Process all network interfaces
  for (const name in interfaces) {
    const networkInterface = interfaces[name];
    if (!networkInterface) continue;
    
    for (const iface of networkInterface) {
      if (!iface) continue;
      
      // Skip internal interfaces if not requested
      if (iface.internal && !includeInternal) continue;
      
      // Handle IPv4
      if (getInterfaceFamily(iface) === IPVersion.IPv4) {
        // Skip private IPv4 addresses if not requested
        if (!includePrivate && isPrivateIP(iface.address)) continue;
        
        result.ipv4.push(iface.address);
        debug(`Found IPv4: ${iface.address} on ${name}`);
      }
      // Handle IPv6 if enabled
      else if (enableIPv6 && getInterfaceFamily(iface) === IPVersion.IPv6) {
        // Skip link-local IPv6 addresses if not requested
        if (!includeLinkLocal && isLinkLocalIPv6(iface.address)) continue;
        
        // Skip private IPv6 addresses if not requested
        if (!includePrivate && isPrivateIP(iface.address)) continue;
        
        result.ipv6.push(iface.address);
        debug(`Found IPv6: ${iface.address} on ${name}`);
      }
    }
  }
  
  return result;
}

/**
 * Get the preferred IP addresses based on user settings
 * @param options - Options for IP selection
 * @returns Object with preferred IPv4 and IPv6 addresses
 */
export function getPreferredIPs(options: {
  enableIPv6?: boolean,
  preferIPv6?: boolean,
  includeInternal?: boolean,
  includePrivate?: boolean
} = {}): { ipv4: string | null, ipv6: string | null } {
  const enableIPv6 = options.enableIPv6 || false;
  const preferIPv6 = options.preferIPv6 || false;
  
  // Collect addresses
  const addresses = collectIPAddresses({
    includeInternal: options.includeInternal,
    includePrivate: options.includePrivate,
    enableIPv6
  });
  
  const result = {
    ipv4: addresses.ipv4.length > 0 ? addresses.ipv4[0] : null,
    ipv6: enableIPv6 && addresses.ipv6.length > 0 ? addresses.ipv6[0] : null
  };
  
  if (preferIPv6 && enableIPv6) {
    debug(`IPv6 preferred: ${result.ipv6 || 'none'}, IPv4 fallback: ${result.ipv4 || 'none'}`);
  } else {
    debug(`IPv4 preferred: ${result.ipv4 || 'none'}, IPv6: ${result.ipv6 || 'none'}`);
  }
  
  return result;
}

/**
 * Get preferred IP addresses with IPv6 prioritization
 */
export async function getPreferredIPs(): Promise<IPAddresses> {
  const interfaces = os.networkInterfaces();
  const addresses: IPAddresses = {
    ipv4: [],
    ipv6: []
  };

  // Collect all addresses
  Object.values(interfaces).forEach(iface => {
    if (!iface) return;

    iface.forEach(addr => {
      // Skip internal addresses
      if (addr.internal) return;

      // Skip link-local addresses
      if (addr.address.startsWith('fe80:')) return;

      if (addr.family === 'IPv6' || addr.family === 6) {
        addresses.ipv6.push(addr.address);
      } else if (addr.family === 'IPv4' || addr.family === 4) {
        addresses.ipv4.push(addr.address);
      }
    });
  });

  debug(`Found IPv6 addresses: ${addresses.ipv6.join(', ')}`);
  debug(`Found IPv4 addresses: ${addresses.ipv4.join(', ')}`);

  return addresses;
}

/**
 * Sort IP addresses with IPv6 first
 */
export function sortIPAddresses(addresses: string[]): string[] {
  return addresses.sort((a, b) => {
    const aIsIPv6 = isIPv6(a);
    const bIsIPv6 = isIPv6(b);

    if (aIsIPv6 && !bIsIPv6) return -1;
    if (!aIsIPv6 && bIsIPv6) return 1;
    return 0;
  });
}

/**
 * Get the best local IP address
 * Prefers IPv6 over IPv4 when available
 */
export function getBestLocalIP(): string {
  const interfaces = os.networkInterfaces();
  let bestIp = '';
  let bestIsIPv6 = false;

  // First try to find a non-internal IPv6 address
  for (const addrs of Object.values(interfaces)) {
    if (!addrs) continue;

    for (const addr of addrs) {
      if (addr.internal) continue;
      if (addr.address.startsWith('fe80:')) continue;

      if ((addr.family === 'IPv6' || addr.family === 6) && !bestIsIPv6) {
        bestIp = addr.address;
        bestIsIPv6 = true;
        break;
      }
    }
    if (bestIsIPv6) break;
  }

  // If no IPv6, try IPv4
  if (!bestIp) {
    for (const addrs of Object.values(interfaces)) {
      if (!addrs) continue;

      for (const addr of addrs) {
        if (addr.internal) continue;
        if (addr.family === 'IPv4' || addr.family === 4) {
          bestIp = addr.address;
          break;
        }
      }
      if (bestIp) break;
    }
  }

  return bestIp || '::1';
} 
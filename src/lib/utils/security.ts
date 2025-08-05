import { isIP, isIPv6 } from 'net';
import Debug from 'debug';

const debug = Debug('dig-nat-tools:utils:security');

/**
 * Validate a peer ID format
 * @param peerId The peer ID to validate
 * @returns True if the peer ID is valid
 */
export function validatePeerId(peerId: string): boolean {
  // Check if peer ID is valid hex string (40 characters)
  const hexRegex = /^[0-9a-fA-F]{40}$/;
  if (!hexRegex.test(peerId)) {
    debug(`Invalid peer ID format: ${peerId}`);
    return false;
  }
  return true;
}

/**
 * Validate a peer address
 * @param address The peer address to validate
 * @returns True if the address is valid
 */
export function validatePeerAddress(address: string): boolean {
  // Check if address is valid IP
  const ipVersion = isIP(address);
  if (!ipVersion) {
    debug(`Invalid IP address: ${address}`);
    return false;
  }

  // Check for private/local addresses
  if (isPrivateIP(address)) {
    debug(`Private IP address detected: ${address}`);
    return false;
  }

  return true;
}

/**
 * Check if an IP address is private/local
 * @param ip The IP address to check
 * @returns True if the IP is private/local
 */
export function isPrivateIP(ip: string): boolean {
  // Check if it's localhost
  if (ip === '127.0.0.1' || ip === '::1') {
    return true;
  }

  // Check if it's in private IP ranges
  if (ip.startsWith('10.') || 
      ip.startsWith('192.168.') || 
      ip.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) {
    return true;
  }

  // Check if it's a link-local address
  if (ip.startsWith('169.254.') || ip.startsWith('fe80:')) {
    return true;
  }

  // Check if it's a unique local address (ULA)
  if (ip.startsWith('fc00:') || ip.startsWith('fd00:')) {
    return true;
  }

  return false;
}

/**
 * Validate port number
 * @param port The port number to validate
 * @returns True if the port is valid
 */
export function validatePort(port: number): boolean {
  return port > 0 && port < 65536;
}

/**
 * Check if a NAT is symmetric by comparing port mappings
 * @param mappings Array of port mappings to compare
 * @returns True if the NAT appears to be symmetric
 */
export function isSymmetricNAT(mappings: Array<{
  internalPort: number;
  externalPort: number;
  destination: string;
}>): boolean {
  // Group mappings by internal port
  const portGroups = new Map<number, Set<number>>();
  
  for (const mapping of mappings) {
    const ports = portGroups.get(mapping.internalPort) || new Set();
    ports.add(mapping.externalPort);
    portGroups.set(mapping.internalPort, ports);
  }

  // Check if any internal port maps to multiple external ports
  for (const [_, externalPorts] of portGroups) {
    if (externalPorts.size > 1) {
      return true; // Symmetric NAT detected
    }
  }

  return false;
} 
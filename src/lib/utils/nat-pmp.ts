/**
 * NAT-PMP/PCP implementation for port mapping and IP discovery
 * 
 * This module implements both NAT-PMP (RFC 6886) and PCP (RFC 6887) protocols
 * for port mapping and external IP discovery.
 */

import * as os from 'os';
import Debug from 'debug';
import { promiseWithTimeout, createTimeout } from './common';

const debug = Debug('dig-nat-tools:nat-pmp');

/**
 * NAT-PMP/PCP protocol constants
 */
export const NAT_CONSTANTS = {
  // NAT-PMP constants (RFC 6886)
  NATPMP_PORT: 5351,
  NATPMP_VERSION: 0,
  NATPMP_OP_EXTERNAL_ADDRESS: 0,
  NATPMP_OP_MAP_UDP: 1,
  NATPMP_OP_MAP_TCP: 2,
  NATPMP_RESULT_SUCCESS: 0,
  
  // PCP constants (RFC 6887)
  PCP_VERSION: 2,
  PCP_OP_MAP: 1,
  PCP_OP_PEER: 2,
  PCP_OP_ANNOUNCE: 0,
  PCP_PORT: 5351,
  PCP_RESULT_SUCCESS: 0,
  
  // Common constants
  DEFAULT_LIFETIME: 7200, // 2 hours in seconds
  RECOMMENDED_MAPPING_LIFETIME: 3600, // 1 hour in seconds
};

/**
 * Interface for port mapping result
 */
export interface PortMappingResult {
  success: boolean;
  externalPort?: number;
  externalAddress?: string;
  lifetime?: number;
  error?: string;
  protocol?: 'NAT-PMP' | 'PCP' | 'STUN';
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
 * NAT-PMP/PCP client for port mapping and external IP discovery
 */
export class NatPmpClient {
  private gatewayIP: string | null = null;
  private dgram: any;
  
  /**
   * Create a new NAT-PMP/PCP client
   * @param gatewayIP Optional gateway IP address (will be auto-discovered if not provided)
   */
  constructor(gatewayIP?: string) {
    if (gatewayIP) {
      this.gatewayIP = gatewayIP;
    }
    
    // Dynamically import dgram to avoid issues in browser environments
    try {
      this.dgram = require('dgram');
    } catch (err) {
      debug(`Error importing dgram: ${(err as Error).message}`);
      this.dgram = null;
    }
  }
  
  /**
   * Create a UDP socket for NAT-PMP/PCP communication
   * @returns A UDP socket
   */
  private async createNatSocket(): Promise<any> {
    if (!this.dgram) {
      throw new Error('UDP sockets not available in this environment');
    }
    
    const socket = this.dgram.createSocket('udp4');
    
    return new Promise((resolve, reject) => {
      socket.on('error', (err: Error) => {
        reject(err);
      });
      
      socket.bind(0, () => {
        resolve(socket);
      });
    });
  }
  
  /**
   * Discover gateway IP address
   * @returns The gateway IP address
   */
  async discoverGateway(): Promise<string | null> {
    // Return cached gateway IP if available
    if (this.gatewayIP) {
      return this.gatewayIP;
    }
    
    try {
      // Try to get the default gateway from the OS
      const interfaces = os.networkInterfaces();
      
      // Method 1: Try to use os.defaultGateway if available
      const defaultGateway = (os as any).defaultGateway;
      if (typeof defaultGateway === 'function') {
        const gateway = defaultGateway();
        if (gateway) {
          debug(`Found gateway via os.defaultGateway: ${gateway}`);
          this.gatewayIP = gateway;
          return gateway;
        }
      }
      
      // Method 2: Parse route table (platform-specific)
      const { execSync } = require('child_process');
      let gatewayIP = null;
      
      try {
        if (process.platform === 'win32') {
          // Windows
          const routeOutput = execSync('route print 0.0.0.0').toString();
          const routeLines = routeOutput.split('\n');
          for (const line of routeLines) {
            const match = line.match(/^\s*0\.0\.0\.0\s+0\.0\.0\.0\s+(\d+\.\d+\.\d+\.\d+)/);
            if (match) {
              gatewayIP = match[1];
              break;
            }
          }
        } else if (process.platform === 'darwin' || process.platform === 'linux') {
          // macOS or Linux
          const routeOutput = execSync('netstat -rn').toString();
          const routeLines = routeOutput.split('\n');
          for (const line of routeLines) {
            const match = line.match(/^(?:default|0\.0\.0\.0)\s+(\d+\.\d+\.\d+\.\d+)/);
            if (match) {
              gatewayIP = match[1];
              break;
            }
          }
        }
        
        if (gatewayIP) {
          debug(`Found gateway via route table: ${gatewayIP}`);
          this.gatewayIP = gatewayIP;
          return gatewayIP;
        }
      } catch (err) {
        debug(`Error getting gateway from route table: ${(err as Error).message}`);
      }
      
      // Method 3: Guess based on local IP addresses
      for (const interfaceName in interfaces) {
        const networkInterface = interfaces[interfaceName];
        if (!networkInterface) continue;
        
        for (const addrInfo of networkInterface) {
          // Use type assertion to tell TypeScript about the structure
          const info = addrInfo as NetworkInterfaceInfo;
          
          if (info.family === 'IPv4' || (typeof info.family === 'number' && info.family === 4)) {
            if (!info.internal) {
              // Parse the IP and netmask to determine the gateway
              const ipAddr = info.address.split('.');
              const netmask = info.netmask.split('.');
              
              // Assume gateway is the first address in the subnet
              const gateway = ipAddr.map((octet: string, i: number) => {
                const network = parseInt(octet) & parseInt(netmask[i]);
                return i === 3 ? network + 1 : network;
              }).join('.');
              
              debug(`Guessed gateway from interface ${interfaceName}: ${gateway}`);
              this.gatewayIP = gateway;
              return gateway;
            }
          }
        }
      }
      
      debug('Failed to discover gateway');
      return null;
    } catch (err) {
      debug(`Error discovering gateway: ${(err as Error).message}`);
      return null;
    }
  }
  
  /**
   * Get external IP address using NAT-PMP
   * @param timeout - Timeout in milliseconds
   * @returns The external IP address
   */
  async getExternalAddress(timeout = 2000): Promise<string | null> {
    // Discover gateway if not already known
    const gatewayIP = this.gatewayIP || await this.discoverGateway();
    if (!gatewayIP) {
      throw new Error('Gateway IP address not available');
    }
    
    let socket: any = null;
    
    try {
      socket = await this.createNatSocket();
      
      // Create NAT-PMP external address request
      const request = Buffer.alloc(2);
      request.writeUInt8(NAT_CONSTANTS.NATPMP_VERSION, 0); // Version
      request.writeUInt8(NAT_CONSTANTS.NATPMP_OP_EXTERNAL_ADDRESS, 1); // Operation
      
      // Send request to gateway
      socket.send(request, 0, request.length, NAT_CONSTANTS.NATPMP_PORT, gatewayIP);
      
      // Wait for response
      const response = await promiseWithTimeout(
        new Promise<Buffer>((resolve) => {
          socket.once('message', (msg: Buffer) => {
            resolve(msg);
          });
        }),
        timeout,
        `NAT-PMP external address request timed out after ${timeout}ms`
      );
      
      // Parse response
      if (response.length < 12) {
        throw new Error('Invalid NAT-PMP response length');
      }
      
      const version = response.readUInt8(0);
      const op = response.readUInt8(1);
      const resultCode = response.readUInt16BE(2);
      const epoch = response.readUInt32BE(4);
      const externalIP = `${response.readUInt8(8)}.${response.readUInt8(9)}.${response.readUInt8(10)}.${response.readUInt8(11)}`;
      
      if (version !== NAT_CONSTANTS.NATPMP_VERSION) {
        throw new Error(`Invalid NAT-PMP version: ${version}`);
      }
      
      if (op !== (NAT_CONSTANTS.NATPMP_OP_EXTERNAL_ADDRESS + 128)) {
        throw new Error(`Invalid NAT-PMP operation: ${op}`);
      }
      
      if (resultCode !== NAT_CONSTANTS.NATPMP_RESULT_SUCCESS) {
        throw new Error(`NAT-PMP error: ${resultCode}`);
      }
      
      debug(`NAT-PMP external address: ${externalIP}`);
      return externalIP;
    } catch (err) {
      debug(`Error getting external address via NAT-PMP: ${(err as Error).message}`);
      return null;
    } finally {
      if (socket) {
        socket.close();
      }
    }
  }
  
  /**
   * Create a port mapping using NAT-PMP
   * @param options - Port mapping options
   * @returns Port mapping result
   */
  async createPortMappingNATPMP(options: {
    internalPort: number;
    externalPort?: number;
    protocol?: 'TCP' | 'UDP';
    description?: string;
    lifetime?: number;
    timeout?: number;
  }): Promise<PortMappingResult> {
    // Discover gateway if not already known
    const gatewayIP = this.gatewayIP || await this.discoverGateway();
    if (!gatewayIP) {
      return {
        success: false,
        error: 'Gateway IP address not available',
        protocol: 'NAT-PMP'
      };
    }
    
    const {
      internalPort,
      externalPort = internalPort,
      protocol = 'TCP',
      lifetime = NAT_CONSTANTS.RECOMMENDED_MAPPING_LIFETIME,
      timeout = 2000
    } = options;
    
    let socket: any = null;
    
    try {
      socket = await this.createNatSocket();
      
      // Create NAT-PMP port mapping request
      const request = Buffer.alloc(12);
      request.writeUInt8(NAT_CONSTANTS.NATPMP_VERSION, 0); // Version
      request.writeUInt8(
        protocol === 'TCP' ? NAT_CONSTANTS.NATPMP_OP_MAP_TCP : NAT_CONSTANTS.NATPMP_OP_MAP_UDP,
        1
      ); // Operation
      request.writeUInt16BE(0, 2); // Reserved
      request.writeUInt16BE(internalPort, 4); // Internal port
      request.writeUInt16BE(externalPort, 6); // External port (0 for auto-assign)
      request.writeUInt32BE(lifetime, 8); // Lifetime in seconds
      
      // Send request to gateway
      socket.send(request, 0, request.length, NAT_CONSTANTS.NATPMP_PORT, gatewayIP);
      
      // Wait for response
      const response = await promiseWithTimeout(
        new Promise<Buffer>((resolve) => {
          socket.once('message', (msg: Buffer) => {
            resolve(msg);
          });
        }),
        timeout,
        `NAT-PMP port mapping request timed out after ${timeout}ms`
      );
      
      // Parse response
      if (response.length < 16) {
        throw new Error('Invalid NAT-PMP response length');
      }
      
      const version = response.readUInt8(0);
      const op = response.readUInt8(1);
      const resultCode = response.readUInt16BE(2);
      const epoch = response.readUInt32BE(4);
      const internalPortResponse = response.readUInt16BE(8);
      const externalPortResponse = response.readUInt16BE(10);
      const mappingLifetime = response.readUInt32BE(12);
      
      if (version !== NAT_CONSTANTS.NATPMP_VERSION) {
        throw new Error(`Invalid NAT-PMP version: ${version}`);
      }
      
      const expectedOp = (protocol === 'TCP' ? NAT_CONSTANTS.NATPMP_OP_MAP_TCP : NAT_CONSTANTS.NATPMP_OP_MAP_UDP) + 128;
      if (op !== expectedOp) {
        throw new Error(`Invalid NAT-PMP operation: ${op}, expected: ${expectedOp}`);
      }
      
      if (resultCode !== NAT_CONSTANTS.NATPMP_RESULT_SUCCESS) {
        throw new Error(`NAT-PMP error: ${resultCode}`);
      }
      
      // Get external IP address
      const externalIP = await this.getExternalAddress(timeout);
      
      debug(`NAT-PMP port mapping created: ${internalPortResponse} -> ${externalPortResponse} (${protocol}), lifetime: ${mappingLifetime}s`);
      
      return {
        success: true,
        externalPort: externalPortResponse,
        externalAddress: externalIP || undefined,
        lifetime: mappingLifetime,
        protocol: 'NAT-PMP'
      };
    } catch (err) {
      debug(`Error creating port mapping via NAT-PMP: ${(err as Error).message}`);
      return {
        success: false,
        error: (err as Error).message,
        protocol: 'NAT-PMP'
      };
    } finally {
      if (socket) {
        socket.close();
      }
    }
  }
  
  /**
   * Create a port mapping using PCP (Port Control Protocol)
   * @param options - Port mapping options
   * @returns Port mapping result
   */
  async createPortMappingPCP(options: {
    internalPort: number;
    externalPort?: number;
    protocol?: 'TCP' | 'UDP';
    description?: string;
    lifetime?: number;
    timeout?: number;
  }): Promise<PortMappingResult> {
    // Discover gateway if not already known
    const gatewayIP = this.gatewayIP || await this.discoverGateway();
    if (!gatewayIP) {
      return {
        success: false,
        error: 'Gateway IP address not available',
        protocol: 'PCP'
      };
    }
    
    const {
      internalPort,
      externalPort = internalPort,
      protocol = 'TCP',
      lifetime = NAT_CONSTANTS.RECOMMENDED_MAPPING_LIFETIME,
      timeout = 2000
    } = options;
    
    let socket: any = null;
    
    try {
      socket = await this.createNatSocket();
      
      // Get local IP address
      const interfaces = os.networkInterfaces();
      let localIP = '';
      
      // Find a suitable local IP address
      for (const interfaceName in interfaces) {
        const networkInterface = interfaces[interfaceName];
        if (!networkInterface) continue;
        
        for (const addrInfo of networkInterface) {
          // Use type assertion to tell TypeScript about the structure
          const info = addrInfo as NetworkInterfaceInfo;
          
          if (info && (info.family === 'IPv4' || (typeof info.family === 'number' && info.family === 4))) {
            if (!info.internal) {
              localIP = info.address;
              break;
            }
          }
        }
        if (localIP) break;
      }
      
      if (!localIP) {
        throw new Error('Could not determine local IP address');
      }
      
      // Create PCP MAP request
      const request = Buffer.alloc(60); // 24 bytes header + 36 bytes MAP opcode
      
      // PCP Common Header
      request.writeUInt8(NAT_CONSTANTS.PCP_VERSION, 0); // Version
      request.writeUInt8(NAT_CONSTANTS.PCP_OP_MAP, 1); // Opcode
      request.writeUInt16BE(0, 2); // Reserved
      request.writeUInt32BE(lifetime, 4); // Requested lifetime
      
      // Client IP Address (IPv4-mapped IPv6 address)
      request.fill(0, 8, 20); // First 12 bytes are 0
      request.fill(0xFF, 20, 22); // Next 2 bytes are 0xFF
      
      // Parse local IP and write to buffer
      const ipParts = localIP.split('.');
      request.writeUInt8(parseInt(ipParts[0]), 22);
      request.writeUInt8(parseInt(ipParts[1]), 23);
      request.writeUInt8(parseInt(ipParts[2]), 24);
      request.writeUInt8(parseInt(ipParts[3]), 25);
      
      // MAP Opcode
      request.fill(0, 26, 32); // Nonce (all zeros for this simple implementation)
      request.fill(0, 32, 44); // Reserved
      
      // Protocol
      request.writeUInt8(protocol === 'TCP' ? 6 : 17, 44); // 6 for TCP, 17 for UDP
      
      // Reserved
      request.fill(0, 45, 48);
      
      // Internal port
      request.writeUInt16BE(internalPort, 48);
      
      // Suggested external port
      request.writeUInt16BE(externalPort, 50);
      
      // Suggested external IP address (all zeros for "don't care")
      request.fill(0, 52, 60);
      
      // Send request to gateway
      socket.send(request, 0, request.length, NAT_CONSTANTS.PCP_PORT, gatewayIP);
      
      // Wait for response
      const response = await promiseWithTimeout(
        new Promise<Buffer>((resolve) => {
          socket.once('message', (msg: Buffer) => {
            resolve(msg);
          });
        }),
        timeout,
        `PCP port mapping request timed out after ${timeout}ms`
      );
      
      // Parse response
      if (response.length < 60) {
        throw new Error('Invalid PCP response length');
      }
      
      const version = response.readUInt8(0);
      const op = response.readUInt8(1);
      const resultCode = response.readUInt8(3);
      const lifetime_response = response.readUInt32BE(4);
      
      if (version !== NAT_CONSTANTS.PCP_VERSION) {
        throw new Error(`Invalid PCP version: ${version}`);
      }
      
      if (op !== NAT_CONSTANTS.PCP_OP_MAP) {
        throw new Error(`Invalid PCP operation: ${op}`);
      }
      
      if (resultCode !== NAT_CONSTANTS.PCP_RESULT_SUCCESS) {
        throw new Error(`PCP error: ${resultCode}`);
      }
      
      // Extract external port
      const externalPortResponse = response.readUInt16BE(50);
      
      // Extract external IP address
      const externalIP = `${response.readUInt8(56)}.${response.readUInt8(57)}.${response.readUInt8(58)}.${response.readUInt8(59)}`;
      
      debug(`PCP port mapping created: ${internalPort} -> ${externalPortResponse} (${protocol}), lifetime: ${lifetime_response}s, external IP: ${externalIP}`);
      
      return {
        success: true,
        externalPort: externalPortResponse,
        externalAddress: externalIP,
        lifetime: lifetime_response,
        protocol: 'PCP'
      };
    } catch (err) {
      debug(`Error creating port mapping via PCP: ${(err as Error).message}`);
      return {
        success: false,
        error: (err as Error).message,
        protocol: 'PCP'
      };
    } finally {
      if (socket) {
        socket.close();
      }
    }
  }
  
  /**
   * Create a port mapping using the best available method
   * Tries PCP first, then falls back to NAT-PMP
   * @param options - Port mapping options
   * @returns Port mapping result
   */
  async createPortMapping(options: {
    internalPort: number;
    externalPort?: number;
    protocol?: 'TCP' | 'UDP';
    description?: string;
    lifetime?: number;
    timeout?: number;
  }): Promise<PortMappingResult> {
    // Try PCP first (newer protocol)
    debug('Attempting port mapping with PCP');
    const pcpResult = await this.createPortMappingPCP({
      ...options,
      timeout: options.timeout || 2000
    });
    
    if (pcpResult.success) {
      debug('PCP port mapping successful');
      return pcpResult;
    }
    
    // Fall back to NAT-PMP
    debug('PCP failed, falling back to NAT-PMP');
    const natpmpResult = await this.createPortMappingNATPMP({
      ...options,
      timeout: options.timeout || 2000
    });
    
    if (natpmpResult.success) {
      debug('NAT-PMP port mapping successful');
      return natpmpResult;
    }
    
    // If both PCP and NAT-PMP fail, we can't create a port mapping
    debug('All port mapping methods failed');
    return {
      success: false,
      error: `PCP error: ${pcpResult.error}, NAT-PMP error: ${natpmpResult.error}`
    };
  }
  
  /**
   * Delete a port mapping using NAT-PMP
   * @param options - Port mapping options
   * @returns Port mapping result
   */
  async deletePortMappingNATPMP(options: {
    externalPort: number;
    protocol?: 'TCP' | 'UDP';
    timeout?: number;
  }): Promise<PortMappingResult> {
    // To delete a mapping, create a mapping with lifetime=0
    return this.createPortMappingNATPMP({
      internalPort: options.externalPort,
      externalPort: options.externalPort,
      protocol: options.protocol,
      lifetime: 0,
      timeout: options.timeout
    });
  }
  
  /**
   * Delete a port mapping using PCP
   * @param options - Port mapping options
   * @returns Port mapping result
   */
  async deletePortMappingPCP(options: {
    externalPort: number;
    protocol?: 'TCP' | 'UDP';
    timeout?: number;
  }): Promise<PortMappingResult> {
    // To delete a mapping, create a mapping with lifetime=0
    return this.createPortMappingPCP({
      internalPort: options.externalPort,
      externalPort: options.externalPort,
      protocol: options.protocol,
      lifetime: 0,
      timeout: options.timeout
    });
  }
  
  /**
   * Delete a port mapping using the best available method
   * @param options - Port mapping options
   * @returns Port mapping result
   */
  async deletePortMapping(options: {
    externalPort: number;
    protocol?: 'TCP' | 'UDP';
    timeout?: number;
  }): Promise<PortMappingResult> {
    // Try PCP first (newer protocol)
    debug('Attempting to delete port mapping with PCP');
    const pcpResult = await this.deletePortMappingPCP({
      ...options,
      timeout: options.timeout || 2000
    });
    
    if (pcpResult.success) {
      debug('PCP port mapping deletion successful');
      return pcpResult;
    }
    
    // Fall back to NAT-PMP
    debug('PCP failed, falling back to NAT-PMP');
    const natpmpResult = await this.deletePortMappingNATPMP({
      ...options,
      timeout: options.timeout || 2000
    });
    
    if (natpmpResult.success) {
      debug('NAT-PMP port mapping deletion successful');
      return natpmpResult;
    }
    
    // If both PCP and NAT-PMP fail, we can't delete the port mapping
    debug('All port mapping deletion methods failed');
    return {
      success: false,
      error: `PCP error: ${pcpResult.error}, NAT-PMP error: ${natpmpResult.error}`
    };
  }
}

// Create and export a singleton instance for convenience
export const natPmpClient = new NatPmpClient();

// Export convenience functions that use the singleton
export async function discoverGateway(): Promise<string | null> {
  return natPmpClient.discoverGateway();
}

export async function getExternalAddressNATPMP(
  gatewayIP?: string,
  timeout = 2000
): Promise<string | null> {
  const client = gatewayIP ? new NatPmpClient(gatewayIP) : natPmpClient;
  return client.getExternalAddress(timeout);
}

export async function createPortMapping(options: {
  internalPort: number;
  externalPort?: number;
  protocol?: 'TCP' | 'UDP';
  description?: string;
  lifetime?: number;
  timeout?: number;
  gatewayIP?: string;
}): Promise<PortMappingResult> {
  const { gatewayIP, ...rest } = options;
  const client = gatewayIP ? new NatPmpClient(gatewayIP) : natPmpClient;
  return client.createPortMapping(rest);
}

export async function deletePortMapping(options: {
  externalPort: number;
  protocol?: 'TCP' | 'UDP';
  timeout?: number;
  gatewayIP?: string;
}): Promise<PortMappingResult> {
  const { gatewayIP, ...rest } = options;
  const client = gatewayIP ? new NatPmpClient(gatewayIP) : natPmpClient;
  return client.deletePortMapping(rest);
} 
/**
 * NAT Traversal Manager
 * 
 * Orchestrates all available NAT traversal methods, trying them in order 
 * of reliability until a connection is established.
 * 
 * This module is the core connection establishment component in the Dig NAT Tools system:
 * 1. It manages the discovery of working connection methods for peers
 * 2. It tries different approaches in an intelligent order, based on reliability and user preference
 * 3. It handles direct connections, NAT traversal, and fallback mechanisms
 * 
 * The ConnectionClient delegates all connection establishment to this module,
 * focusing only on creating appropriate Connection objects from the results.
 * The ConnectionRegistry works with this module to optimize reconnection by
 * prioritizing previously successful methods.
 */

import * as net from 'net';
import dgram from 'dgram';
import Debug from 'debug';
import { CONNECTION_TYPE } from '../../../types/constants';
import { connectionRegistry } from '../registry/connection-registry';
import type { GunInstance } from '../../../types/gun';

// Import socket types
import type { Socket as NetSocket } from 'net';

// Import network utilities
import { 
  createTCPConnection, 
  createUDPConnection, 
  createUDPSocketBound,
  getSocketTypeForAddress,
  connectWithIPv6Preference,
  connectToFirstAvailableAddress 
} from '../network/network-utils';

// Import clients and types from new modular structure
import { UPnPClientWrapper } from './upnp/index';
import { NATPMPClientWrapper } from './nat-pmp/index';
import { HolePunchClientWrapper } from './hole-punch/index';
import { ICEClientWrapper } from './ice/index';
import { TURNClientWrapper } from './turn/index';
import { STUNClientWrapper } from './stun-gun/index';

// Import types from each module
import type { UPnPClient } from './upnp/types';
import type { NATPMPClient } from './nat-pmp/types';
import type { HolePunchClient } from './hole-punch/types';
import type { ICEClient, ICEResult, RTCIceServer } from './ice/types';
import type { TURNClient, TURNResult } from './turn/types';
import type { NATTraversalResult, NATTraversalOptions } from '../../../types/nat-traversal';

// Type references to prevent unused import warnings
// TURNServer type is used for server configuration
// ICEOptions and TURNOptions define the complete options interfaces

import { getPreferredIPs } from '../../utils/ip-helper';
import { isIPv6 } from 'net';
import { validatePeerAddress, validatePeerId } from '../../utils/security';

const debug = Debug('dig-nat-tools:nat-traversal');

// Initialize clients
const upnpClient: UPnPClient = new UPnPClientWrapper();
const natPmpClient: NATPMPClient = new NATPMPClientWrapper();
const holePunchClient: HolePunchClient = new HolePunchClientWrapper();
const iceClient: ICEClient = new ICEClientWrapper();
const turnClient: TURNClient = new TURNClientWrapper();
const stunClient: STUNClientWrapper = new STUNClientWrapper();

/**
 * NAT Traversal Manager class
 * 
 * This is a controller that tries multiple NAT traversal techniques 
 * to establish peer-to-peer connections.
 */
export class NATTraversalManager {
  // List of methods to try, in order of preference
  private defaultMethods: CONNECTION_TYPE[] = [
    CONNECTION_TYPE.IPV6,          // Try native IPv6 first
    CONNECTION_TYPE.TCP,           // Then direct TCP
    CONNECTION_TYPE.UDP,           // Then direct UDP
    CONNECTION_TYPE.UPNP,          // Then UPnP port mapping
    CONNECTION_TYPE.NAT_PMP,       // Then NAT-PMP port mapping
    CONNECTION_TYPE.STUN_GUN,      // Then STUN with GunJS signaling
    CONNECTION_TYPE.UDP_HOLE_PUNCH, // Then UDP hole punching
    CONNECTION_TYPE.TCP_HOLE_PUNCH, // Then TCP hole punching
    CONNECTION_TYPE.TCP_SIMULTANEOUS_OPEN, // Then TCP simultaneous open
    CONNECTION_TYPE.ICE,           // Then ICE (which includes STUN)
    CONNECTION_TYPE.TURN           // Finally TURN as last resort
  ];
  
  /**
   * Create a NATTraversalManager
   */
  constructor() {
    debug('NAT Traversal Manager initialized');
  }
  
  /**
   * Validate and secure connection parameters
   * @private
   */
  private validateConnectionParams(options: NATTraversalOptions): void {
    if (!options.peerId) {
      throw new Error('Peer ID is required');
    }

    if (!validatePeerId(options.peerId)) {
      throw new Error('Invalid peer ID format');
    }

    if (options.address && !validatePeerAddress(options.address)) {
      throw new Error('Invalid peer address');
    }

    if (options.port && (options.port < 1 || options.port > 65535)) {
      throw new Error('Invalid port number');
    }

    // Validate local ports if provided
    if (options.localPorts) {
      for (const port of options.localPorts) {
        if (port < 1 || port > 65535) {
          throw new Error('Invalid local port number');
        }
      }
    }
  }

  /**
   * Get preferred address family based on configuration
   * @private
   */
  private async getPreferredAddressFamily(): Promise<'IPv6' | 'IPv4'> {
    const { ipv6 } = await getPreferredIPs();
    return ipv6.length > 0 ? 'IPv6' : 'IPv4';
  }
  
  /**
   * Connect to a peer using the most appropriate NAT traversal method
   * @param options NAT traversal options
   * @returns A promise that resolves with the NAT traversal result
   */
  public async connect(options: NATTraversalOptions): Promise<NATTraversalResult> {
    // Validate connection parameters
    this.validateConnectionParams(options);

    const {
      peerId,
      address,
      port,
      localPort = 0,
      localPorts = [],
      protocol = 'TCP',
      gun,
      methodTimeout = 10000,
      overallTimeout = 60000,
      methods = this.defaultMethods,
      failFast = false,
      stunServers,
      turnServer,
      turnUsername,
      turnCredential
    } = options;
    
    debug(`Connecting to peer ${peerId} with address ${address}:${port}`);
    
    // Get preferred address family
    const preferredFamily = await this.getPreferredAddressFamily();
    debug(`Using preferred address family: ${preferredFamily}`);
    
    // If we have successfully connected to this peer before, try that method first
    let orderedMethods = [...methods];
    
    try {
      const previousEntry = await connectionRegistry.getConnectionMethod(peerId);
      if (previousEntry) {
        debug(`Found previous successful connection to ${peerId} using ${previousEntry.connectionType}`);
        
        // Move this method to the front of the array
        orderedMethods = orderedMethods.filter(m => m !== previousEntry.connectionType);
        orderedMethods.unshift(previousEntry.connectionType);
      }
    } catch (err) {
      debug(`Error retrieving previous connection: ${(err as Error).message}`);
    }
    
    // Overall timeout
    const timeoutPromise = new Promise<NATTraversalResult>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Overall connection timeout after ${overallTimeout}ms`));
      }, overallTimeout);
    });
    
    // Try methods in sequence
    const connectionPromise = this.tryMethodsSequentially(
      orderedMethods,
      peerId,
      {
        address,
        port,
        localPort,
        localPorts,
        protocol,
        gun,
        methodTimeout,
        failFast,
        stunServers,
        turnServer,
        turnUsername,
        turnCredential,
        preferredFamily
      }
    );
    
    try {
      // Race the connection promise against the timeout
      const result = await Promise.race([connectionPromise, timeoutPromise]);
      
      // If successful, record this method in the registry
      if (result.success && result.connectionType) {
        try {
          await connectionRegistry.saveSuccessfulConnection(
            peerId,
            result.connectionType,
            {
              address: result.remoteAddress,
              port: result.remotePort
            }
          );
        } catch (err) {
          debug(`Error saving connection to registry: ${(err as Error).message}`);
        }
      }
      
      return result;
    } catch (err) {
      debug(`Connection failed: ${(err as Error).message}`);
      return {
        success: false,
        error: `Connection failed: ${(err as Error).message}`
      };
    }
  }
  
  /**
   * Try NAT traversal methods in sequence
   * @param methods Array of methods to try
   * @param peerId Target peer ID
   * @param options Connection options
   * @returns Promise resolving with the first successful method
   */
  private async tryMethodsSequentially(
    methods: CONNECTION_TYPE[],
    peerId: string,
    options: {
      address?: string;
      port?: number;
      localPort?: number;
      localPorts?: number[];
      protocol?: 'TCP' | 'UDP';
      gun?: GunInstance;
      methodTimeout?: number;
      failFast?: boolean;
      stunServers?: string[];
      turnServer?: string;
      turnUsername?: string;
      turnCredential?: string;
      preferredFamily: 'IPv6' | 'IPv4';
    }
  ): Promise<NATTraversalResult> {
    const {
      address,
      port,
      localPort = 0,
      localPorts = [],
      protocol = 'TCP',
      gun,
      methodTimeout = 10000,
      failFast = false,
      stunServers,
      turnServer,
      turnUsername,
      turnCredential,
      preferredFamily
    } = options;
    
    for (const method of methods) {
      debug(`Trying connection method: ${method}`);
      
      try {
        // Different connection logic based on the method
        let result: NATTraversalResult;
        
        switch (method) {
          case CONNECTION_TYPE.IPV6:
            result = await this.tryIPv6Connection({
              address,
              port,
              localPort,
              localPorts,
              timeout: methodTimeout,
              preferredFamily
            });
            break;

          case CONNECTION_TYPE.TCP:
            result = await this.tryDirectConnection({
              address,
              port,
              localPort,
              localPorts,
              protocol: 'TCP',
              timeout: methodTimeout,
              preferredFamily
            });
            break;

          case CONNECTION_TYPE.UDP:
            result = await this.tryDirectConnection({
              address,
              port,
              localPort,
              localPorts,
              protocol: 'UDP',
              timeout: methodTimeout,
              preferredFamily
            });
            break;
            
          case CONNECTION_TYPE.UPNP:
            result = await this.tryUPnPConnection({
              address,
              port,
              localPort,
              localPorts,
              protocol,
              timeout: methodTimeout,
              preferredFamily
            });
            break;
            
          case CONNECTION_TYPE.NAT_PMP:
            result = await this.tryNATPMPConnection({
              address,
              port,
              localPort,
              protocol: 'TCP',
              timeout: methodTimeout,
              preferredFamily
            });
            break;
            
          case CONNECTION_TYPE.STUN_GUN:
            result = await this.trySTUNWithGun({
              peerId,
              address,
              port,
              localPort,
              localPorts,
              timeout: methodTimeout,
              preferredFamily,
              gun,
              stunServers
            });
            break;
            
          case CONNECTION_TYPE.UDP_HOLE_PUNCH:
            result = await this.tryUDPHolePunch({
              address,
              port,
              localPort,
              localPorts,
              timeout: methodTimeout,
              preferredFamily,
              gun
            });
            break;
            
          case CONNECTION_TYPE.TCP_HOLE_PUNCH:
            result = await this.tryTCPHolePunch({
              address,
              port,
              localPort,
              localPorts,
              timeout: methodTimeout,
              preferredFamily,
              gun
            });
            break;
            
          case CONNECTION_TYPE.TCP_SIMULTANEOUS_OPEN:
            result = await this.tryTCPSimultaneousOpen({
              address,
              port,
              localPort,
              localPorts,
              timeout: methodTimeout,
              preferredFamily
            });
            break;
            
          case CONNECTION_TYPE.ICE:
            result = await this.tryICE({
              address,
              port,
              localPort,
              localPorts,
              timeout: methodTimeout,
              preferredFamily,
              stunServers,
              turnServer,
              turnUsername,
              turnCredential
            });
            break;
            
          case CONNECTION_TYPE.TURN:
            result = await this.tryTURN({
              address,
              port,
              localPort,
              localPorts,
              timeout: methodTimeout,
              preferredFamily,
              turnServer,
              turnUsername,
              turnCredential,
              protocol
            });
            break;
            
          default:
            debug(`Unsupported connection method: ${method}`);
            result = {
              success: false,
              error: `Unsupported connection method: ${method}`
            };
        }
        
        if (result.success) {
          debug(`Connection successful using method: ${method}`);
          return {
            ...result,
            connectionType: method
          };
        } else if (failFast && result.error) {
          throw new Error(`Connection method ${method} failed: ${result.error}`);
        }
        
        debug(`Connection method ${method} failed, trying next method`);
      } catch (err) {
        debug(`Error with connection method ${method}: ${(err as Error).message}`);
        
        if (failFast) {
          throw err;
        }
      }
    }
    
    return {
      success: false,
      error: 'All connection methods failed'
    };
  }
  
  /**
   * Try multiple local ports sequentially until one succeeds
   * @private
   */
  private async tryWithMultiplePorts<T>(
    ports: number[],
    attemptFn: (localPort: number) => Promise<T>,
    fallbackPort: number = 0
  ): Promise<T> {
    // Try each port from the array
    if (ports && ports.length > 0) {
      let lastError: Error | null = null;
      
      for (const port of ports) {
        try {
          debug(`Attempting to use local port ${port}`);
          return await attemptFn(port);
        } catch (err) {
          lastError = err as Error;
          debug(`Failed to use port ${port}: ${lastError.message}`);
        }
      }
      
      // Re-throw the last error if all ports failed
      if (lastError) {
        debug('All specified ports failed, throwing last error');
        throw lastError;
      }
    }
    
    // Fall back to default port if no ports provided or all failed
    debug(`Using fallback port ${fallbackPort}`);
    return await attemptFn(fallbackPort);
  }

  /**
   * Try direct connection (TCP or UDP)
   */
  private async tryDirectConnection(options: {
    address?: string;
    port?: number;
    localPort?: number;
    localPorts?: number[];
    protocol?: 'TCP' | 'UDP';
    timeout?: number;
    preferredFamily?: 'IPv6' | 'IPv4';
  }): Promise<NATTraversalResult> {
    const {
      address,
      port,
      localPort = 0,
      localPorts = [],
      protocol = 'TCP',
      timeout = 10000,
      preferredFamily = 'IPv6'
    } = options;

    try {
      debug(`Trying direct ${protocol} connection to ${address}:${port}`);

      // Create a connect attempt function that can be used with multiple ports
      const attemptConnect = async (currentLocalPort: number): Promise<NATTraversalResult> => {
        if (protocol === 'TCP') {
          // Use network-utils createTCPConnection instead of manual implementation
          const socketType = preferredFamily === 'IPv6' ? 'tcp6' : 'tcp4';
          const socket = await createTCPConnection(
            address!, 
            port!, 
            socketType, 
            timeout,
            (err: Error) => debug(`Connection error: ${err.message}`),
            (socket: net.Socket) => debug(`Connected to ${address}:${port}`)
          );

          return {
            success: true,
            connectionType: CONNECTION_TYPE.TCP,
            socket,
            remoteAddress: address,
            remotePort: port
          };
        } else {
          // Use network-utils createUDPSocketBound for UDP connections
          const socket = await createUDPSocketBound(currentLocalPort, {
            enableIPv6: preferredFamily === 'IPv6',
            reuseAddr: true
          });
          
          // Send a test packet and wait for response
          const testPacket = Buffer.from('TEST_PACKET');
          
          const success = await new Promise<boolean>((resolve) => {
            const responseTimeout = setTimeout(() => {
              resolve(false);
            }, timeout);

            socket.once('message', () => {
              clearTimeout(responseTimeout);
              resolve(true);
            });

            socket.send(testPacket, port!, address!);
          });

          if (!success) {
            socket.close();
            throw new Error('No response received');
          }

          return {
            success: true,
            connectionType: CONNECTION_TYPE.UDP,
            socket,
            remoteAddress: address,
            remotePort: port
          };
        }
      };

      // Try with multiple ports or fall back to single localPort
      return await this.tryWithMultiplePorts(localPorts, attemptConnect, localPort);
      
    } catch (err) {
      debug(`Direct ${protocol} connection failed: ${(err as Error).message}`);
      return {
        success: false,
        connectionType: protocol === 'TCP' ? CONNECTION_TYPE.TCP : CONNECTION_TYPE.UDP,
        error: `Direct ${protocol} connection failed: ${(err as Error).message}`
      };
    }
  }
  
  /**
   * Try direct IPv6 connection
   */
  private async tryIPv6Connection(options: {
    address?: string;
    port?: number;
    localPort?: number;
    localPorts?: number[];
    timeout?: number;
    preferredFamily?: 'IPv6' | 'IPv4';
  }): Promise<NATTraversalResult> {
    const {
      address,
      port,
      localPort = 0,
      localPorts = [],
      timeout = 10000,
    } = options;

    try {
      debug(`Trying direct IPv6 connection to ${address}:${port}`);

      // Check if the address is IPv6
      if (!isIPv6(address!)) {
        return {
          success: false,
          error: 'Target address is not IPv6'
        };
      }

      // Create a connection attempt function that can be used with multiple ports
      const attemptConnect = async (currentLocalPort: number): Promise<NATTraversalResult> => {
        // Use network-utils createTCPConnection with tcp6 socket type
        const socket = await createTCPConnection(
          address!, 
          port!, 
          'tcp6', 
          timeout,
          (err: Error) => debug(`IPv6 connection error: ${err.message}`),
          (socket: net.Socket) => debug(`IPv6 connected to ${address}:${port}`)
        );

        return {
          success: true,
          connectionType: CONNECTION_TYPE.IPV6,
          socket,
          remoteAddress: address,
          remotePort: port
        };
      };

      // Try with multiple ports or fall back to single localPort
      return await this.tryWithMultiplePorts(localPorts, attemptConnect, localPort);

    } catch (err) {
      debug(`IPv6 connection failed: ${(err as Error).message}`);
      return {
        success: false,
        connectionType: CONNECTION_TYPE.IPV6,
        error: `IPv6 connection failed: ${(err as Error).message}`
      };
    }
  }
  
  /**
   * Try a connection using UPnP port mapping
   */
  private async tryUPnPConnection(options: {
    address?: string;
    port?: number;
    localPort?: number;
    localPorts?: number[];
    protocol?: 'TCP' | 'UDP';
    timeout?: number;
    preferredFamily?: 'IPv6' | 'IPv4';
  }): Promise<NATTraversalResult> {
    const {
      address,
      port,
      localPort = 0,
      localPorts = [],
      protocol = 'TCP',
      timeout = 10000,
      preferredFamily = 'IPv6'
    } = options;

    try {
      // Get the external IP address
      const externalIp = await upnpClient.getExternalAddress();
      if (!externalIp) {
        return {
          success: false,
          error: 'Could not get external IP address'
        };
      }

      // Check if external IP matches preferred family
      const isIpv6 = isIPv6(externalIp);
      if ((preferredFamily === 'IPv6' && !isIpv6) || 
          (preferredFamily === 'IPv4' && isIpv6)) {
        debug(`Skipping UPnP - external IP family ${isIpv6 ? 'IPv6' : 'IPv4'} does not match preferred family ${preferredFamily}`);
        return {
          success: false,
          error: `External IP family does not match preferred family ${preferredFamily}`
        };
      }

      debug(`Trying UPnP ${protocol} connection to ${address}:${port}`);

      // Create a connection attempt function that can be used with multiple ports
      const attemptConnect = async (currentLocalPort: number): Promise<NATTraversalResult> => {
        // Create a server socket for the peer to connect to
        let tcpServer: net.Server | null = null;
        let udpSocket: dgram.Socket | null = null;
        let actualLocalPort: number;

        if (protocol === 'TCP') {
          tcpServer = net.createServer();
          
          // Bind to the specified local port
          await new Promise<void>((resolve, reject) => {
            tcpServer!.once('error', reject);
            tcpServer!.listen(currentLocalPort, () => {
              tcpServer!.removeListener('error', reject);
              resolve();
            });
          });
          
          actualLocalPort = (tcpServer.address() as net.AddressInfo).port;
        } else {
          udpSocket = dgram.createSocket('udp4');
          
          // Bind to the specified local port
          await new Promise<void>((resolve, reject) => {
            udpSocket!.once('error', reject);
            udpSocket!.bind(currentLocalPort, () => {
              udpSocket!.removeListener('error', reject);
              resolve();
            });
          });
          
          actualLocalPort = (udpSocket.address() as net.AddressInfo).port;
        }

        debug(`Created ${protocol} server on local port ${actualLocalPort}`);

        // Create UPnP port mapping
        const mappingResult = await upnpClient.createMapping({
          protocol,
          internalPort: actualLocalPort,
          externalPort: 0, // Let UPnP choose the external port
          description: `Dig NAT Tools ${protocol} Server`,
          ttl: 3600 // 1 hour
        });

        if (!mappingResult) {
          if (protocol === 'TCP' && tcpServer) {
            tcpServer.close();
          } else if (udpSocket) {
            udpSocket.close();
          }
          
          throw new Error('UPnP port mapping failed');
        }

        // Get the mappings to find our external port
        const mappings = await upnpClient.getMappings();
        const ourMapping = mappings.find(m => 
          m.protocol === protocol && 
          m.internalPort === actualLocalPort
        );

        if (!ourMapping) {
          if (protocol === 'TCP' && tcpServer) {
            tcpServer.close();
          } else if (udpSocket) {
            udpSocket.close();
          }
          
          throw new Error('Could not find our UPnP mapping');
        }

        // For TCP, wait for a connection
        if (protocol === 'TCP' && tcpServer) {
          const serverSocket = tcpServer;
          
          try {
            // Create a promise that resolves when a connection is received
            const connectPromise = new Promise<net.Socket>((resolve) => {
              serverSocket.once('connection', (clientSocket) => {
                resolve(clientSocket);
              });
            });
            
            // Add a timeout
            const timeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(() => {
                serverSocket.close();
                reject(new Error(`UPnP connection timeout after ${timeout}ms`));
              }, timeout);
            });
            
            // Wait for connection or timeout
            const clientSocket = await Promise.race([connectPromise, timeoutPromise]);
            
            // Close the server socket as we only want the client connection
            serverSocket.close();
            
            return {
              success: true,
              connectionType: CONNECTION_TYPE.UPNP,
              socket: clientSocket,
              remoteAddress: clientSocket.remoteAddress || address,
              remotePort: clientSocket.remotePort || port
            };
          } catch (err) {
            // Make sure to clean up the port mapping
            await upnpClient.deleteMapping({
              protocol,
              internalPort: actualLocalPort,
              externalPort: ourMapping.externalPort
            });
            
            throw err;
          }
        } else if (udpSocket) {
          // For UDP, just return the socket
          return {
            success: true,
            connectionType: CONNECTION_TYPE.UPNP,
            socket: udpSocket,
            remoteAddress: address,
            remotePort: port
          };
        } else {
          throw new Error("Socket creation failed");
        }
      };

      // Try with multiple ports or fall back to single localPort
      return await this.tryWithMultiplePorts(localPorts, attemptConnect, localPort);

    } catch (err) {
      debug(`UPnP connection failed: ${(err as Error).message}`);
      return {
        success: false,
        connectionType: CONNECTION_TYPE.UPNP,
        error: `UPnP connection failed: ${(err as Error).message}`
      };
    }
  }
  
  /**
   * Try a connection using NAT-PMP port mapping
   */
  private async tryNATPMPConnection(options: {
    address?: string;
    port?: number;
    localPort?: number;
    protocol?: 'TCP' | 'UDP';
    timeout?: number;
    preferredFamily?: 'IPv6' | 'IPv4';
  }): Promise<NATTraversalResult> {
    const {
      address,
      port,
      localPort = 0,
      protocol = 'TCP',
      timeout = 10000,
      preferredFamily = 'IPv6'
    } = options;

    try {
      // Get the external IP address
      const externalIp = await natPmpClient.getExternalAddress();
      if (!externalIp) {
        return {
          success: false,
          error: 'Could not get external IP address'
        };
      }

      // Check if external IP matches preferred family
      const isIpv6 = isIPv6(externalIp);
      if ((preferredFamily === 'IPv6' && !isIpv6) || 
          (preferredFamily === 'IPv4' && isIpv6)) {
        debug(`Skipping NAT-PMP - external IP family ${isIpv6 ? 'IPv6' : 'IPv4'} does not match preferred family ${preferredFamily}`);
        return {
          success: false,
          error: `External IP family does not match preferred family ${preferredFamily}`
        };
      }

      debug(`Trying NAT-PMP ${protocol} connection to ${address}:${port}`);

      // Create a server socket for the peer to connect to
      let tcpServer: net.Server | null = null;
      let udpSocket: dgram.Socket | null = null;
      let actualLocalPort: number;

      if (protocol === 'TCP') {
        tcpServer = net.createServer();
        
        // Bind to the specified local port
        await new Promise<void>((resolve, reject) => {
          tcpServer!.once('error', reject);
          tcpServer!.listen(localPort, () => {
            tcpServer!.removeListener('error', reject);
            resolve();
          });
        });
        
        actualLocalPort = (tcpServer.address() as net.AddressInfo).port;
      } else {
        udpSocket = dgram.createSocket('udp4');
        
        // Bind to the specified local port
        await new Promise<void>((resolve, reject) => {
          udpSocket!.once('error', reject);
          udpSocket!.bind(localPort, () => {
            udpSocket!.removeListener('error', reject);
            resolve();
          });
        });
        
        actualLocalPort = (udpSocket.address() as net.AddressInfo).port;
      }

      debug(`Created ${protocol} server on local port ${actualLocalPort}`);

      // Create NAT-PMP port mapping
      const mappingResult = await natPmpClient.createMapping({
        protocol,
        internalPort: actualLocalPort,
        externalPort: 0, // Let NAT-PMP choose the external port
        ttl: 3600 // 1 hour
      });

      if (!mappingResult.success) {
        if (protocol === 'TCP' && tcpServer) {
          tcpServer.close();
        } else if (udpSocket) {
          udpSocket.close();
        }
        
        return {
          success: false,
          connectionType: CONNECTION_TYPE.NAT_PMP,
          error: mappingResult.error || 'NAT-PMP port mapping failed'
        };
      }

      // For TCP, wait for a connection
      if (protocol === 'TCP' && tcpServer) {
        const serverSocket = tcpServer;
        
        try {
          // Create a promise that resolves when a connection is received
          const connectPromise = new Promise<net.Socket>((resolve) => {
            serverSocket.once('connection', (clientSocket) => {
              resolve(clientSocket);
            });
          });
          
          // Add a timeout
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              serverSocket.close();
              reject(new Error(`NAT-PMP connection timeout after ${timeout}ms`));
            }, timeout);
          });
          
          // Wait for connection or timeout
          const clientSocket = await Promise.race([connectPromise, timeoutPromise]);
          
          // Close the server socket as we only want the client connection
          serverSocket.close();
          
          return {
            success: true,
            connectionType: CONNECTION_TYPE.NAT_PMP,
            socket: clientSocket,
            remoteAddress: clientSocket.remoteAddress || address,
            remotePort: clientSocket.remotePort || port
          };
        } catch (err) {
          // Make sure to clean up the port mapping
          await natPmpClient.deleteMapping({
            protocol,
            internalPort: actualLocalPort,
            externalPort: mappingResult.externalPort!
          });
          
          throw err;
        }
      } else if (udpSocket) {
        // For UDP, just return the socket
        return {
          success: true,
          connectionType: CONNECTION_TYPE.NAT_PMP,
          socket: udpSocket,
          remoteAddress: address,
          remotePort: port
        };
      } else {
        throw new Error("Socket creation failed");
      }
    } catch (err) {
      debug(`NAT-PMP connection failed: ${(err as Error).message}`);
      return {
        success: false,
        connectionType: CONNECTION_TYPE.NAT_PMP,
        error: `NAT-PMP connection failed: ${(err as Error).message}`
      };
    }
  }
  
  /**
   * Try STUN-based connection with GunJS signaling
   */
  private async trySTUNWithGun(options: {
    peerId: string;
    address?: string;
    port?: number;
    localPort?: number;
    localPorts?: number[];
    timeout?: number;
    preferredFamily?: 'IPv6' | 'IPv4';
    gun?: GunInstance;
    stunServers?: string[];
  }): Promise<NATTraversalResult> {
    const {
      peerId,
      address,
      port,
      localPort = 0,
      localPorts = [],
      timeout = 10000,
      preferredFamily = 'IPv6',
      gun,
      stunServers = []
    } = options;

    if (!gun) {
      return {
        success: false,
        error: 'GunJS instance required for STUN-based connection'
      };
    }

    if (!stunServers || stunServers.length === 0) {
      return {
        success: false,
        error: 'STUN servers required for STUN-based connection'
      };
    }

    try {
      debug(`Trying STUN-based connection with GunJS signaling to peer ${peerId}`);

      // Create a connection attempt function that can be used with multiple ports
      const attemptConnect = async (currentLocalPort: number): Promise<NATTraversalResult> => {
        const result = await stunClient.connect({
          peerId,
          gun,
          servers: stunServers,
          localPort: currentLocalPort,
          timeout,
          preferredFamily,
          address,
          port
        });

        if (!result.success) {
          throw new Error(result.error || 'STUN connection failed');
        }

        return {
          success: true,
          connectionType: CONNECTION_TYPE.STUN_GUN,
          socket: result.socket,
          remoteAddress: result.remoteAddress,
          remotePort: result.remotePort,
          details: {
            localAddress: result.localAddress,
            localPort: result.localPort,
            externalAddress: result.externalAddress,
            externalPort: result.externalPort
          }
        };
      };

      // Try with multiple ports or fall back to single localPort
      return await this.tryWithMultiplePorts(localPorts, attemptConnect, localPort);

    } catch (err) {
      debug(`STUN-based connection failed: ${(err as Error).message}`);
      return {
        success: false,
        connectionType: CONNECTION_TYPE.STUN_GUN,
        error: `STUN-based connection failed: ${(err as Error).message}`
      };
    }
  }
  
  /**
   * Try ICE (Interactive Connectivity Establishment)
   */
  private async tryICE(options: {
    address?: string;
    port?: number;
    localPort?: number;
    localPorts?: number[];
    timeout?: number;
    preferredFamily?: 'IPv6' | 'IPv4';
    stunServers?: string[];
    turnServer?: string;
    turnUsername?: string;
    turnCredential?: string;
  }): Promise<NATTraversalResult> {
    const {
      address,
      port,
      localPort = 0,
      localPorts = [],
      timeout = 10000,
      preferredFamily = 'IPv6',
      stunServers = [],
      turnServer,
      turnUsername,
      turnCredential
    } = options;

    try {
      debug(`Trying ICE connection to ${address}:${port}`);

      // Prepare ICE servers configuration
      const iceServers: RTCIceServer[] = [
        // Add STUN servers
        ...stunServers.map(url => ({ urls: [url] }))
      ];

      // Add TURN server if provided
      if (turnServer && turnUsername && turnCredential) {
        iceServers.push({
          urls: [turnServer],
          username: turnUsername,
          credential: turnCredential
        });
      }

      // Create a connection attempt function that can be used with multiple ports
      const attemptConnect = async (currentLocalPort: number): Promise<NATTraversalResult> => {
        // Since ICEOptions doesn't have localPort property, we'll use a custom property
        // and manually add it to the configuration object
        const iceOptions: any = {
          peerId: address || '',
          servers: iceServers,
          timestamp: Date.now(),
          trickle: true, // Enable trickle ICE for better performance
          timeout,
          preferredFamily,
          security: {
            allowLoopback: false,
            allowPrivateNetwork: true,
            minPort: 1024,
            maxPort: 65535,
            requireEncryption: true,
            validateSignature: true,
            channelPrefix: 'ice'
          }
        };
        
        // Add localPort to options if needed
        if (currentLocalPort > 0) {
          iceOptions.localPort = currentLocalPort;
        }

        const result: ICEResult = await iceClient.connect(iceOptions);

        if (!result.success) {
          throw new Error(result.error || 'ICE connection failed');
        }

        // Extract connection details from ICE result
        const { localCandidate, dataChannel, details } = result;

        return {
          success: true,
          connectionType: CONNECTION_TYPE.ICE,
          socket: dataChannel as unknown as NetSocket, // Type coercion for compatibility
          remoteAddress: localCandidate?.address,
          remotePort: localCandidate?.port,
          details: {
            protocol: details?.protocol || 'TCP',
            secure: details?.secure || false,
            rtt: details?.rtt || 0
          }
        };
      };

      // Try with multiple ports or fall back to single localPort
      return await this.tryWithMultiplePorts(localPorts, attemptConnect, localPort);

    } catch (err) {
      debug(`ICE connection failed: ${(err as Error).message}`);
      return {
        success: false,
        connectionType: CONNECTION_TYPE.ICE,
        error: `ICE connection failed: ${(err as Error).message}`
      };
    }
  }

  /**
   * Try UDP hole punching
   */
  private async tryUDPHolePunch(options: {
    address?: string;
    port?: number;
    localPort?: number;
    localPorts?: number[];
    timeout?: number;
    preferredFamily?: 'IPv6' | 'IPv4';
    gun?: GunInstance;
  }): Promise<NATTraversalResult> {
    const {
      address,
      port,
      localPort = 0,
      localPorts = [],
      timeout = 10000,
      preferredFamily = 'IPv6',
      gun
    } = options;

    try {
      debug(`Trying UDP hole punch to ${address}:${port}`);

      // Create a connection attempt function that can be used with multiple ports
      const attemptConnect = async (currentLocalPort: number): Promise<NATTraversalResult> => {
        const result = await holePunchClient.punch({
          peerId: address!,
          gun,
          targetAddress: address!,
          targetPort: port!,
          localPort: currentLocalPort,
          timeout,
          protocol: 'UDP',
          preferredFamily
        });

        if (!result.success) {
          throw new Error(result.error || 'UDP hole punch failed');
        }

        return {
          success: true,
          connectionType: CONNECTION_TYPE.UDP_HOLE_PUNCH,
          socket: result.socket,
          remoteAddress: result.remoteAddress,
          remotePort: result.remotePort
        };
      };

      // Try with multiple ports or fall back to single localPort
      return await this.tryWithMultiplePorts(localPorts, attemptConnect, localPort);

    } catch (err) {
      debug(`UDP hole punch failed: ${(err as Error).message}`);
      return {
        success: false,
        connectionType: CONNECTION_TYPE.UDP_HOLE_PUNCH,
        error: `UDP hole punch failed: ${(err as Error).message}`
      };
    }
  }
  
  /**
   * Try TCP hole punching
   */
  private async tryTCPHolePunch(options: {
    address?: string;
    port?: number;
    localPort?: number;
    localPorts?: number[];
    timeout?: number;
    preferredFamily?: 'IPv6' | 'IPv4';
    gun?: GunInstance;
  }): Promise<NATTraversalResult> {
    const {
      address,
      port,
      localPort = 0,
      localPorts = [],
      timeout = 10000,
      preferredFamily = 'IPv6',
      gun
    } = options;

    try {
      debug(`Trying TCP hole punch to ${address}:${port}`);

      // Create a connection attempt function that can be used with multiple ports
      const attemptConnect = async (currentLocalPort: number): Promise<NATTraversalResult> => {
        const result = await holePunchClient.punch({
          peerId: address!,
          gun,
          targetAddress: address!,
          targetPort: port!,
          localPort: currentLocalPort,
          timeout,
          protocol: 'TCP',
          preferredFamily
        });

        if (!result.success) {
          throw new Error(result.error || 'TCP hole punch failed');
        }

        return {
          success: true,
          connectionType: CONNECTION_TYPE.TCP_HOLE_PUNCH,
          socket: result.socket,
          remoteAddress: result.remoteAddress,
          remotePort: result.remotePort
        };
      };

      // Try with multiple ports or fall back to single localPort
      return await this.tryWithMultiplePorts(localPorts, attemptConnect, localPort);

    } catch (err) {
      debug(`TCP hole punch failed: ${(err as Error).message}`);
      return {
        success: false,
        connectionType: CONNECTION_TYPE.TCP_HOLE_PUNCH,
        error: `TCP hole punch failed: ${(err as Error).message}`
      };
    }
  }
  
  /**
   * Try TCP simultaneous open
   */
  private async tryTCPSimultaneousOpen(options: {
    address?: string;
    port?: number;
    localPort?: number;
    localPorts?: number[];
    timeout?: number;
    preferredFamily?: 'IPv6' | 'IPv4';
  }): Promise<NATTraversalResult> {
    // This is a special case of TCP hole punching
    return this.tryTCPHolePunch(options);
  }
  
  /**
   * Try TURN (Traversal Using Relays around NAT)
   */
  private async tryTURN(options: {
    address?: string;
    port?: number;
    localPort?: number;
    localPorts?: number[];
    timeout?: number;
    preferredFamily?: 'IPv6' | 'IPv4';
    turnServer?: string;
    turnUsername?: string;
    turnCredential?: string;
    protocol?: 'TCP' | 'UDP';
  }): Promise<NATTraversalResult> {
    const {
      address,
      port,
      localPort = 0,
      localPorts = [],
      timeout = 10000,
      turnServer,
      turnUsername,
      turnCredential,
      protocol = 'TCP'
    } = options;

    if (!turnServer || !turnUsername || !turnCredential) {
      return {
        success: false,
        error: 'TURN connection requires server, username, and credential'
      };
    }

    try {
      debug(`Trying TURN connection to ${address}:${port}`);

      // Parse TURN server URL
      const turnUrl = new URL(turnServer);
      const secure = turnUrl.protocol === 'turns:';
      
      // Create a connection attempt function that can be used with multiple ports
      const attemptConnect = async (currentLocalPort: number): Promise<NATTraversalResult> => {
        const result: TURNResult = await turnClient.connect({
          server: {
            host: turnUrl.hostname,
            port: parseInt(turnUrl.port) || (secure ? 5349 : 3478),
            username: turnUsername,
            password: turnCredential,
            secure
          },
          localPort: currentLocalPort,
          timeout,
          protocol
        });

        if (!result.success) {
          throw new Error(result.error || 'TURN connection failed');
        }

        // Create permission for the peer
        if (address) {
          await turnClient.createPermission(address);
        }

        return {
          success: true,
          connectionType: CONNECTION_TYPE.TURN,
          socket: result.socket,
          remoteAddress: address,
          remotePort: port,
          details: {
            relayAddress: result.allocation?.relayAddress,
            relayPort: result.allocation?.relayPort
          }
        };
      };

      // Try with multiple ports or fall back to single localPort
      return await this.tryWithMultiplePorts(localPorts, attemptConnect, localPort);

    } catch (err) {
      debug(`TURN connection failed: ${(err as Error).message}`);
      return {
        success: false,
        connectionType: CONNECTION_TYPE.TURN,
        error: `TURN connection failed: ${(err as Error).message}`
      };
    }
  }
}

// Export a singleton instance for convenience
export const natTraversalManager = new NATTraversalManager();

/**
 * Helper function to connect to a peer using NAT traversal
 * This is a convenience wrapper around the natTraversalManager.connect method
 * @param options NAT traversal options
 * @returns A promise that resolves with the NAT traversal result
 */
export async function connectWithNATTraversal(options: NATTraversalOptions): Promise<NATTraversalResult> {
  return natTraversalManager.connect(options);
}

export default natTraversalManager; 
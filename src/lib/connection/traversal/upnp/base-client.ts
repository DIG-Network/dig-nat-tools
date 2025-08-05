/**
 * Base UPnP Client Implementation
 * 
 * Core implementation of UPnP functionality with security and signaling support.
 */

import { Socket, createSocket } from 'dgram';
import { EventEmitter } from 'events';
import * as http from 'http';
import * as https from 'https';
import * as xml2js from 'xml2js';
import type { Client as SOAPClient, IOptions } from 'strong-soap';
import { soap } from 'strong-soap';
import Debug from 'debug';
import type { 
  UPnPClient, 
  UPnPMapping, 
  UPnPMappingOptions,
  UPnPResult,
  UPnPSecurityOptions,
  UPnPSignalingOptions
} from './types';
import { UPnPStatus } from './types';
import { UPNP_CONSTANTS } from './constants';
import { UPnPSignaling } from './signaling';
import { createUDPSocketBound } from '../../network/network-utils';

const debug = Debug('dig-nat-tools:upnp:base-client');
const { Client } = soap;

interface SOAPResponse {
  success: boolean;
  error?: string;
  data?: any;
}

export class BaseUPnPClient extends EventEmitter implements UPnPClient {
  private socket: Socket;
  private mappings: Map<string, UPnPMapping> = new Map();
  private externalAddress: string | null = null;
  private initialized = false;
  private status: UPnPStatus = UPnPStatus.IDLE;
  private security: UPnPSecurityOptions;
  private signaling?: UPnPSignaling;
  private gatewayInfo?: {
    location: string;
    controlURL: string;
    serviceType: string;
  };
  private retryCount = 0;

  constructor(options: {
    security?: UPnPSecurityOptions;
    signaling?: UPnPSignalingOptions;
  } = {}) {
    super();
    this.security = {
      ...UPNP_CONSTANTS.DEFAULT_SECURITY_OPTIONS,
      ...options.security,
      allowedProtocols: (options.security?.allowedProtocols || UPNP_CONSTANTS.DEFAULT_SECURITY_OPTIONS.allowedProtocols) as ('TCP' | 'UDP')[]
    };

    createUDPSocketBound(0, {
      enableIPv6: false,
      reuseAddr: true
    }).then(socket => {
      this.socket = socket;
      this.setupSocket();
      
      if (options.signaling) {
        this.setupSignaling(options.signaling);
      }
      
      this.initialize().catch(error => {
        debug('Initialization error:', error);
        this.emit('error', error);
      });
    }).catch(error => {
      debug('Socket creation error:', error);
      this.emit('error', error);
    });
  }

  private setupSocket(): void {
    this.socket.on('error', (error) => {
      debug('Socket error:', error);
      this.emit('error', error);
    });

    this.socket.on('message', (msg, rinfo) => {
      this.handleSSDPResponse(msg.toString(), rinfo);
    });
  }

  private setupSignaling(options: UPnPSignalingOptions): void {
    this.signaling = new UPnPSignaling(
      options.gun,
      options.peerId,
      options.room || 'upnp'
    );

    this.signaling.on('mapping-request', async ({ peerId, options }) => {
      try {
        const result = await this.createMapping(options);
        const mapping: UPnPMapping = {
          protocol: options.protocol,
          internalPort: options.internalPort,
          externalPort: options.externalPort,
          description: options.description || 'UPnP Mapping',
          ttl: options.ttl || UPNP_CONSTANTS.DEFAULT_TTL,
          enabled: true,
          secure: true,
          lastVerified: Date.now()
        };
        await this.signaling!.respondToMapping(peerId, options, mapping, result);
      } catch (error) {
        debug('Error handling mapping request:', error);
      }
    });

    this.signaling.on('verification-request', async ({ peerId, mapping }) => {
      try {
        const isValid = await this.verifyMapping(mapping);
        await this.signaling!.respondToMapping(peerId, mapping, mapping, {
          success: isValid,
          details: {
            secure: true,
            verification: {
              lastChecked: Date.now(),
              method: 'peer'
            }
          }
        });
      } catch (error) {
        debug('Error handling verification request:', error);
      }
    });

    this.signaling.on('verify', async () => {
      await this.verifyAllMappings();
    });

    this.signaling.startVerification(
      options.verificationInterval || UPNP_CONSTANTS.VERIFICATION_INTERVAL
    );
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      this.setStatus(UPnPStatus.DISCOVERING);
      await this.discoverGateway();
      this.initialized = true;
      this.setStatus(UPnPStatus.READY);
    } catch (error) {
      this.setStatus(UPnPStatus.ERROR);
      throw error;
    }
  }

  private setStatus(status: UPnPStatus): void {
    this.status = status;
    this.emit('status', status);
  }

  private async discoverGateway(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ssdpRequest = Buffer.from(
        'M-SEARCH * HTTP/1.1\r\n' +
        `HOST: ${UPNP_CONSTANTS.SSDP_MULTICAST_ADDRESS}:${UPNP_CONSTANTS.SSDP_PORT}\r\n` +
        'MAN: "ssdp:discover"\r\n' +
        `MX: ${UPNP_CONSTANTS.SSDP_MX}\r\n` +
        `ST: ${UPNP_CONSTANTS.SSDP_ST}\r\n` +
        '\r\n'
      );

      const timeout = setTimeout(() => {
        if (this.retryCount < UPNP_CONSTANTS.MAX_RETRIES) {
          this.retryCount++;
          debug(`Discovery timeout, retrying (${this.retryCount}/${UPNP_CONSTANTS.MAX_RETRIES})`);
          this.socket.send(ssdpRequest, UPNP_CONSTANTS.SSDP_PORT, UPNP_CONSTANTS.SSDP_MULTICAST_ADDRESS);
        } else {
          reject(new Error('Gateway discovery timeout'));
        }
      }, UPNP_CONSTANTS.SSDP_TIMEOUT);

      this.socket.send(
        ssdpRequest,
        UPNP_CONSTANTS.SSDP_PORT,
        UPNP_CONSTANTS.SSDP_MULTICAST_ADDRESS,
        (error) => {
          if (error) {
            clearTimeout(timeout);
            reject(error);
          }
        }
      );

      this.once('gateway-found', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  private async handleSSDPResponse(response: string, rinfo: { address: string; port: number }): Promise<void> {
    debug(`Received SSDP response from ${rinfo.address}:${rinfo.port}`);
    
    if (!response.includes(UPNP_CONSTANTS.SSDP_ST)) {
      debug('Ignoring response - wrong service type');
      return;
    }

    const location = response.match(/LOCATION: (.+)\r\n/i)?.[1];
    if (!location) {
      debug('Ignoring response - no location header');
      return;
    }

    try {
      // Validate that location URL matches the sender's address
      const locationUrl = new URL(location);
      if (locationUrl.hostname !== rinfo.address) {
        debug(`Ignoring response - location hostname ${locationUrl.hostname} doesn't match sender ${rinfo.address}`);
        return;
      }

      const deviceDescription = await this.fetchDeviceDescription(location);
      const service = this.findIGDService(deviceDescription);
      
      if (service) {
        this.gatewayInfo = {
          location,
          controlURL: service.controlURL,
          serviceType: service.serviceType
        };
        debug(`Found valid IGD service at ${rinfo.address}:${rinfo.port}`);
        this.emit('gateway-found');
      } else {
        debug(`No IGD service found in device description from ${rinfo.address}`);
      }
    } catch (error) {
      debug('Error processing SSDP response:', error);
    }
  }

  private async fetchDeviceDescription(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      protocol.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          xml2js.parseString(data, (err: Error | null, result: any) => {
            if (err) reject(err);
            else resolve(result);
          });
        });
      }).on('error', reject);
    });
  }

  private findIGDService(description: any): any {
    try {
      const device = description.root.device[0];
      const services = device.serviceList[0].service;
      
      return services.find((service: any) => 
        UPNP_CONSTANTS.IGD_SERVICE_TYPES.includes(service.serviceType[0])
      );
    } catch (error) {
      debug('Error finding IGD service:', error);
      return null;
    }
  }

  private async verifyMapping(mapping: UPnPMapping): Promise<boolean> {
    try {
      const response = await this.sendSOAPRequest('GetSpecificPortMappingEntry', {
        NewRemoteHost: '',
        NewExternalPort: mapping.externalPort.toString(),
        NewProtocol: mapping.protocol
      });

      return response.success;
    } catch (error) {
      debug('Error verifying mapping:', error);
      return false;
    }
  }

  private async verifyAllMappings(): Promise<void> {
    for (const mapping of this.mappings.values()) {
      try {
        const isValid = await this.verifyMapping(mapping);
        if (!isValid) {
          this.mappings.delete(`${mapping.protocol}-${mapping.externalPort}`);
          this.emit('mapping-expired', mapping);
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        debug('Error verifying mapping:', errorMessage);
      }
    }
  }

  private async sendSOAPRequest(action: string, args: Record<string, string>): Promise<SOAPResponse> {
    if (!this.gatewayInfo) {
      return { success: false, error: 'Gateway not initialized' };
    }

    try {
      const url = new URL(this.gatewayInfo.controlURL, this.gatewayInfo.location).toString();
      const client = await new Promise<SOAPClient>((resolve, reject) => {
        const options: IOptions = {
          url,
          endpoint: url,
          wsdl: url + '?wsdl',
          httpClient: this.gatewayInfo!.location.startsWith('https') ? https : http
        };
        
        Client.create(options, (err: Error | null, client: SOAPClient) => {
          if (err) reject(err);
          else resolve(client);
        });
      });

      const result = await new Promise((resolve, reject) => {
        client[action](args, (err: Error | null, result: any) => {
          if (err) reject(err);
          else resolve(result);
        });
      });

      return { success: true, data: result };
    } catch (error) {
      return { 
        success: false, 
        error: `SOAP request failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  public async createMapping(options: UPnPMappingOptions): Promise<UPnPResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      if (!this.validateMappingOptions(options)) {
        throw new Error('Invalid mapping options');
      }

      this.setStatus(UPnPStatus.MAPPING);

      const mapping: UPnPMapping = {
        protocol: options.protocol,
        internalPort: options.internalPort,
        externalPort: options.externalPort,
        description: options.description || 'UPnP Mapping',
        ttl: options.ttl || UPNP_CONSTANTS.DEFAULT_TTL,
        enabled: true,
        secure: true,
        lastVerified: Date.now()
      };

      const response = await this.sendSOAPRequest('AddPortMapping', {
        NewRemoteHost: '',
        NewExternalPort: mapping.externalPort.toString(),
        NewProtocol: mapping.protocol,
        NewInternalPort: mapping.internalPort.toString(),
        NewInternalClient: await this.getInternalAddress(),
        NewEnabled: '1',
        NewPortMappingDescription: mapping.description,
        NewLeaseDuration: mapping.ttl.toString()
      });

      if (response.success) {
        const key = `${mapping.protocol}-${mapping.externalPort}`;
        this.mappings.set(key, mapping);
        this.setStatus(UPnPStatus.READY);

        return {
          success: true,
          externalPort: mapping.externalPort,
          externalAddress: await this.getExternalAddress(),
          lifetime: mapping.ttl,
          details: {
            secure: true,
            verification: {
              lastChecked: Date.now(),
              method: 'direct'
            }
          }
        };
      } else {
        if (this.signaling && options.signaling?.gun) {
          return await this.signaling.requestMapping(mapping);
        }
        throw new Error(response.error || 'Failed to create mapping');
      }
    } catch (error: unknown) {
      this.setStatus(UPnPStatus.ERROR);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private validateMappingOptions(options: UPnPMappingOptions): boolean {
    if (!options.protocol || !options.internalPort || !options.externalPort) {
      return false;
    }

    if (!this.security.allowedProtocols?.includes(options.protocol)) {
      return false;
    }

    const { min, max } = this.security.allowedPorts || { 
      min: UPNP_CONSTANTS.MIN_PORT, 
      max: UPNP_CONSTANTS.MAX_PORT 
    };

    if (options.internalPort < min || options.internalPort > max ||
        options.externalPort < min || options.externalPort > max) {
      return false;
    }

    if (options.ttl) {
      const minTTL = this.security.minTTL || UPNP_CONSTANTS.MIN_TTL;
      const maxTTL = this.security.maxTTL || UPNP_CONSTANTS.MAX_TTL;
      if (options.ttl < minTTL || options.ttl > maxTTL) {
        return false;
      }
    }

    if (this.mappings.size >= (this.security.maxMappings || UPNP_CONSTANTS.DEFAULT_SECURITY_OPTIONS.maxMappings!)) {
      return false;
    }

    return true;
  }

  public async deleteMapping(options: UPnPMappingOptions): Promise<UPnPResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const key = `${options.protocol}-${options.externalPort}`;
      const mapping = this.mappings.get(key);

      if (!mapping) {
        return {
          success: false,
          error: 'Mapping not found'
        };
      }

      const response = await this.sendSOAPRequest('DeletePortMapping', {
        NewRemoteHost: '',
        NewExternalPort: mapping.externalPort.toString(),
        NewProtocol: mapping.protocol
      });

      if (response.success) {
        this.mappings.delete(key);
        return {
          success: true,
          details: {
            secure: true,
            verification: {
              lastChecked: Date.now(),
              method: 'direct'
            }
          }
        };
      } else {
        throw new Error(response.error || 'Failed to delete mapping');
      }
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async getInternalAddress(): Promise<string> {
    return new Promise((resolve) => {
      const socket = createSocket('udp4');
      socket.connect(UPNP_CONSTANTS.SSDP_PORT, UPNP_CONSTANTS.SSDP_MULTICAST_ADDRESS, () => {
        const address = socket.address().address;
        socket.close();
        resolve(address);
      });
    });
  }

  public async getExternalAddress(): Promise<string | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const response = await this.sendSOAPRequest('GetExternalIPAddress', {});
      if (response.success && response.data) {
        const ipAddress = response.data['s:Envelope']['s:Body'][0]
          ['u:GetExternalIPAddressResponse'][0]
          ['NewExternalIPAddress'][0];
        this.externalAddress = ipAddress;
        return ipAddress;
      }
      return null;
    } catch (error) {
      debug('Error getting external address:', error);
      return null;
    }
  }

  public async getMappings(): Promise<UPnPMapping[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    return Array.from(this.mappings.values());
  }

  public getStatus(): UPnPStatus {
    return this.status;
  }

  public getCachedExternalAddress(): string | null {
    return this.externalAddress;
  }

  public close(): void {
    this.signaling?.close();
    this.socket.close();
    this.initialized = false;
    this.mappings.clear();
    this.externalAddress = null;
    this.removeAllListeners();
  }
} 
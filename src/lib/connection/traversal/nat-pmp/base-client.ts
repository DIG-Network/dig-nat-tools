/**
 * Base NAT-PMP Client Implementation
 * 
 * Core implementation of NAT Port Mapping Protocol functionality using nat-pmp package.
 */

import { EventEmitter } from 'events';
import { networkInterfaces } from 'os';
import type { NATPMPMappingOptions, NATPMPResult } from './types';
import { ERROR_MESSAGES } from './config';

interface NatPMPClient {
  externalIp(callback: (err: Error | null, info: { ip: Buffer }) => void): void;
  portMapping(options: {
    private: number;
    public: number;
    ttl: number;
    type: 'UDP' | 'TCP';
  }, callback: (err: Error | null, info: { public: number; ttl: number }) => void): void;
  portUnmapping(options: {
    private: number;
    public: number;
    type: 'UDP' | 'TCP';
  }, callback: (err: Error | null) => void): void;
  close(): void;
}

interface NatPMP {
  connect(gateway: string): NatPMPClient;
}

// Using require since the package doesn't have TypeScript types
const natpmp = require('nat-pmp') as NatPMP;

export class BaseNATPMPClient extends EventEmitter {
  private client: NatPMPClient | null = null;
  private gatewayIP: string | null = null;
  private externalAddress: string | null = null;
  private initialized = false;
  private mappings: Map<string, NATPMPMappingOptions> = new Map();

  constructor() {
    super();
    this.initialize();
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Get default gateway IP
      const interfaces = networkInterfaces();
      for (const addrs of Object.values(interfaces)) {
        if (!addrs) continue;
        
        for (const addr of addrs) {
          if (addr.family === 'IPv4' && !addr.internal) {
            const ipParts = addr.address.split('.');
            ipParts[3] = '1';
            this.gatewayIP = ipParts.join('.');
            break;
          }
        }
        if (this.gatewayIP) break;
      }

      if (!this.gatewayIP) {
        throw new Error(ERROR_MESSAGES.GATEWAY_NOT_FOUND);
      }

      this.client = natpmp.connect(this.gatewayIP);
      await this.refreshExternalAddress();
      this.initialized = true;
      this.emit('ready');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  private async refreshExternalAddress(): Promise<void> {
    if (!this.client) {
      throw new Error(ERROR_MESSAGES.NOT_INITIALIZED);
    }

    return new Promise((resolve, reject) => {
      this.client!.externalIp((err: Error | null, info: { ip: Buffer }) => {
        if (err) {
          reject(err);
          return;
        }
        this.externalAddress = info.ip.join('.');
        resolve();
      });
    });
  }

  private getMappingKey(options: NATPMPMappingOptions): string {
    return `${options.protocol}-${options.internalPort}-${options.externalPort}`;
  }

  async createMapping(options: NATPMPMappingOptions): Promise<NATPMPResult> {
    if (!this.initialized || !this.client) {
      await this.initialize();
    }

    const mappingKey = this.getMappingKey(options);

    return new Promise((resolve) => {
      this.client!.portMapping({
        private: options.internalPort,
        public: options.externalPort,
        ttl: options.ttl || 7200,
        type: options.protocol === 'UDP' ? 'UDP' : 'TCP'
      }, (err: Error | null, info: { public: number; ttl: number }) => {
        if (err) {
          resolve({
            success: false,
            error: err.message
          });
          return;
        }

        this.mappings.set(mappingKey, options);
        resolve({
          success: true,
          externalPort: info.public,
          externalAddress: this.externalAddress!,
          lifetime: info.ttl
        });
      });
    });
  }

  async deleteMapping(options: NATPMPMappingOptions): Promise<NATPMPResult> {
    if (!this.initialized || !this.client) {
      await this.initialize();
    }

    const mappingKey = this.getMappingKey(options);
    if (!this.mappings.has(mappingKey)) {
      return { success: false, error: 'Mapping not found' };
    }

    return new Promise((resolve) => {
      this.client!.portUnmapping({
        private: options.internalPort,
        public: options.externalPort,
        type: options.protocol === 'UDP' ? 'UDP' : 'TCP'
      }, (err: Error | null) => {
        if (err) {
          resolve({
            success: false,
            error: err.message
          });
          return;
        }

        this.mappings.delete(mappingKey);
        resolve({
          success: true,
          externalPort: options.externalPort,
          lifetime: 0
        });
      });
    });
  }

  async getExternalAddress(): Promise<string | null> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.externalAddress;
  }

  close(): void {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
    this.initialized = false;
    this.gatewayIP = null;
    this.externalAddress = null;
    this.mappings.clear();
  }
} 
/**
 * NAT-PMP Implementation
 * 
 * Implements NAT Port Mapping Protocol functionality with Gun signaling integration.
 */

import Gun from 'gun';
import type { IGunInstance } from 'gun';
import type { NATPMPClient, NATPMPMappingOptions, NATPMPResult } from './types';
import { BaseNATPMPClient } from './base-client';
import { NATPMPSignaling } from './signaling';

export * from './types';

/**
 * NAT-PMP client wrapper implementing the NATPMPClient interface
 * with integrated Gun signaling for peer discovery and coordination
 */
export class NATPMPClientWrapper implements NATPMPClient {
  private client: BaseNATPMPClient;
  private signaling: NATPMPSignaling | null = null;
  private peerId: string;

  constructor(options?: { 
    gunInstance?: IGunInstance;
    peerId?: string;
    room?: string;
  }) {
    this.client = new BaseNATPMPClient();
    this.peerId = options?.peerId || this.generatePeerId();

    if (options?.gunInstance && options?.room) {
      this.signaling = new NATPMPSignaling(
        options.gunInstance,
        this.peerId,
        options.room
      );
      this.setupSignalingHandlers();
    }
  }

  private generatePeerId(): string {
    return `nat-pmp-${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupSignalingHandlers(): void {
    if (!this.signaling) return;

    // Handle mapping requests from peers
    this.signaling.on('mapping-request', async (data: { peerId: string; mapping: NATPMPMappingOptions }) => {
      try {
        // Try to create the mapping locally
        const result = await this.client.createMapping(data.mapping);
        
        // Send the response back through signaling
        await this.signaling!.respondToMapping(
          data.peerId,
          data.mapping,
          result.externalAddress,
          result.externalPort,
          result.error
        );
      } catch (error) {
        // If there's an error, send that back
        await this.signaling!.respondToMapping(
          data.peerId,
          data.mapping,
          undefined,
          undefined,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    });
  }

  async createMapping(options: NATPMPMappingOptions): Promise<NATPMPResult> {
    // Try to create the mapping locally first
    const result = await this.client.createMapping(options);

    // If local mapping fails and we have signaling enabled, try through peers
    if (!result.success && this.signaling) {
      try {
        // Request mapping through peers
        const peerResult = await this.signaling.requestMapping(options);
        
        if (peerResult.success) {
          return {
            success: true,
            externalPort: peerResult.externalPort,
            externalAddress: peerResult.externalAddress,
            lifetime: options.ttl || 7200 // Use requested TTL or default
          };
        } else {
          return {
            success: false,
            error: peerResult.error || 'Peer mapping failed'
          };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Signaling error'
        };
      }
    }

    return result;
  }

  async deleteMapping(options: NATPMPMappingOptions): Promise<NATPMPResult> {
    return this.client.deleteMapping(options);
  }

  async getExternalAddress(): Promise<string | null> {
    return this.client.getExternalAddress();
  }

  close(): void {
    this.client.close();
  }
} 
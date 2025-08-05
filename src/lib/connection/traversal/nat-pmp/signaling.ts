/**
 * NAT-PMP Signaling Integration
 * 
 * Handles peer discovery and connection coordination using Gun.
 */

import { EventEmitter } from 'events';
import type { IGunInstance } from 'gun';
import type { NATPMPMappingOptions } from './types';

interface SignalingMessage {
  type: 'mapping-request' | 'mapping-response';
  peerId: string;
  mapping?: NATPMPMappingOptions;
  externalAddress?: string;
  externalPort?: number;
  error?: string;
  timestamp: number;
}

export class NATPMPSignaling extends EventEmitter {
  private gun: IGunInstance;
  private peerId: string;
  private room: string;
  private pendingRequests: Map<string, (result: any) => void> = new Map();

  constructor(gunInstance: IGunInstance, peerId: string, room: string) {
    super();
    this.gun = gunInstance;
    this.peerId = peerId;
    this.room = room;
    this.setupSignaling();
  }

  private setupSignaling(): void {
    // Subscribe to the room's messages
    this.gun.get(this.room).on((data: any) => {
      if (!data || !data.message) return;
      
      const message: SignalingMessage = data.message;
      
      // Ignore old messages (older than 30 seconds)
      if (Date.now() - message.timestamp > 30000) return;

      // Ignore our own messages
      if (message.peerId === this.peerId) return;

      if (message.type === 'mapping-request') {
        this.handleMappingRequest(message);
      } else if (message.type === 'mapping-response') {
        this.handleMappingResponse(message);
      }
    });
  }

  private handleMappingRequest(message: SignalingMessage): void {
    if (message.mapping) {
      this.emit('mapping-request', {
        peerId: message.peerId,
        mapping: message.mapping
      });
    }
  }

  private handleMappingResponse(message: SignalingMessage): void {
    const requestKey = `${message.peerId}-${message.mapping?.internalPort}-${message.mapping?.externalPort}`;
    const resolver = this.pendingRequests.get(requestKey);
    
    if (resolver) {
      resolver({
        success: !message.error,
        externalAddress: message.externalAddress,
        externalPort: message.externalPort,
        error: message.error
      });
      this.pendingRequests.delete(requestKey);
    }
  }

  public async requestMapping(mapping: NATPMPMappingOptions): Promise<any> {
    const message: SignalingMessage = {
      type: 'mapping-request',
      peerId: this.peerId,
      mapping,
      timestamp: Date.now()
    };

    // Create a promise that will be resolved when we get a response
    const requestKey = `${this.peerId}-${mapping.internalPort}-${mapping.externalPort}`;
    const responsePromise = new Promise((resolve) => {
      this.pendingRequests.set(requestKey, resolve);

      // Set a timeout to clean up if no response is received
      setTimeout(() => {
        if (this.pendingRequests.has(requestKey)) {
          this.pendingRequests.delete(requestKey);
          resolve({ success: false, error: 'Signaling timeout' });
        }
      }, 10000); // 10 second timeout
    });

    // Send the request through Gun
    await this.gun.get(this.room).get('message').put(message);

    return responsePromise;
  }

  public async respondToMapping(
    targetPeerId: string,
    mapping: NATPMPMappingOptions,
    externalAddress?: string,
    externalPort?: number,
    error?: string
  ): Promise<void> {
    const message: SignalingMessage = {
      type: 'mapping-response',
      peerId: this.peerId,
      mapping,
      externalAddress,
      externalPort,
      error,
      timestamp: Date.now()
    };

    await this.gun.get(this.room).get('message').put(message);
  }
} 
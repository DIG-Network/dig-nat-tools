/**
 * UPnP Signaling Integration
 * 
 * Handles peer discovery and connection coordination using Gun.
 */

import { EventEmitter } from 'events';
import type { IGunInstance } from 'gun';
import type { UPnPMapping, UPnPMappingOptions, UPnPResult } from './types';

interface SignalingMessage {
  type: 'mapping-request' | 'mapping-response' | 'verify-request' | 'verify-response';
  peerId: string;
  targetPeerId?: string;
  options?: UPnPMappingOptions;
  mapping?: UPnPMapping;
  result?: UPnPResult;
  timestamp: number;
}

export class UPnPSignaling extends EventEmitter {
  private gun: IGunInstance;
  private peerId: string;
  private room: string;
  private verificationTimer?: NodeJS.Timeout;
  private pendingRequests: Map<string, (result: UPnPResult) => void> = new Map();

  constructor(gun: IGunInstance, peerId: string, room: string) {
    super();
    this.gun = gun;
    this.peerId = peerId;
    this.room = room;
    this.setupSignaling();
  }

  private setupSignaling(): void {
    this.gun.get(this.room).on((data: any) => {
      if (!data || !data.message) return;
      
      const message: SignalingMessage = data.message;
      
      // Ignore old messages (older than 30 seconds)
      if (Date.now() - message.timestamp > 30000) return;

      // Ignore our own messages
      if (message.peerId === this.peerId) return;

      switch (message.type) {
        case 'mapping-request':
          this.handleMappingRequest(message);
          break;
        case 'mapping-response':
          this.handleMappingResponse(message);
          break;
        case 'verify-request':
          this.handleVerifyRequest(message);
          break;
        case 'verify-response':
          this.handleVerifyResponse(message);
          break;
      }
    });
  }

  private handleMappingRequest(message: SignalingMessage): void {
    if (message.options) {
      this.emit('mapping-request', {
        peerId: message.peerId,
        options: message.options
      });
    }
  }

  private handleMappingResponse(message: SignalingMessage): void {
    if (!message.options) return;
    
    const requestKey = `${message.peerId}-${message.options.internalPort}-${message.options.externalPort}`;
    const resolver = this.pendingRequests.get(requestKey);
    
    if (resolver && message.result) {
      resolver(message.result);
      this.pendingRequests.delete(requestKey);
    }
  }

  private handleVerifyRequest(message: SignalingMessage): void {
    if (message.mapping) {
      this.emit('verification-request', {
        peerId: message.peerId,
        mapping: message.mapping
      });
    }
  }

  private handleVerifyResponse(message: SignalingMessage): void {
    if (message.mapping) {
      this.emit('verify', message.mapping);
    }
  }

  public async requestMapping(options: UPnPMappingOptions): Promise<UPnPResult> {
    const message: SignalingMessage = {
      type: 'mapping-request',
      peerId: this.peerId,
      options,
      timestamp: Date.now()
    };

    const requestKey = `${this.peerId}-${options.internalPort}-${options.externalPort}`;
    const responsePromise = new Promise<UPnPResult>((resolve) => {
      this.pendingRequests.set(requestKey, resolve);

      setTimeout(() => {
        if (this.pendingRequests.has(requestKey)) {
          this.pendingRequests.delete(requestKey);
          resolve({
            success: false,
            error: 'Signaling timeout'
          });
        }
      }, 10000);
    });

    await this.gun.get(this.room).get('message').put(message);
    return responsePromise;
  }

  public async respondToMapping(targetPeerId: string, options: UPnPMappingOptions, mapping: UPnPMapping, result: UPnPResult): Promise<void> {
    const message: SignalingMessage = {
      type: 'mapping-response',
      peerId: this.peerId,
      targetPeerId,
      options,
      mapping,
      result,
      timestamp: Date.now()
    };

    await this.gun.get(this.room).get('message').put(message);
  }

  public startVerification(interval: number = 3600000): void {
    if (this.verificationTimer) {
      clearInterval(this.verificationTimer);
    }

    this.verificationTimer = setInterval(() => {
      this.emit('verify');
    }, interval);
  }

  public close(): void {
    if (this.verificationTimer) {
      clearInterval(this.verificationTimer);
    }
    this.removeAllListeners();
  }
} 
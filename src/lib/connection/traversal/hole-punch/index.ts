/**
 * Hole Punching Implementation
 * 
 * Implements UDP/TCP hole punching functionality with GunJS signaling.
 */

import type { GunInstance } from '../../../../types/gun';
import type { HolePunchClient, HolePunchOptions, HolePunchResult, HolePunchEvents } from './types';
import { BaseHolePunchClient } from './base-client';
import { generateRandomString } from '../../../crypto/utils';

export * from './types';

/**
 * Hole punching client wrapper implementing the HolePunchClient interface
 */
export class HolePunchClientWrapper implements HolePunchClient {
  private client: BaseHolePunchClient;
  private gunInstance?: GunInstance;
  private peerId: string;

  constructor(options?: { 
    gunInstance?: GunInstance;
    peerId?: string;
    room?: string;
  }) {
    this.gunInstance = options?.gunInstance;
    this.peerId = options?.peerId || this.generatePeerId();
    
    // Initialize base client with default options
    this.client = new BaseHolePunchClient({
      protocol: 'UDP', // Default protocol, will be overridden in punch()
      peerId: this.peerId,
      gun: this.gunInstance,
      security: {
        validatePeerIdentity: true,
        validateSignature: true,
        requireEncryption: true,
        maxPacketSize: 1500, // Standard MTU size
        allowLoopback: false,
        allowPrivateNetwork: true,
        channelPrefix: options?.room || 'hole-punch'
      }
    });
  }

  private generatePeerId(): string {
    return `hole-punch-${generateRandomString(8)}`;
  }

  get status() {
    return this.client.status;
  }

  async punch(options: HolePunchOptions): Promise<HolePunchResult> {
    // Merge options with Gun instance if available
    const fullOptions: HolePunchOptions = {
      ...options,
      peerId: this.peerId,
      gun: this.gunInstance || options.gun
    };

    return this.client.punch(fullOptions);
  }

  close(): void {
    this.client.close();
  }

  on<K extends keyof HolePunchEvents>(event: K, listener: HolePunchEvents[K]): void {
    this.client.on(event, listener);
  }

  off<K extends keyof HolePunchEvents>(event: K, listener: HolePunchEvents[K]): void {
    this.client.off(event, listener);
  }
} 
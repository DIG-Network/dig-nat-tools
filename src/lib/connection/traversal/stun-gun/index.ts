/**
 * STUN with GunJS Implementation
 * 
 * Implements STUN-based NAT traversal with GunJS signaling.
 */

import type { STUNClient, STUNConnectionOptions, STUNResult, STUNEvents } from './types';
import { BaseSTUNClient } from './base-client';

export * from './types';

/**
 * STUN client wrapper implementing the STUNClient interface
 */
export class STUNClientWrapper implements STUNClient {
  private client: BaseSTUNClient;

  constructor() {
    this.client = new BaseSTUNClient();
  }

  get status() {
    return this.client.status;
  }

  async connect(options: STUNConnectionOptions): Promise<STUNResult> {
    return this.client.connect(options);
  }

  close(): void {
    this.client.close();
  }

  on(event: keyof STUNEvents, listener: (...args: any[]) => void): void {
    this.client.on(event, listener);
  }

  off(event: keyof STUNEvents, listener: (...args: any[]) => void): void {
    this.client.off(event, listener);
  }
} 
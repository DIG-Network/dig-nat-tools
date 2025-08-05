/**
 * TURN Implementation
 * 
 * Implements Traversal Using Relays around NAT functionality.
 */

import type { TURNClient, TURNOptions, TURNResult, TURNPermission, TURNEvents } from './types';
import { TURNConnectionState } from './types';
import { BaseTURNClient } from './base-client';

export * from './types';

/**
 * TURN client wrapper implementing the TURNClient interface
 */
export class TURNClientWrapper implements TURNClient {
  private client: BaseTURNClient;
  private state: TURNConnectionState = TURNConnectionState.NEW;

  constructor() {
    this.client = new BaseTURNClient();
    this.client.on('connectionStateChange', this.handleConnectionState.bind(this));
  }

  private handleConnectionState(state: TURNConnectionState): void {
    this.state = state;
    this.emit('connectionStateChange', state);
  }

  async connect(options: TURNOptions): Promise<TURNResult> {
    return this.client.connect(options);
  }

  async createPermission(peerAddress: string): Promise<TURNPermission> {
    return this.client.createPermission(peerAddress);
  }

  async refreshAllocation(lifetime?: number): Promise<boolean> {
    return this.client.refreshAllocation(lifetime);
  }

  close(): void {
    this.client.close();
  }

  on<K extends keyof TURNEvents>(event: K, listener: TURNEvents[K]): this {
    this.client.on(event, listener);
    return this;
  }

  off<K extends keyof TURNEvents>(event: K, listener: TURNEvents[K]): this {
    this.client.off(event, listener);
    return this;
  }

  emit<K extends keyof TURNEvents>(event: K, ...args: Parameters<TURNEvents[K]>): boolean {
    return this.client.emit(event, ...args);
  }

  getState(): TURNConnectionState {
    return this.state;
  }
} 
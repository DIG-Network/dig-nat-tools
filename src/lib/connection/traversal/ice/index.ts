/**
 * ICE Implementation
 * 
 * Implements Interactive Connectivity Establishment functionality with GunJS signaling.
 */

import type { ICEClient, ICEOptions, ICEResult, ICEEvents } from './types';
import { BaseICEClient } from './base-client';
import type { IGunInstance } from 'gun';

export * from './types';
export * from './constants';
export * from './webrtc';

/**
 * ICE client wrapper implementing the ICEClient interface
 */
export class ICEClientWrapper implements ICEClient {
  private client: BaseICEClient;
  private gunInstance?: IGunInstance;

  constructor(options?: { gunInstance?: IGunInstance }) {
    this.client = new BaseICEClient();
    this.gunInstance = options?.gunInstance;
  }

  async connect(options: ICEOptions): Promise<ICEResult> {
    // If Gun instance is available, add it to the options
    if (this.gunInstance) {
      options = {
        ...options,
        signaling: {
          gunInstance: this.gunInstance,
          ...options.signaling
        }
      };
    }
    return this.client.connect(options);
  }

  close(): void {
    this.client.close();
  }

  on<E extends keyof ICEEvents>(event: E, listener: ICEEvents[E]): void {
    this.client.on(event, listener);
  }

  off<E extends keyof ICEEvents>(event: E, listener: ICEEvents[E]): void {
    this.client.off(event, listener);
  }
} 
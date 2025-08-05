/**
 * UPnP Module
 * 
 * Exports UPnP functionality with security and signaling support.
 */

import { EventEmitter } from 'events';
import type { IGunInstance } from 'gun';
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
import { BaseUPnPClient } from './base-client';

export * from './types';
export { UPNP_CONSTANTS } from './constants';

/**
 * UPnP client wrapper implementing the UPnPClient interface
 * with integrated Gun signaling for peer discovery and coordination
 */
export class UPnPClientWrapper extends EventEmitter implements UPnPClient {
  private client: BaseUPnPClient;
  private status: UPnPStatus = UPnPStatus.IDLE;

  constructor(options?: { 
    gunInstance?: IGunInstance;
    peerId?: string;
    room?: string;
    security?: UPnPSecurityOptions;
  }) {
    super();
    const security = options?.security || UPNP_CONSTANTS.DEFAULT_SECURITY_OPTIONS;
    
    const signaling: UPnPSignalingOptions | undefined = options?.gunInstance ? {
      gun: options.gunInstance,
      peerId: options.peerId || `upnp-${Math.random().toString(36).substr(2, 9)}`,
      room: options.room || 'upnp',
      channelPrefix: UPNP_CONSTANTS.DEFAULT_SIGNALING_OPTIONS.channelPrefix,
      verificationInterval: UPNP_CONSTANTS.DEFAULT_SIGNALING_OPTIONS.verificationInterval,
      peerTimeout: UPNP_CONSTANTS.DEFAULT_SIGNALING_OPTIONS.peerTimeout
    } : undefined;

    this.client = new BaseUPnPClient({ 
      security: {
        ...security,
        allowedProtocols: (security.allowedProtocols || ['TCP', 'UDP']) as ('TCP' | 'UDP')[]
      },
      signaling 
    });
    
    this.setupEventForwarding();
  }

  private setupEventForwarding(): void {
    this.client.on('status', (status: UPnPStatus) => {
      this.status = status;
      this.emit('status', status);
    });

    ['error', 'warning', 'mapping-expired'].forEach(event => {
      this.client.on(event, (...args: any[]) => {
        this.emit(event, ...args);
      });
    });
  }

  public async createMapping(options: UPnPMappingOptions): Promise<UPnPResult> {
    return this.client.createMapping(options);
  }

  public async deleteMapping(options: UPnPMappingOptions): Promise<UPnPResult> {
    return this.client.deleteMapping(options);
  }

  public async getExternalAddress(): Promise<string | null> {
    return this.client.getExternalAddress();
  }

  public async getMappings(): Promise<UPnPMapping[]> {
    return this.client.getMappings();
  }

  public getStatus(): UPnPStatus {
    return this.status;
  }

  public close(): void {
    this.client.close();
    this.removeAllListeners();
  }

  public on(event: string | symbol, listener: (...args: any[]) => void): this {
    super.on(event, listener);
    return this;
  }

  public off(event: string | symbol, listener: (...args: any[]) => void): this {
    super.off(event, listener);
    return this;
  }
} 
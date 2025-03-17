/**
 * Type declarations for the stun package
 */

declare module 'stun' {
  import { EventEmitter } from 'events';

  export interface StunConstants {
    STUN_BINDING_REQUEST: number;
    STUN_ATTR_XOR_MAPPED_ADDRESS: number;
    // Add other constants as needed
  }

  export interface XorMappedAddressAttribute {
    address: string;
    family: string;
    port: number;
  }

  export interface StunResponse {
    getXorMappedAddressAttribute(): XorMappedAddressAttribute;
    // Add other methods as needed
  }

  export class StunClient extends EventEmitter {
    constructor(host: string, port: number);
    sendBindingRequest(): void;
    on(event: 'response', listener: (response: StunResponse) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    on(event: string, listener: (...args: any[]) => void): this;
  }

  export const constants: StunConstants;
} 
declare module 'multicast-service-discovery' {
  import { EventEmitter } from 'events';

  export interface MdnsServiceOptions {
    port: number;
    txt?: Record<string, string>;
  }

  export interface MdnsService {
    address: string;
    port: number;
    txt?: Record<string, string>;
  }

  export class MdnsDiscovery extends EventEmitter {
    constructor();
    announce(serviceType: string, options: MdnsServiceOptions): void;
    update(serviceType: string, options: MdnsServiceOptions): void;
    lookup(serviceType: string): void;
    destroy(): void;
    on(event: 'service', listener: (service: MdnsService) => void): this;
  }
} 
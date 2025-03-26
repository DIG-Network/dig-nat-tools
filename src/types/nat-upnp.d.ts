declare module 'nat-upnp' {
  export type NatUpnpProtocol = 'tcp' | 'udp';

  export interface NatUpnpMappingOptions {
    public: number;
    private: {
      port: number;
      host: string;
    };
    ttl: number;
    protocol: NatUpnpProtocol;
    description?: string;
  }

  export interface NatUpnpUnmappingOptions {
    public: number;
    protocol: NatUpnpProtocol;
  }

  export interface NatUpnpClient {
    externalIp(callback: (err: Error | null, ip: string) => void): void;
    portMapping(options: NatUpnpMappingOptions, callback: (err: Error | null) => void): void;
    portUnmapping(options: NatUpnpUnmappingOptions, callback: (err: Error | null) => void): void;
    close(): void;
  }

  export function createClient(): NatUpnpClient;
} 
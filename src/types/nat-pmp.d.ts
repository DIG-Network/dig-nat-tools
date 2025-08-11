// Type definitions for nat-pmp module
declare module 'nat-pmp' {
  export interface PortMapping {
    type: number;
    private: number;
    public: number;
    ttl: number;
  }

  export interface PortMappingResult {
    type: number;
    epoch: number;
    private: number;
    public: number;
    ttl: number;
  }

  export interface ExternalIpResult {
    type: number;
    epoch: number;
    ip: [number, number, number, number];
  }

  export interface Client {
    portMapping(options: PortMapping, callback: (err: Error | null, result?: PortMappingResult) => void): void;
    portUnmapping(options: { type: number; private: number }, callback: (err: Error | null) => void): void;
    externalIp(callback: (err: Error | null, result?: ExternalIpResult) => void): void;
    close(): void;
  }

  export function connect(gateway?: string): Client;
}

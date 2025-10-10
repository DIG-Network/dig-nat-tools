// Re-export from host.ts
import { FileHost, ConnectionMode } from './host';

// Re-export from client.ts
import { FileClient } from './client';

// Re-export registry components
import { GunRegistry } from './registry/gun-registry';

// Re-export simplified NAT tools
import { NatTools } from './nat-tools';

export {
  FileHost,
  ConnectionMode,
  FileClient,
  GunRegistry,
  NatTools
};

// Export types for TypeScript users
export type { HostOptions } from './host';
export type { FileClientOptions, DownloadOptions } from './client';
export type { IFileHost, IFileClient, HostCapabilities } from './interfaces';
export type { NatToolsOptions, SeedResult } from './nat-tools';

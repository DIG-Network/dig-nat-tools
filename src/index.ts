// Re-export from host.ts
import { FileHost, ConnectionMode } from './host';

// Re-export from client.ts
import { FileClient } from './client';

// Re-export registry components
import { GunRegistry } from './registry/gun-registry';

export {
  FileHost,
  ConnectionMode,
  FileClient,
  GunRegistry
};

// Export types for TypeScript users
export type { HostOptions } from './host';
export type { FileClientOptions, DownloadOptions } from './client';
export type { IFileHost, IFileClient, HostCapabilities } from './interfaces';

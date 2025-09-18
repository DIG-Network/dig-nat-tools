export interface NodeConfig {
  port: number;
  digDirectory: string;
  gunOptions: {
    peers?: string[];
    namespace?: string;
    webrtc?: {
      iceServers?: Array<{ urls: string | string[] }>;
    };
  };
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  syncInterval?: number; // milliseconds between sync checks
  maxConcurrentDownloads?: number;
}


export interface HostCapabilities {
  storeId: string;
  directHttp?: {
    available: boolean;
    ip: string;
    port: number;
  };
  webTorrent?: {
    available: boolean;
    magnetUris?: string[];
  };
  upnp?: {
    available: boolean;
    externalIp?: string;
    externalPort?: number;
  };
  webrtc?: {
    available: boolean;
    stunServers?: string[];
  };
  externalIp?: string;
  port?: number;
  lastSeen?: number;
}

export interface PeerFileAnnouncement {
  storeId: string;
  capabilities: HostCapabilities;
  timestamp: number;
}

export interface DownloadJob {
  hash: string;
  sourceUrl: string;
  targetPath: string;
  priority: number;
}

export interface DigFileInfo {
  path: string;
  hash?: string;
  size?: number;
  lastModified?: number;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
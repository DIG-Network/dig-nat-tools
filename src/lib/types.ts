/**
 * Type definitions for the dig-nat-tools library
 */

// Import required types
import { CONNECTION_TYPE, NODE_TYPE } from '../types/constants';

/**
 * Host configuration options
 */
export interface HostOptions {
  /** Callback function to serve file chunks */
  hostFileCallback: (sha256: string, startChunk: number, chunkSize: number) => Promise<Buffer[] | null>;
  
  /** Size of file chunks in bytes (default: 64KB) */
  chunkSize?: number;
  
  /** Array of STUN server URLs for NAT traversal */
  stunServers?: string[];
  
  /** Whether to enable direct TCP connections (enabled by default) */
  enableTCP?: boolean;
  
  /** Whether to enable direct UDP connections (enabled by default) */
  enableUDP?: boolean;
  
  /** Whether to enable WebRTC connections (enabled by default) */
  enableWebRTC?: boolean;
  
  /** Whether to use NAT-PMP/PCP for port mapping (enabled by default) */
  enableNATPMP?: boolean;
  
  /** Lifetime of port mappings in seconds (default: 3600 = 1 hour) */
  portMappingLifetime?: number;
  
  /** TCP port to listen on (default: random available port) */
  tcpPort?: number;
  
  /** UDP port to listen on (default: random available port) */
  udpPort?: number;
  
  /** Preferred connection types in order (default: ['DIRECT_TCP', 'DIRECT_UDP', 'WEBRTC', 'GUN_RELAY']) */
  preferredConnectionTypes?: string[];
  
  /** Gun options for relay connection */
  gunOptions?: GunOptions;
  
  /** Node type for DHT participation and resource allocation (default: STANDARD) */
  nodeType?: NODE_TYPE;
  
  /** Whether to enable persistent storage for DHT and peer information (default: false) */
  enablePersistence?: boolean;
  
  /** Directory to store persistent data (default: './.dig-nat-tools') */
  persistenceDir?: string;
  
  /** Maximum memory to use in MB (default: depends on nodeType) */
  maxMemoryMB?: number;
  
  /** Whether this host should handle specific DHT shards (default: false) */
  isShardHost?: boolean;
  
  /** Options for DHT configuration */
  dhtOptions?: {
    /** Prefixes of info hashes to handle in this shard (if empty and isShardHost is true, random prefixes will be selected) */
    shardPrefixes?: string[];
    
    /** Number of shard prefixes to choose if isShardHost is true (default: 3) */
    numShardPrefixes?: number;
    
    /** Length of each shard prefix in hexadecimal characters (default: 2) */
    shardPrefixLength?: number;
    
    /** Bootstrap nodes for DHT */
    bootstrapNodes?: Array<{ address: string, port: number }>;
    
    /** UDP port for DHT (default: same as host UDP port) */
    udpPort?: number;
  };
  
  /** Directory to watch for files to automatically announce (optional) */
  watchDir?: string;
  
  /** Whether to recursively scan subdirectories in watchDir (default: true) */
  watchRecursive?: boolean;
  
  /** File extensions to include when scanning watchDir (e.g. ['.mp4', '.mkv']) */
  watchIncludeExtensions?: string[];
  
  /** File extensions to exclude when scanning watchDir (e.g. ['.tmp', '.part']) */
  watchExcludeExtensions?: string[];
  
  /** Maximum file size in bytes to consider for automatic announcements (default: no limit) */
  watchMaxFileSize?: number;
  
  /** Whether to store the file hash cache between sessions (default: true) */
  watchPersistHashes?: boolean;
  
  /** Priority level for announced files from watchDir (default: MEDIUM) */
  watchAnnouncePriority?: 'high' | 'medium' | 'low';
}

/**
 * Client configuration options
 */
export interface ClientOptions {
  /** Size of file chunks in bytes (default: 64KB) */
  chunkSize?: number;
  
  /** Array of STUN server URLs for NAT traversal */
  stunServers?: string[];
  
  /** Request timeout in milliseconds (default: 30000) */
  requestTimeout?: number;
  
  /** Whether to enable WebRTC connections (enabled by default) */
  enableWebRTC?: boolean;
  
  /** Whether to use NAT-PMP/PCP for port mapping and IP discovery (enabled by default) */
  enableNATPMP?: boolean;
  
  /** Lifetime of port mappings in seconds (default: 3600 = 1 hour) */
  portMappingLifetime?: number;
  
  /** Gun options for relay connection */
  gunOptions?: GunOptions;
  
  /** Existing Gun.js instance to use (if provided, gunOptions are ignored) */
  gunInstance?: any;
  
  /** Existing socket from NAT traversal to use (net.Socket or dgram.Socket) */
  existingSocket?: any;
  
  /** Connection type of the existing socket */
  connectionType?: CONNECTION_TYPE;
  
  /** Remote peer address for the existing socket */
  remoteAddress?: string;
  
  /** Remote peer port for the existing socket */
  remotePort?: number;
  
  /** Node type for DHT participation and resource allocation (default: LIGHT) */
  nodeType?: NODE_TYPE;
  
  /** Whether to enable persistent storage for DHT and peer information (default: false) */
  enablePersistence?: boolean;
  
  /** Directory to store persistent data (default: './.dig-nat-tools') */
  persistenceDir?: string;
}

/**
 * Network manager configuration options
 */
export interface NetworkManagerOptions {
  /** Size of file chunks in bytes (default: 64KB) */
  chunkSize?: number;
  
  /** Array of STUN server URLs for NAT traversal */
  stunServers?: string[];
  
  /** Maximum number of concurrent chunk downloads (default: 5) */
  concurrency?: number;
  
  /** Timeout for peer connections in milliseconds (default: 30000) */
  peerTimeout?: number;
  
  /** Gun options for relay connection */
  gunOptions?: GunOptions;
}

/**
 * Options for file download
 */
export interface DownloadOptions {
  /** Path where the downloaded file will be saved */
  savePath: string;
  
  /** Size of file chunks in bytes (default: 64KB) */
  chunkSize?: number;
  
  /** Array of STUN server URLs for NAT traversal */
  stunServers?: string[];
  
  /** Progress callback function */
  onProgress?: (receivedBytes: number, totalBytes: number) => void;
  
  /** Error callback function */
  onError?: (error: Error) => void;
  
  /** Start downloading from a specific chunk (for resuming downloads) */
  startChunk?: number;
}

/**
 * Options for multi-peer file download
 */
export interface MultiDownloadOptions extends DownloadOptions {
  /** Callback for peer status updates */
  onPeerStatus?: (peerId: string, status: string, bytesFromPeer: number) => void;
}

/**
 * Result of a multi-peer download operation
 */
export interface DownloadResult {
  /** Path to the downloaded file */
  path: string;
  
  /** Statistics about each peer's contribution */
  peerStats: Record<string, PeerStats>;
}

/**
 * Statistics for a single peer's contribution to a download
 */
export interface PeerStats {
  /** Number of bytes downloaded from this peer */
  bytesDownloaded: number;
  
  /** Number of chunks downloaded from this peer */
  chunksDownloaded: number;
  
  /** Type of connection used with this peer */
  connectionType: string;
}

/**
 * Gun configuration options
 */
export interface GunOptions {
  /** Gun peers to connect to */
  peers?: string[];
  
  /** Local storage path */
  file?: string;
  
  /** Additional Gun options */
  [key: string]: any;
} 
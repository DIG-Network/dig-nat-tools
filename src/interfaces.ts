import { Readable } from 'stream';

export interface HostCapabilities {
  storeId?: string;
  upnp?: {
    ok: boolean;
    externalIp?: string;
    externalPort?: number;
  };
  webrtc?: {
    ok: boolean;
    stunServers?: string[];
  };
  // For plain connection
  externalIp?: string;
  port?: number;
}

export interface IFileHost {
  /**
   * Start the file hosting server
   * @returns Promise that resolves with capabilities information
   */
  start(): Promise<HostCapabilities>;

  /**
   * Stop the file hosting server
   * @returns Promise that resolves when server is stopped
   */
  stop(): Promise<void>;

  /**
   * Share a file and get the SHA256 hash for it
   * The returned hash is used as the file identifier in URLs (e.g., /files/{hash})
   * @param filePath Path to the file to share
   * @returns SHA256 hash of the file (64-character hexadecimal string)
   */
  shareFile(filePath: string): Promise<string>;

  /**
   * Remove a shared file by its SHA256 hash
   * @param hash SHA256 hash of the file to unshare (64-character hexadecimal string)
   * @param deleteFile Whether to delete the hash-named file from disk (default: false)
   * @returns True if file was found and removed from tracking, false otherwise
   */
  unshareFile(hash: string, deleteFile?: boolean): boolean;

  /**
   * Get a list of currently shared file hashes
   * Since files are stored with their hash names, only the hashes are returned
   * @returns Array of SHA256 hashes (64-character hexadecimal strings)
   */
  getSharedFiles(): string[];

  /**
   * Get the URL for a shared file by its SHA256 hash
   * The URL will be in the format: http://{host}:{port}/files/{hash}
   * @param hash SHA256 hash of the file (64-character hexadecimal string)
   * @returns URL to download the file (path component contains the SHA256 hash)
   */
  getFileUrl(hash: string): Promise<string>;
}

export interface IFileClient {
  /**
   * Download a file from a peer and return it as a buffer
   * @param url The URL of the file to download
   * @param options Download options
   * @returns Promise that resolves to the file content as a Buffer
   */
  downloadAsBuffer(url: string, options?: DownloadOptions): Promise<Buffer>;

  /**
   * Download a file from a peer and return it as a readable stream
   * @param url The URL of the file to download
   * @param options Download options
   * @returns Promise that resolves to a readable stream
   */
  downloadAsStream(url: string, options?: DownloadOptions): Promise<Readable>;

  /**
   * Check if a P2P server is online
   * @param baseUrl The base URL of the P2P server
   * @returns Promise that resolves to a boolean indicating server status
   */
  isServerOnline(baseUrl: string): Promise<boolean>;
}

export interface DownloadOptions {
  timeout?: number;
  onProgress?: (downloaded: number, total: number) => void;
}

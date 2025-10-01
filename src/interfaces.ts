import { Readable } from 'stream';
import { DownloadOptions } from './client';

export interface HostCapabilities {
  storeId: string;
  // Connection methods (in order of preference)
  directHttp?: {
    available: boolean;
    ip: string;
    port: number;
  };
  webTorrent?: {
    available: boolean;
    magnetUris?: string[]; // Magnet URIs for shared files
  };
  // Legacy fields (deprecated)
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
  lastSeen?: number; // Timestamp when the host was last seen
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
   * Share a file and get the filename for it
   * The returned filename is used as the file identifier in URLs (e.g., /files/{filename})
   * @param filePath Path to the file to share
   * @returns filename of the file (extracted from filePath)
   */
  shareFile(filePath: string): Promise<string>;

  /**
   * Remove a shared file by its filename
   * @param filename filename of the file to unshare
   * @param deleteFile Whether to delete the original file from disk (default: false)
   * @returns True if file was found and removed from tracking, false otherwise
   */
  unshareFile(filename: string, deleteFile?: boolean): boolean;

  /**
   * Get a list of currently shared filenames
   * @returns Array of filenames
   */
  getSharedFiles(): string[];

  /**
   * Get the URL for a shared file by its filename
   * The URL will be in the format: http://{host}:{port}/files/{filename}
   * @param filename filename of the file
   * @returns URL to download the file (path component contains the filename)
   */
  getFileUrl(filename: string): Promise<string>;
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

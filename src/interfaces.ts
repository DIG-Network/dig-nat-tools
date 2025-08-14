import { Readable } from 'stream';

export interface IFileHost {
  /**
   * Start the file hosting server
   * @returns Promise that resolves with external IP and port information
   */
  start(): Promise<{ externalIp: string, port: number }>;

  /**
   * Stop the file hosting server
   * @returns Promise that resolves when server is stopped
   */
  stop(): Promise<void>;

  /**
   * Share a file and get the SHA256 hash for it
   * @param filePath Path to the file to share
   * @returns SHA256 hash of the file
   */
  shareFile(filePath: string): Promise<string>;

  /**
   * Remove a shared file by its SHA256 hash
   * @param hash SHA256 hash of the file to unshare
   * @returns True if file was found and removed, false otherwise
   */
  unshareFile(hash: string): boolean;

  /**
   * Get a list of currently shared files with their SHA256 hashes
   * @returns Array of objects containing hash and file path
   */
  getSharedFiles(): { hash: string, path: string }[];

  /**
   * Get the URL for a shared file by its SHA256 hash
   * @param hash SHA256 hash of the file
   * @returns URL to download the file
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

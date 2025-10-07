import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import { IFileClient, HostCapabilities } from "./interfaces";
import { GunRegistry } from "./registry/gun-registry";
import { webTorrentManager, DownloadProgressEvent, MetadataEvent } from "./webtorrent-manager";

// Import Logger interface to match gun-registry pattern
interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export interface DownloadOptions {
  onProgress?: (downloaded: number, total: number) => void;
  maxFileSizeBytes?: number; // Maximum allowed file size for downloads (in bytes)
}

export interface FileClientOptions {
  peers?: string[]; // Gun.js peer URLs
  namespace?: string; // Gun.js namespace
  logger?: Logger; // Optional logger for debug output
}



export class FileClient extends EventEmitter implements IFileClient {
  private gunRegistry: GunRegistry;
  private options: FileClientOptions;
  private logger: Logger;
  private webTorrentListenersRegistered: boolean = false;
  private webTorrentDownloadListener?: (data: DownloadProgressEvent) => boolean;
  private webTorrentMetadataListener?: (data: MetadataEvent) => boolean;

  constructor(options: FileClientOptions = {}) {
    super(); // Call EventEmitter constructor
    
    // Increase max listeners to prevent warnings during testing/multiple usage
    this.setMaxListeners(0);
    
    this.options = {
      peers: options.peers || ["http://dig-relay-prod.eba-2cmanxbe.us-east-1.elasticbeanstalk.com/gun"],
      namespace: options.namespace || "dig-nat-tools",
    };

    // Create a default logger that only shows warnings and errors if none provided
    this.logger = options.logger || {
      debug: (): void => {}, // Silent for debug when no logger provided
      info: (): void => {}, // Silent for info when no logger provided  
      warn: (message: string, ...args: unknown[]): void => console.warn(message, ...args),
      error: (message: string, ...args: unknown[]): void => console.error(message, ...args)
    };

    this.gunRegistry = new GunRegistry({
      peers: this.options.peers,
      namespace: this.options.namespace,
      logger: this.logger, // Pass logger to gun registry
    });
  }

  /**
   * Download a file from a peer and return it as a buffer
   * Supports both HTTP and WebTorrent magnet URIs
   * @param url The URL or magnet URI of the file to download
   * @param options Download options
   * @returns A promise that resolves to the file content as a Buffer
   */
  public async downloadAsBuffer(
    url: string,
    options: DownloadOptions = {}
  ): Promise<Buffer> {
    this.logger.debug(`📥 Downloading file from: ${url}`);

    // Check if this is a WebTorrent magnet URI
    if (url.startsWith("magnet:")) {
      return this.downloadViaWebTorrent(url, options);
    }

    // For HTTP/HTTPS URLs, use direct download
    return FileClient.downloadAsBufferStatic(url, options);
  }

  /**
   * Download a file by automatically finding the best connection method
   * @param storeId The store ID of the host
   * @param filename The filename of the file
   * @param options Download options
   * @returns A promise that resolves to the file content as a Buffer
   */
  public async downloadFile(
    storeId: string,
    filename: string,
    options: DownloadOptions = {}
  ): Promise<Buffer> {
    this.logger.debug(`🔍 Looking up peer ${storeId} in registry...`);

    // 1. Look up peer in Gun.js registry
    const peer = await this.gunRegistry.findPeer(storeId);

    if (!peer) {
      throw new Error(`Peer ${storeId} not found in registry`);
    }

    this.logger.debug(`🎯 Found peer with capabilities:`, {
      directHttp: peer.directHttp?.available || false,
      webTorrent: peer.webTorrent?.available || false,
    });

    // 2. Try connection methods in order of preference: Direct HTTP > WebTorrent

    // Method 1: Try direct HTTP connection (fastest, no P2P overhead)
    if (peer.directHttp?.available) {
      try {
        this.logger.debug(
          `🌐 Attempting direct HTTP connection to ${peer.directHttp.ip}:${peer.directHttp.port}`
        );
        return await this.downloadViaHttp(
          peer.directHttp.ip,
          peer.directHttp.port,
          filename,
          options
        );
      } catch (error) {
        this.logger.warn(`⚠️ Direct HTTP connection failed:`, {
          ...this.serializeError(error),
          host: peer.directHttp.ip,
          port: peer.directHttp.port,
          filename: filename,
          storeId: storeId
        });
      }
    }

    // Method 2: Fall back to WebTorrent (if available)
    if (peer.webTorrent?.available && peer.webTorrent.magnetUris) {
      try {
        // Find the magnet URI for this specific file
        const magnetUri = peer.webTorrent.magnetUris.find((uri) =>
          uri.includes(filename)
        );
        if (magnetUri) {
          this.logger.debug(`🧲 Attempting WebTorrent download via magnet URI: ${magnetUri.substring(0, 100)}...`);
          return await this.downloadViaWebTorrent(magnetUri, options);
        } else {
          this.logger.warn(`⚠️ No magnet URI found for file ${filename}`, {
            filename: filename,
            availableMagnetUris: peer.webTorrent.magnetUris,
            storeId: storeId
          });
        }
      } catch (error) {
        this.logger.debug(`⚠️ WebTorrent connection failed:`, {
          ...this.serializeError(error),
          filename: filename,
          storeId: storeId
        });
      }
    }

    const errorMessage = `No viable connection method available for peer ${storeId}. Tried: ${
      [
        peer.directHttp?.available ? "Direct HTTP" : null,
        peer.webTorrent?.available ? "WebTorrent" : null,
      ]
        .filter(Boolean)
        .join(", ") || "None"
    }`;
    
    this.logger.debug(`❌ Failed to download file ${filename} from peer ${storeId}:`, {
      storeId: storeId,
      filename: filename,
      peerCapabilities: {
        directHttp: peer.directHttp?.available || false,
        webTorrent: peer.webTorrent?.available || false,
        magnetUrisCount: peer.webTorrent?.magnetUris?.length || 0
      },
      error: errorMessage
    });
    
    throw new Error(errorMessage);
  }

  /**
   * Set up WebTorrent event listeners (only called once)
   */
  private setupWebTorrentListeners(): void {
    if (this.webTorrentListenersRegistered) {
      return; // Already registered
    }

    // Forward events from the manager to our client
    this.webTorrentDownloadListener = (data: DownloadProgressEvent): boolean => this.emit('download', data);
    this.webTorrentMetadataListener = (data: MetadataEvent): boolean => this.emit('metadata', data);

    webTorrentManager.on('download', this.webTorrentDownloadListener);
    webTorrentManager.on('metadata', this.webTorrentMetadataListener);

    this.webTorrentListenersRegistered = true;
    this.logger.debug('📡 WebTorrent event listeners registered');
  }

  /**
   * Serialize error for logging purposes
   */
  private serializeError(error: unknown): Record<string, unknown> {
    if (!error) return {};
    
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as unknown as Record<string, unknown>)?.code,
        errno: (error as unknown as Record<string, unknown>)?.errno,
        syscall: (error as unknown as Record<string, unknown>)?.syscall,
        type: typeof error,
        toString: String(error)
      };
    }
    
    if (typeof error === 'object' && error !== null) {
      try {
        return {
          ...(error as Record<string, unknown>),
          toString: String(error),
          type: typeof error,
          constructor: (error as Record<string, unknown>).constructor?.constructor?.name || 'Unknown'
        };
      } catch (e) {
        return {
          toString: String(error),
          type: typeof error,
          serialization_error: String(e)
        };
      }
    }
    
    return {
      value: error,
      type: typeof error,
      toString: String(error)
    };
  }





  /**
   * Download a file via WebTorrent using the shared manager
   */
  private async downloadViaWebTorrent(magnetUri: string, options: DownloadOptions = {}): Promise<Buffer> {
    this.logger.debug(`🧲 Starting WebTorrent download via shared manager...`);

    // Initialize the shared WebTorrent manager if not already done
    if (!webTorrentManager.isAvailable()) {
      await webTorrentManager.initialize(this.logger);
    }

    // Set up event listeners (only done once)
    this.setupWebTorrentListeners();

    // Use the shared manager to download the file
    return webTorrentManager.downloadFile(magnetUri, options.maxFileSizeBytes);
  }

  /**
   * Download a file via HTTP
   */
  private async downloadViaHttp(
    host: string,
    port: number,
    filename: string,
    options: DownloadOptions = {}
  ): Promise<Buffer> {
    const url = `http://${host}:${port}/files/${encodeURIComponent(filename)}`;
    this.logger.debug(`🌐 HTTP download from: ${url}`);
    return FileClient.downloadAsBufferStatic(url, options);
  }

  /**
   * Download a file from a peer and return it as a readable stream
   * @param url The URL of the file to download
   * @param options Download options
   * @returns A promise that resolves to a readable stream
   */
  public async downloadAsStream(
    url: string,
    options: DownloadOptions = {}
  ): Promise<Readable> {
    return FileClient.downloadAsStreamStatic(url, options);
  }

  /**
   * Check if a P2P server is online
   * @param baseUrl The base URL of the P2P server
   * @returns A promise that resolves to a boolean indicating server status
   */
  public async isServerOnline(baseUrl: string): Promise<boolean> {
    return FileClient.isServerOnlineStatic(baseUrl);
  }

  /**
   * Find all available peers in the Gun.js registry
   * @returns A promise that resolves to an array of host capabilities
   */
  public async findAvailablePeers(): Promise<HostCapabilities[]> {
    return this.gunRegistry.findAvailablePeers();
  }

  /**
   * Check the capabilities of a specific peer
   * @param storeId The store ID of the peer
   * @returns A promise that resolves to the peer's capabilities or null if not found
   */
  public async checkPeerCapabilities(
    storeId: string
  ): Promise<HostCapabilities | null> {
    return this.gunRegistry.findPeer(storeId);
  }

  /**
   * Download a file from a peer and return it as a buffer (static version)
   * @param url The URL of the file to download
   * @param options Download options
   * @returns A promise that resolves to the file buffer
   */
  public static async downloadAsBufferStatic(
    url: string,
    options: DownloadOptions = {}
  ): Promise<Buffer> {
    const { onProgress } = options;

    return new Promise<Buffer>((resolve, reject) => {
      // Parse the URL
      const parsedUrl = new URL(url);

      // Select the appropriate protocol
      const protocol = parsedUrl.protocol === "https:" ? https : http;

      const req = protocol.get(
        url,
        (res: http.IncomingMessage) => {
          if (res.statusCode !== 200) {
            return reject(
              new Error(
                `Failed to download file: ${res.statusCode} ${res.statusMessage}`
              )
            );
          }

          const contentLength = parseInt(
            res.headers["content-length"] || "0",
            10
          );
          const chunks: Buffer[] = [];
          let downloadedBytes = 0;

          res.on("data", (chunk: Buffer) => {
            chunks.push(chunk);
            downloadedBytes += chunk.length;

            if (onProgress && contentLength > 0) {
              onProgress(downloadedBytes, contentLength);
            }
          });

          res.on("end", () => {
            resolve(Buffer.concat(chunks));
          });
        }
      );

      req.on("error", (err: Error) => {
        reject(err);
      });
    });
  }

  /**
   * Download a file from a peer and return it as a readable stream (static version)
   * @param url The URL of the file to download
   * @param options Download options
   * @returns A promise that resolves to a readable stream
   */
  public static async downloadAsStreamStatic(
    url: string,
    _options: DownloadOptions = {}
  ): Promise<Readable> {
    return new Promise<Readable>((resolve, reject) => {
      // Parse the URL
      const parsedUrl = new URL(url);

      // Select the appropriate protocol
      const protocol = parsedUrl.protocol === "https:" ? https : http;

      const req = protocol.get(
        url,
        (res: http.IncomingMessage) => {
          if (res.statusCode !== 200) {
            return reject(
              new Error(
                `Failed to download file: ${res.statusCode} ${res.statusMessage}`
              )
            );
          }

          resolve(res);
        }
      );

      req.on("error", (err: Error) => {
        reject(err);
      });
    });
  }

  /**
   * Check if a P2P server is online (static version)
   * @param baseUrl The base URL of the P2P server (e.g., http://192.168.1.100:30780)
   * @returns A promise that resolves to a boolean indicating whether the server is online
   */
  public static async isServerOnlineStatic(baseUrl: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      try {
        const url = `${baseUrl}/status`;

        // Parse the URL
        const parsedUrl = new URL(url);

        // Select the appropriate protocol
        const protocol = parsedUrl.protocol === "https:" ? https : http;

        const req = protocol.get(
          url,
          { timeout: 5000 },
          (res: http.IncomingMessage) => {
            if (res.statusCode !== 200) {
              resolve(false);
              return;
            }

            let data = "";
            res.on("data", (chunk) => {
              data += chunk;
            });

            res.on("end", () => {
              try {
                const response = JSON.parse(data);
                resolve(response.status === "online");
              } catch {
                resolve(false);
              }
            });
          }
        );

        req.on("error", () => {
          resolve(false);
        });
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Clean up resources
   */
  public async destroy(): Promise<void> {
    // Remove our specific event listeners from the shared WebTorrent manager
    if (this.webTorrentListenersRegistered && this.webTorrentDownloadListener && this.webTorrentMetadataListener) {
      webTorrentManager.off('download', this.webTorrentDownloadListener);
      webTorrentManager.off('metadata', this.webTorrentMetadataListener);
      this.webTorrentListenersRegistered = false;
      this.webTorrentDownloadListener = undefined;
      this.webTorrentMetadataListener = undefined;
      this.logger.debug('📡 WebTorrent event listeners removed');
    }

    // The shared WebTorrent manager handles its own cleanup
    // Individual clients don't need to destroy it since it's shared
    this.logger.debug("✅ FileClient cleanup completed (using shared WebTorrent manager)");
  }
}

import http from "node:http";
import https from "node:https";
import WebTorrent from "webtorrent";
import { URL } from "node:url";
import { Readable } from "node:stream";
import { EventEmitter } from "node:events";
import { IFileClient, HostCapabilities } from "./interfaces";
import { GunRegistry } from "./registry/gun-registry";

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

export interface DownloadProgressEvent {
  downloaded: number; // Total bytes downloaded
  downloadSpeed: number; // Current download speed in bytes/second
  progress: number; // Progress as a decimal between 0 and 1
  name: string; // Torrent/file name
  magnetUri: string; // The magnet URI being downloaded
}

export interface MetadataEvent {
  name: string; // Torrent/file name
  size: number; // Total size in bytes
  magnetUri: string; // The magnet URI
  infoHash: string; // The torrent info hash
}

// Global flag to ensure we only add the uncaught exception handler once
let globalErrorHandlerAdded = false;

export class FileClient extends EventEmitter implements IFileClient {
  private gunRegistry: GunRegistry;
  private webTorrentClient: WebTorrent.Instance | null = null;
  private options: FileClientOptions;
  private logger: Logger;

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
        this.logger.warn(`⚠️ WebTorrent connection failed:`, {
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
    
    this.logger.error(`❌ Failed to download file ${filename} from peer ${storeId}:`, {
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
   * Safely destroy a torrent with error handling for WebTorrent internal issues
   */
  private safeTorrentDestroy(torrent: WebTorrent.Torrent): void {
    try {
      torrent.destroy();
    } catch (error) {
      const errorCode = (error as unknown as { code?: string }).code;
      if (errorCode === 'ERR_INVALID_ARG_TYPE' && error instanceof Error && error.message.includes('listener')) {
        this.logger.warn("⚠️ WebTorrent internal error during torrent destroy (handled):", {
          message: error.message,
          code: errorCode,
          torrentName: torrent.name || 'Unknown',
          infoHash: torrent.infoHash || 'Unknown'
        });
      } else {
        this.logger.error("❌ Error destroying torrent:", {
          ...this.serializeError(error),
          torrentName: torrent.name || 'Unknown',
          infoHash: torrent.infoHash || 'Unknown'
        });
        // Re-throw non-listener errors as they might be important
        throw error;
      }
    }
  }

  /**
   * Parse magnet URI for debugging purposes
   */
  private parseMagnetUri(magnetUri: string): Record<string, unknown> {
    try {
      const url = new URL(magnetUri);
      
      return {
        infoHash: url.searchParams.get('xt')?.replace('urn:btih:', ''),
        displayName: url.searchParams.get('dn'),
        trackers: url.searchParams.getAll('tr'),
        webSeeds: url.searchParams.getAll('ws'),
        paramCount: Array.from(url.searchParams.keys()).length,
        fullUri: magnetUri.substring(0, 100) + (magnetUri.length > 100 ? '...' : '')
      };
    } catch (error) {
      return {
        error: this.serializeError(error),
        uri: magnetUri.substring(0, 100) + (magnetUri.length > 100 ? '...' : '')
      };
    }
  }

  /**
   * Download a file via WebTorrent
   */
  private async downloadViaWebTorrent(magnetUri: string, options: DownloadOptions = {}): Promise<Buffer> {
    this.logger.debug(`🧲 Starting WebTorrent download...`);

    // Validate magnet URI
    if (!magnetUri || !magnetUri.startsWith('magnet:')) {
      const error = new Error(`Invalid magnet URI: ${magnetUri}`);
      this.logger.error("❌ Invalid magnet URI:", {
        magnetUri: magnetUri,
        type: typeof magnetUri,
        length: magnetUri?.length || 0
      });
      throw error;
    }

    // Parse magnet URI for debugging
    const magnetInfo = this.parseMagnetUri(magnetUri);
    this.logger.debug("🔍 Magnet URI info:", magnetInfo);

    // Initialize WebTorrent client if not already done
    if (!this.webTorrentClient) {
      this.logger.debug(
        `✅ Initializing WebTorrent client with Windows-compatible settings...`
      );
      
      try {
        this.webTorrentClient = new WebTorrent();
        
        // Increase max listeners for the WebTorrent client to prevent warnings
        this.webTorrentClient.setMaxListeners(0);
        
        // Log client status (using safe property access)
        this.logger.debug(`🔧 WebTorrent client created:`, {
          activeTorrents: this.webTorrentClient.torrents.length,
          clientType: 'WebTorrent',
          initialized: !!this.webTorrentClient
        });

      } catch (error) {
        this.logger.error("❌ Failed to create WebTorrent client:", this.serializeError(error));
        throw error;
      }

      // Enhanced error handling with better logging
      this.webTorrentClient.on("error", (err: string | Error) => {
        this.logger.error("❌ WebTorrent client error:", {
          ...this.serializeError(err),
          activeTorrents: this.webTorrentClient?.torrents?.length || 0
        });
      });

      // Add global error handling for uncaught WebTorrent internal errors (only once)
      if (!globalErrorHandlerAdded) {
        globalErrorHandlerAdded = true;
        process.on('uncaughtException', (error) => {
          const errorCode = (error as unknown as { code?: string }).code;
          if (error.message && error.message.includes('listener') && errorCode === 'ERR_INVALID_ARG_TYPE') {
            // Use console.warn directly since we can't access logger from global scope
            console.warn("⚠️ WebTorrent internal event listener error (handled):", {
              message: error.message,
              code: errorCode,
              stack: error.stack?.split('\n').slice(0, 5).join('\n') // Truncate stack trace
            });
            // Don't re-throw this specific error as it's a WebTorrent internal cleanup issue
          } else {
            // Re-throw other uncaught exceptions
            throw error;
          }
        });
      }

      this.logger.debug(`✅ WebTorrent client initialized`);
    }

    return new Promise<Buffer>((resolve, reject) => {
      this.logger.debug(`🔄 Adding torrent from magnet URI: ${magnetUri.substring(0, 100)}...`);

      let torrent: WebTorrent.Torrent | null = null;
      try {
        torrent = this.webTorrentClient!.add(magnetUri);
      } catch (error) {
        this.logger.error("❌ Failed to add torrent:", {
          ...this.serializeError(error),
          magnetUri: magnetUri.substring(0, 100) + '...'
        });
        reject(error);
        return;
      }

      // Add metadata event emission
      torrent.on("metadata", () => {
        this.logger.debug(`📋 Torrent metadata ready: ${torrent!.name}, Size: ${torrent!.length} bytes`);
        
        const metadataData: MetadataEvent = {
          name: torrent!.name || 'Unknown',
          size: torrent!.length,
          magnetUri: magnetUri,
          infoHash: torrent!.infoHash || 'Unknown'
        };

        // Emit the metadata event that external code can listen to
        this.emit('metadata', metadataData);
      });

      torrent.on("ready", () => {
        this.logger.debug(
          `✅ Torrent ready! File: ${torrent!.name}, Size: ${torrent!.length} bytes, Files: ${torrent!.files.length}`
        );

        if (torrent!.files.length === 0) {
          this.safeTorrentDestroy(torrent!);
          this.logger.error("❌ No files in torrent", {
            name: torrent!.name,
            infoHash: torrent!.infoHash,
            magnetUri: magnetUri.substring(0, 100) + '...'
          });
          reject(new Error("No files in torrent"));
          return;
        }

        // Check file size against maximum allowed size
        if (options.maxFileSizeBytes && torrent!.length > options.maxFileSizeBytes) {
          this.safeTorrentDestroy(torrent!);
          const fileSizeMB = (torrent!.length / (1024 * 1024)).toFixed(2);
          const maxSizeMB = (options.maxFileSizeBytes / (1024 * 1024)).toFixed(2);
          this.logger.warn(`⚠️ File too large: ${fileSizeMB}MB > ${maxSizeMB}MB`);
          reject(new Error(
            `File size (${fileSizeMB} MB) exceeds maximum allowed size (${maxSizeMB} MB). Download cancelled.`
          ));
          return;
        }

        const file = torrent!.files[0]; // Get the first file
        const chunks: Buffer[] = [];

        this.logger.debug(`📥 Starting download of ${file.name} (${file.length} bytes)...`);

        // Create a stream to read the file
        const stream = file.createReadStream();

        stream.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });

        stream.on("end", () => {
          const buffer = Buffer.concat(chunks);
          this.logger.debug(
            `✅ WebTorrent download completed! ${buffer.length} bytes`
          );

          // Destroy torrent to clean up
          this.safeTorrentDestroy(torrent!);
          resolve(buffer);
        });

        stream.on("error", (error: unknown) => {
          this.safeTorrentDestroy(torrent!);
          this.logger.error("❌ Stream error during download:", {
            ...this.serializeError(error),
            fileName: file.name,
            fileLength: file.length
          });
          reject(error);
        });
      });

      // Enhanced torrent error handling
      torrent.on("error", (error: unknown) => {
        this.logger.debug(`❌ WebTorrent torrent error:`, {
          ...this.serializeError(error),
          magnetUri: magnetUri.substring(0, 100) + '...',
          infoHash: torrent?.infoHash,
          torrentName: torrent?.name
        });
        reject(error);
      });

      // Add additional torrent event listeners for debugging
      torrent.on("warning", (warning: unknown) => {
        this.logger.debug("⚠️ WebTorrent warning:", {
          ...this.serializeError(warning)
        });
      });

      torrent.on("noPeers", () => {
        this.logger.debug("⚠️ No peers found for torrent", {
          magnetUri: magnetUri.substring(0, 100) + '...',
          infoHash: torrent?.infoHash
        });
      });

      // Add download progress event emission
      torrent.on("download", (_bytes: number) => {
        const progressData: DownloadProgressEvent = {
          downloaded: torrent!.downloaded * 100,
          downloadSpeed: torrent!.downloadSpeed * 100,
          progress: torrent!.progress * 100,
          name: torrent!.name || 'Unknown',
          magnetUri: magnetUri
        };

        this.logger.debug(`📊 Download progress: ${(progressData.progress * 100).toFixed(1)}% - ${progressData.name}`, {
          downloaded: `${(progressData.downloaded / (1024 * 1024)).toFixed(2)}MB`,
          speed: `${(progressData.downloadSpeed / (1024 * 1024)).toFixed(2)}MB/s`,
          progress: `${(progressData.progress * 100).toFixed(1)}%`
        });

        // Emit the download event that external code can listen to
        this.emit('download', progressData);
      });
    });
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
    if (this.webTorrentClient) {
      try {
        // First destroy all active torrents safely
        if (this.webTorrentClient.torrents) {
          for (const torrent of this.webTorrentClient.torrents) {
            this.safeTorrentDestroy(torrent);
          }
        }
        
        // Then destroy the client
        this.webTorrentClient.destroy();
        this.webTorrentClient = null;
        this.logger.debug("✅ WebTorrent client destroyed");
      } catch (error) {
        const errorCode = (error as unknown as { code?: string }).code;
        if (errorCode === 'ERR_INVALID_ARG_TYPE' && error instanceof Error && error.message.includes('listener')) {
          this.logger.warn("⚠️ WebTorrent cleanup error (handled):", {
            message: error.message,
            code: errorCode
          });
        } else {
          this.logger.error("❌ Error destroying WebTorrent client:", this.serializeError(error));
          throw error;
        }
        this.webTorrentClient = null;
      }
    }
  }
}

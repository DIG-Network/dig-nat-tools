import WebTorrent from "webtorrent";
import { EventEmitter } from "node:events";
import { URL } from "node:url";

// Import Logger interface to match other files
interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
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

/**
 * Shared WebTorrent manager to prevent multiple instances and resource conflicts
 */
class WebTorrentManager extends EventEmitter {
  private static instance: WebTorrentManager | null = null;
  private webTorrentClient: WebTorrent.Instance | null = null;
  private logger: Logger;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  private constructor() {
    super();
    // Set unlimited max listeners for the manager
    this.setMaxListeners(0);
    
    // Create a default logger
    this.logger = {
      debug: (): void => {}, // Silent by default
      info: (): void => {}, 
      warn: (message: string, ...args: unknown[]): void => console.warn(message, ...args),
      error: (message: string, ...args: unknown[]): void => console.error(message, ...args)
    };
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): WebTorrentManager {
    if (!WebTorrentManager.instance) {
      WebTorrentManager.instance = new WebTorrentManager();
    }
    return WebTorrentManager.instance;
  }

  /**
   * Initialize the WebTorrent client (only once, atomically)
   */
  public async initialize(logger?: Logger): Promise<void> {
    // If already initialized, return immediately
    if (this.isInitialized && this.webTorrentClient) {
      return;
    }

    // If initialization is in progress, wait for it to complete
    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }

    // Start the initialization process atomically
    this.initializationPromise = this.performInitialization(logger);

    try {
      await this.initializationPromise;
    } finally {
      // Clear the promise once initialization is complete (success or failure)
      this.initializationPromise = null;
    }
  }

  /**
   * Perform the actual initialization work
   */
  private async performInitialization(logger?: Logger): Promise<void> {
    if (logger) {
      this.logger = logger;
    }

    this.logger.debug("🚀 Initializing shared WebTorrent client...");

    try {
      this.webTorrentClient = new WebTorrent();

      // Set unlimited max listeners for the WebTorrent client (if method exists)
      if (typeof this.webTorrentClient.setMaxListeners === 'function') {
        this.webTorrentClient.setMaxListeners(0);
      }

      // Enhanced error handling with better logging
      this.webTorrentClient.on("error", (err: string | Error) => {
        this.logger.error("❌ WebTorrent client error:", this.serializeError(err));
        // Emit error to any listeners
        this.emit('error', err);
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

      // Wait for WebTorrent to be ready
      await this.waitForReady();

      this.isInitialized = true;
      this.logger.debug("✅ Shared WebTorrent client initialized successfully");

    } catch (error) {
      this.logger.error("❌ Failed to initialize WebTorrent client:", this.serializeError(error));
      
      // Clean up on failure
      if (this.webTorrentClient) {
        try {
          this.webTorrentClient.destroy();
        } catch (destroyError) {
          this.logger.warn("⚠️ Error cleaning up failed WebTorrent client:", this.serializeError(destroyError));
        }
        this.webTorrentClient = null;
      }
      
      throw error;
    }
  }

  /**
   * Wait for WebTorrent client to be ready
   */
  private async waitForReady(): Promise<void> {
    if (!this.webTorrentClient) {
      throw new Error("WebTorrent client not initialized");
    }

    return new Promise((resolve) => {
      // WebTorrent is ready when it's initialized and can accept operations
      // We'll give it a small delay to ensure it's fully initialized
      this.logger.debug("⏳ Waiting for WebTorrent client to be ready...");

      setTimeout(() => {
        this.logger.debug("🎯 WebTorrent client is ready");
        resolve();
      }, 1000); // Give WebTorrent 1 second to initialize properly
    });
  }

  /**
   * Download a file via WebTorrent
   */
  public async downloadFile(magnetUri: string, maxFileSizeBytes?: number): Promise<Buffer> {
    if (!this.isInitialized || !this.webTorrentClient) {
      throw new Error("WebTorrent manager not initialized. Call initialize() first.");
    }

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
        if (maxFileSizeBytes && torrent!.length > maxFileSizeBytes) {
          this.safeTorrentDestroy(torrent!);
          const fileSizeMB = (torrent!.length / (1024 * 1024)).toFixed(2);
          const maxSizeMB = (maxFileSizeBytes / (1024 * 1024)).toFixed(2);
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
          downloaded: torrent!.downloaded,
          downloadSpeed: torrent!.downloadSpeed,
          progress: torrent!.progress,
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
   * Seed a file via WebTorrent
   */
  public async seedFile(filePath: string): Promise<string> {
    if (!this.isInitialized || !this.webTorrentClient) {
      throw new Error("WebTorrent manager not initialized. Call initialize() first.");
    }

    this.logger.debug(`🌱 Starting to seed file: ${filePath}`);

    return new Promise<string>((resolve, reject) => {
      try {
        this.webTorrentClient!.seed(filePath, (torrent) => {
          const magnetURI = torrent.magnetURI;
          this.logger.debug(`🧲 File seeded successfully: ${filePath}`);
          this.logger.debug(`   Magnet URI: ${magnetURI}`);
          resolve(magnetURI);
        });
      } catch (error) {
        this.logger.error("❌ Failed to seed file:", this.serializeError(error));
        reject(error);
      }
    });
  }

  /**
   * Remove a torrent from seeding
   */
  public removeTorrent(magnetUri: string): boolean {
    if (!this.isInitialized || !this.webTorrentClient) {
      this.logger.warn("⚠️ WebTorrent manager not initialized, cannot remove torrent");
      return false;
    }

    try {
      this.webTorrentClient.remove(magnetUri);
      this.logger.debug(`🗑️ Removed torrent: ${magnetUri.substring(0, 100)}...`);
      return true;
    } catch (error) {
      this.logger.warn("⚠️ Error removing torrent:", this.serializeError(error));
      return false;
    }
  }

  /**
   * Get active torrents count
   */
  public getActiveTorrentsCount(): number {
    if (!this.isInitialized || !this.webTorrentClient) {
      return 0;
    }
    return this.webTorrentClient.torrents.length;
  }

  /**
   * Check if WebTorrent is available
   */
  public isAvailable(): boolean {
    return this.isInitialized && this.webTorrentClient !== null;
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
        this.isInitialized = false;
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
        this.isInitialized = false;
      }
    }
  }
}

// Export the singleton instance
export const webTorrentManager = WebTorrentManager.getInstance();
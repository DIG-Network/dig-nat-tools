import http from "node:http";
import https from "node:https";
import WebTorrent from "webtorrent";
import { URL } from "node:url";
import { Readable } from "node:stream";
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
  timeout?: number;
  onProgress?: (downloaded: number, total: number) => void;
  maxFileSizeBytes?: number; // Maximum allowed file size for downloads (in bytes)
}

export interface FileClientOptions {
  peers?: string[]; // Gun.js peer URLs
  namespace?: string; // Gun.js namespace
  timeout?: number; // Download timeout
  logger?: Logger; // Optional logger for debug output
}

export class FileClient implements IFileClient {
  private gunRegistry: GunRegistry;
  private webTorrentClient: WebTorrent.Instance | null = null;
  private options: FileClientOptions;
  private logger: Logger;

  constructor(options: FileClientOptions = {}) {
    this.options = {
      peers: options.peers || ["http://nostalgiagame.go.ro:30878/gun"],
      namespace: options.namespace || "dig-nat-tools",
      timeout: options.timeout || 30000,
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
        this.logger.warn(`⚠️ Direct HTTP connection failed:`, error);
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
          this.logger.debug(`🧲 Attempting WebTorrent download via magnet URI`);
          return await this.downloadViaWebTorrent(magnetUri, options);
        } else {
          this.logger.warn(`⚠️ No magnet URI found for file ${filename}`);
        }
      } catch (error) {
        this.logger.warn(`⚠️ WebTorrent connection failed:`, error);
      }
    }

    throw new Error(
      `No viable connection method available for peer ${storeId}. Tried: ${
        [
          peer.directHttp?.available ? "Direct HTTP" : null,
          peer.webTorrent?.available ? "WebTorrent" : null,
        ]
          .filter(Boolean)
          .join(", ") || "None"
      }`
    );
  }

  /**
   * Download a file via WebTorrent
   */
  private async downloadViaWebTorrent(magnetUri: string, options: DownloadOptions = {}): Promise<Buffer> {
    this.logger.debug(`🧲 Starting WebTorrent download...`);

    // Initialize WebTorrent client if not already done
    if (!this.webTorrentClient) {
      this.logger.debug(
        `✅ Initializing WebTorrent client with Windows-compatible settings...`
      );
      this.webTorrentClient = new WebTorrent();

      // Add error handling
      this.webTorrentClient.on("error", (err: string | Error) => {
        this.logger.error("❌ WebTorrent client error:", err);
        // Don't throw here, just log the error
      });

      this.logger.debug(`✅ WebTorrent client initialized`);
    }

    return new Promise<Buffer>((resolve, reject) => {
      this.logger.debug(`🔄 Adding torrent from magnet URI...`);

      const torrent = this.webTorrentClient!.add(magnetUri);

      // Timeout handler
      const timeout = setTimeout(() => {
        if (torrent) {
          torrent.destroy();
        }
        reject(new Error("WebTorrent download timeout"));
      }, options.timeout || this.options.timeout);

      torrent.on("ready", () => {
        this.logger.debug(
          `✅ Torrent ready! File: ${torrent.name}, Size: ${torrent.length} bytes`
        );

        if (torrent.files.length === 0) {
          clearTimeout(timeout);
          torrent.destroy();
          reject(new Error("No files in torrent"));
          return;
        }

        // Check file size against maximum allowed size
        if (options.maxFileSizeBytes && torrent.length > options.maxFileSizeBytes) {
          clearTimeout(timeout);
          torrent.destroy();
          const fileSizeMB = (torrent.length / (1024 * 1024)).toFixed(2);
          const maxSizeMB = (options.maxFileSizeBytes / (1024 * 1024)).toFixed(2);
          reject(new Error(
            `File size (${fileSizeMB} MB) exceeds maximum allowed size (${maxSizeMB} MB). Download cancelled.`
          ));
          return;
        }

        const file = torrent.files[0]; // Get the first file
        const chunks: Buffer[] = [];

        this.logger.debug(`📥 Starting download of ${file.name}...`);

        // Create a stream to read the file
        const stream = file.createReadStream();

        stream.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });

        stream.on("end", () => {
          clearTimeout(timeout);
          const buffer = Buffer.concat(chunks);
          this.logger.debug(
            `✅ WebTorrent download completed! ${buffer.length} bytes`
          );

          // Destroy torrent to clean up
          torrent.destroy();
          resolve(buffer);
        });

        stream.on("error", (error) => {
          clearTimeout(timeout);
          torrent.destroy();
          reject(error);
        });
      });

      torrent.on("error", (error) => {
        clearTimeout(timeout);
        this.logger.error(`❌ WebTorrent error:`, error);
        reject(error);
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
    const { timeout = 30000, onProgress } = options;

    return new Promise<Buffer>((resolve, reject) => {
      // Parse the URL
      const parsedUrl = new URL(url);

      // Select the appropriate protocol
      const protocol = parsedUrl.protocol === "https:" ? https : http;

      const req = protocol.get(
        url,
        { timeout },
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

      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Download timed out"));
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
    options: DownloadOptions = {}
  ): Promise<Readable> {
    const { timeout = 30000 } = options;

    return new Promise<Readable>((resolve, reject) => {
      // Parse the URL
      const parsedUrl = new URL(url);

      // Select the appropriate protocol
      const protocol = parsedUrl.protocol === "https:" ? https : http;

      const req = protocol.get(
        url,
        { timeout },
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

      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Download timed out"));
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

        req.on("timeout", () => {
          req.destroy();
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
      this.webTorrentClient.destroy();
      this.webTorrentClient = null;
      this.logger.debug("✅ WebTorrent client destroyed");
    }
  }
}

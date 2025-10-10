import { webTorrentManager } from './webtorrent-manager';
import { GunRegistry, GunRegistryOptions } from './registry/gun-registry';
import * as fs from 'fs';
import * as path from 'path';

// Import Logger interface
interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export interface NatToolsOptions {
  peers?: string[];
  namespace?: string;
  logger?: Logger;
  webrtc?: {
    iceServers?: Array<{ urls: string | string[] }>;
  };
}

export interface SeedResult {
  filePath: string;
  magnetUri: string;
}

/**
 * Simplified NAT Tools for magnet URI sharing and WebTorrent operations
 */
export class NatTools {
  private registry: GunRegistry;
  private logger: Logger;
  private isInitialized: boolean = false;
  private seededMagnetUris: Map<string, string> = new Map(); // filePath -> magnetUri

  constructor(options: NatToolsOptions = {}) {
    // Create logger
    this.logger = options.logger || {
      debug: (): void => {},
      info: (): void => {},
      warn: (message: string, ...args: unknown[]): void => console.warn(message, ...args),
      error: (message: string, ...args: unknown[]): void => console.error(message, ...args)
    };

    // Initialize Gun registry
    const registryOptions: GunRegistryOptions = {
      peers: options.peers || ["http://dig-relay-prod.eba-2cmanxbe.us-east-1.elasticbeanstalk.com/gun"],
      namespace: options.namespace || "dig-nat-tools",
      webrtc: options.webrtc,
      logger: this.logger
    };

    this.registry = new GunRegistry(registryOptions);
  }

  /**
   * Initialize the NAT tools (WebTorrent and Gun registry)
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.debug("✅ NatTools already initialized");
      return;
    }

    this.logger.info("🚀 Initializing NatTools...");

    // Initialize WebTorrent manager
    await webTorrentManager.initialize(this.logger);

    this.isInitialized = true;
    this.logger.info("✅ NatTools initialized successfully");
  }

  /**
   * Seed a file and share its magnet URI via Gun.js registry
   * @param filePath Path to the file to seed
   * @returns Object containing file path, magnet URI, and info hash
   */
  public async seedFile(filePath: string): Promise<SeedResult> {
    if (!this.isInitialized) {
      throw new Error("NatTools not initialized. Call initialize() first.");
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    this.logger.info(`🌱 Seeding file: ${filePath}`);

    // Seed the file via WebTorrent
    const magnetUri = await webTorrentManager.seedFile(filePath);

    // Get the filename
    const fileName = path.basename(filePath);

    // Store in our local map
    this.seededMagnetUris.set(filePath, magnetUri);

    // Share magnet URI via Gun.js registry with fileName
    await this.registry.shareMagnetUri(magnetUri, fileName);

    this.logger.info(`✅ File seeded and shared: ${fileName}`);

    return {
      filePath,
      magnetUri
    };
  }

  /**
   * Stop seeding a file and remove its magnet URI from the registry
   * @param filePath Path to the file to unseed
   */
  public async unseedFile(filePath: string): Promise<boolean> {
    const magnetUri = this.seededMagnetUris.get(filePath);
    
    if (!magnetUri) {
      this.logger.warn(`⚠️ File not currently seeded: ${filePath}`);
      return false;
    }

    try {
      const fileName = path.basename(filePath);

      // Remove from WebTorrent
      webTorrentManager.removeTorrent(magnetUri);

      // Remove from Gun.js registry using fileName
      await this.registry.unshareMagnetUri(fileName);

      // Remove from our local map
      this.seededMagnetUris.delete(filePath);

      this.logger.info(`✅ Stopped seeding: ${fileName}`);
      return true;
    } catch (error) {
      this.logger.error(`❌ Error unseeding file:`, error);
      return false;
    }
  }

  /**
   * Download a file from a magnet URI (fire-and-forget, listen to events from webTorrentManager)
   * @param magnetUri The magnet URI to download
   * @param maxFileSizeBytes Optional maximum file size limit
   * 
   * Events emitted by webTorrentManager:
   * - 'download-metadata': When metadata is received
   * - 'download-progress': During download
   * - 'download-complete': When download finishes successfully
   * - 'download-error': If download fails
   */
  public downloadFromMagnet(magnetUri: string, maxFileSizeBytes?: number): void {
    if (!this.isInitialized) {
      throw new Error("NatTools not initialized. Call initialize() first.");
    }

    this.logger.info(`📥 Starting download from magnet URI...`);

    // Fire-and-forget: just start the download
    // Consumers should listen to webTorrentManager events:
    // - 'download-complete' 
    // - 'download-error'
    // - 'download' (progress)
    // - 'metadata'
    webTorrentManager.downloadFile(magnetUri, maxFileSizeBytes);
  }

  /**
   * Discover all available magnet URIs from the Gun.js registry
   * @param maxAgeMs Maximum age in milliseconds (default: 60000 = 1 minute)
   * @returns Array of unique magnet URIs
   */
  public async discoverMagnetUris(maxAgeMs: number = 60000): Promise<string[]> {
    if (!this.isInitialized) {
      throw new Error("NatTools not initialized. Call initialize() first.");
    }

    this.logger.debug(`🔍 Discovering magnet URIs (max age: ${maxAgeMs}ms)...`);

    const magnetUris = await this.registry.fetchMagnetUris(maxAgeMs);

    this.logger.info(`✅ Discovered ${magnetUris.length} magnet URIs`);

    return magnetUris;
  }

  /**
   * Get the list of files currently being seeded
   * @returns Map of file paths to magnet URIs
   */
  public getSeededFiles(): Map<string, string> {
    return new Map(this.seededMagnetUris);
  }

  /**
   * Get the count of active torrents (seeding + downloading)
   * @returns Number of active torrents
   */
  public getActiveTorrentsCount(): number {
    return webTorrentManager.getActiveTorrentsCount();
  }

  /**
   * Check if WebTorrent is available
   * @returns true if WebTorrent is available
   */
  public isWebTorrentAvailable(): boolean {
    return webTorrentManager.isAvailable();
  }

  /**
   * Check if Gun.js registry is available
   * @returns true if Gun.js registry is available
   */
  public isRegistryAvailable(): boolean {
    return this.registry.isAvailable();
  }

  /**
   * Rebroadcast all currently seeded magnet URIs to refresh their timestamps
   * This should be called periodically to keep magnet URIs fresh in the registry
   * @returns Number of magnet URIs successfully rebroadcast
   */
  public async rebroadcastMagnetUris(): Promise<number> {
    if (!this.isInitialized) {
      throw new Error("NatTools not initialized. Call initialize() first.");
    }

    if (this.seededMagnetUris.size === 0) {
      this.logger.debug("No magnet URIs to rebroadcast");
      return 0;
    }

    this.logger.debug(`📡 Rebroadcasting ${this.seededMagnetUris.size} magnet URIs...`);

    let successCount = 0;

    for (const [filePath, magnetUri] of this.seededMagnetUris) {
      try {
        const fileName = path.basename(filePath);
        // Re-share the magnet URI to update its timestamp in the registry
        await this.registry.shareMagnetUri(magnetUri, fileName);
        successCount++;
        this.logger.debug(`  ✅ Rebroadcast: ${fileName}`);
      } catch (error) {
        this.logger.warn(`  ⚠️ Failed to rebroadcast ${path.basename(filePath)}:`, error);
      }
    }

    this.logger.debug(`✅ Rebroadcast ${successCount}/${this.seededMagnetUris.size} magnet URIs`);

    return successCount;
  }

  /**
   * Clean up resources
   */
  public async destroy(): Promise<void> {
    this.logger.info("🧹 Cleaning up NatTools...");

    // Stop seeding all files
    for (const [filePath] of this.seededMagnetUris) {
      await this.unseedFile(filePath);
    }

    // Destroy WebTorrent manager
    await webTorrentManager.destroy();

    this.isInitialized = false;
    this.logger.info("✅ NatTools cleaned up");
  }
}

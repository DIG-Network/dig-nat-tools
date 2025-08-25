// host.ts
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as crypto from 'node:crypto';
import express from 'express';
import os from 'node:os';
import { IFileHost, HostCapabilities } from './interfaces';
import { GunRegistry } from './registry/gun-registry';
import WebTorrent from 'webtorrent';

// ✅ Replace enum with const object (better ES module support)
export const ConnectionMode = {
  AUTO: 'auto',           // Try direct HTTP first, then WebTorrent
  HTTP_ONLY: 'http',      // Only HTTP (manual port forwarding required)
  WEBTORRENT_ONLY: 'webtorrent'  // Only WebTorrent
} as const;

export interface HostOptions {
  port?: number;
  ttl?: number;  // Time to live for port mapping (seconds)
  connectionMode?: typeof ConnectionMode[keyof typeof ConnectionMode];
  storeId?: string;  // Unique identifier for Gun.js registry
  gun?: {
    peers: string[];     // Gun.js peer URLs
    namespace?: string;  // Registry namespace
  };
}

export class FileHost implements IFileHost {
  private app: express.Application;
  private server: http.Server | null = null;
  private connectionMode: typeof ConnectionMode[keyof typeof ConnectionMode];
  private port: number;
  private webTorrentClient: WebTorrent.Instance | null = null;
  private magnetUris: Map<string, string> = new Map(); // fileHash -> magnetURI
  private sharedFiles: Set<string> = new Set(); // Tracks shared file hashes
  private gunRegistry: GunRegistry | null = null;
  private storeId: string;

  constructor(options: HostOptions = {}) {
    this.port = options.port || 0;  // 0 means a random available port
    this.connectionMode = options.connectionMode || ConnectionMode.AUTO;
    this.storeId = options.storeId || this.generateUniqueId();
    
    // Initialize Gun.js registry for peer discovery
    if (options.gun) {
      this.gunRegistry = new GunRegistry({
        peers: options.gun.peers,
        namespace: options.gun.namespace
      });
    }
    
    // Initialize Express app for HTTP server
    this.app = express();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Route to serve files by SHA256 hash
    // URL format: /files/{64-character-hexadecimal-sha256-hash}
    // Files are expected to be stored with their hash as the filename
    this.app.get('/files/:hash', (req, res) => {
      const hash = req.params.hash; // SHA256 hash (64-character hex string)
      
      // Check if this hash is tracked as a shared file
      if (!this.sharedFiles.has(hash)) {
        return res.status(404).json({ error: 'File not found' });
      }

      // File path is the hash itself (files stored with hash names)
      const filePath = hash;

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        this.sharedFiles.delete(hash);
        return res.status(404).json({ error: 'File no longer exists' });
      }

      // Get file stats
      const stats = fs.statSync(filePath);
      
      // Set response headers
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename=${hash}`);
      
      // Stream file to response
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    });

    // Route to check server status
    this.app.get('/status', (_req, res) => {
      res.json({ 
        status: 'online',
        availableFiles: Array.from(this.sharedFiles)
      });
    });
  }

  /**
   * Start the file hosting server with connection strategy
   */
  public async start(): Promise<HostCapabilities> {
    console.log(`🚀 Starting FileHost with connection mode: ${this.connectionMode}`);
    
    const capabilities: HostCapabilities = {
      storeId: this.storeId
    };

    // Step 1: Try to start HTTP server (for AUTO and HTTP_ONLY modes)
    if (this.connectionMode === ConnectionMode.AUTO || this.connectionMode === ConnectionMode.HTTP_ONLY) {
      try {
        await this.startHttpServer();
        
        // Test if HTTP server is externally accessible
        const localIp = this.detectLocalIp();
        if (localIp) {
          console.log(`✅ HTTP server started successfully at ${localIp}:${this.port}`);
          capabilities.directHttp = {
            available: true,
            ip: localIp,
            port: this.port
          };
        }
      } catch (error) {
        console.warn(`⚠️ HTTP server failed to start:`, error);
        if (this.connectionMode === ConnectionMode.HTTP_ONLY) {
          throw new Error(`HTTP-only mode requested but HTTP server failed: ${error}`);
        }
      }
    }

    // Step 2: Initialize WebTorrent (for AUTO and WEBTORRENT_ONLY modes)
    if (this.connectionMode === ConnectionMode.AUTO || this.connectionMode === ConnectionMode.WEBTORRENT_ONLY) {
      try {
        this.webTorrentClient = new WebTorrent();
        console.log(`✅ WebTorrent client initialized`);
        
        capabilities.webTorrent = {
          available: true,
          magnetUris: []
        };
      } catch (error) {
        console.warn(`⚠️ WebTorrent initialization failed:`, error);
        if (this.connectionMode === ConnectionMode.WEBTORRENT_ONLY) {
          throw new Error(`WebTorrent-only mode requested but WebTorrent failed: ${error}`);
        }
      }
    }

    // Step 3: Register capabilities in Gun.js registry
    if (this.gunRegistry) {
      try {
        await this.gunRegistry.register(capabilities);
        console.log(`✅ Registered capabilities in Gun.js registry with storeId: ${this.storeId}`);
      } catch (error) {
        console.warn(`⚠️ Failed to register in Gun.js registry:`, error);
      }
    }

    // Verify at least one connection method is available
    if (!capabilities.directHttp?.available && !capabilities.webTorrent?.available) {
      throw new Error('No connection methods available. Both HTTP and WebTorrent failed to initialize.');
    }

    console.log(`🎉 FileHost started successfully with methods:`, {
      directHttp: capabilities.directHttp?.available || false,
      webTorrent: capabilities.webTorrent?.available || false
    });

    // Store capabilities for use in other methods
    this.capabilities = capabilities;

    return capabilities;
  }

  /**
   * Start HTTP server
   */
  private async startHttpServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`Starting HTTP server on port ${this.port || 'random'}...`);
      
      this.server = this.app.listen(this.port, '0.0.0.0', () => {
        if (!this.server) {
          return reject(new Error('Failed to start server'));
        }
        
        const address = this.server.address();
        if (!address || typeof address === 'string') {
          return reject(new Error('Invalid server address'));
        }

        this.port = address.port;
        console.log(`HTTP server listening on port ${this.port}`);
        resolve();
      });

      this.server.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Stop the file hosting server
   */
  public async stop(): Promise<void> {
    console.log('🛑 Stopping FileHost...');

    // Stop WebTorrent client
    if (this.webTorrentClient) {
      try {
        this.webTorrentClient.destroy();
        this.webTorrentClient = null;
        console.log('✅ WebTorrent client stopped');
      } catch (error) {
        console.warn('⚠️ Error stopping WebTorrent client:', error);
      }
    }

    // Unregister from Gun.js registry
    if (this.gunRegistry) {
      try {
        await this.gunRegistry.unregister(this.storeId);
        console.log('✅ Unregistered from Gun.js registry');
      } catch (error) {
        console.warn('⚠️ Failed to unregister from Gun.js registry:', error);
      }
    }

    // Stop HTTP server
    if (this.server) {
      return new Promise((resolve, reject) => {
        this.server?.close((err) => {
          if (err) {
            console.error('❌ Error stopping HTTP server:', err);
            reject(err);
          } else {
            console.log('✅ HTTP server stopped');
            this.server = null; // Clear the server reference
            resolve();
          }
        });
      });
    }

    console.log('✅ FileHost stopped successfully');
    return Promise.resolve();
  }

  /**
   * Share a file and get the SHA256 hash for it
   * This will make the file available via both HTTP (if enabled) and WebTorrent (if enabled)
   * @param filePath Path to the file to share
   * @returns SHA256 hash of the file (64-character hexadecimal string)
   */
  public async shareFile(filePath: string): Promise<string> {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    console.log(`📤 Sharing file: ${filePath}`);
    
    // Calculate SHA256 hash of the file content
    const hash = await this.calculateFileHash(filePath);
    console.log(`🔑 File hash: ${hash}`);
    
    // Copy the file to a location named by its hash (if not already there)
    if (!fs.existsSync(hash)) {
      fs.copyFileSync(filePath, hash);
      console.log(`📋 File copied to hash-named location`);
    }
    
    // Track this hash as a shared file
    this.sharedFiles.add(hash);
    
    // If WebTorrent is available, seed the file
    if (this.webTorrentClient) {
      try {
        this.webTorrentClient.seed(hash, (torrent) => {
          const magnetURI = torrent.magnetURI;
          this.magnetUris.set(hash, magnetURI);
          console.log(`🧲 WebTorrent seeding started for ${hash}`);
          console.log(`   Magnet URI: ${magnetURI}`);
        });
        
        // Update capabilities in registry with new magnet URI
        if (this.gunRegistry) {
          const currentCapabilities = await this.gunRegistry.findPeer(this.storeId);
          if (currentCapabilities && currentCapabilities.webTorrent) {
            currentCapabilities.webTorrent.magnetUris = Array.from(this.magnetUris.values());
            await this.gunRegistry.register(currentCapabilities);
          }
        }
      } catch (error) {
        console.warn(`⚠️ Failed to seed file via WebTorrent:`, error);
      }
    }
    
    return hash;
  }

  /**
   * Remove a shared file
   * This removes the file from both HTTP and WebTorrent sharing
   */
  public unshareFile(hash: string, deleteFile: boolean = false): boolean {
    console.log(`📤 Unsharing file: ${hash}`);
    
    const wasShared = this.sharedFiles.delete(hash);
    
    // Remove from WebTorrent seeding
    if (this.webTorrentClient && this.magnetUris.has(hash)) {
      try {
        const magnetURI = this.magnetUris.get(hash);
        const torrent = this.webTorrentClient.get(magnetURI!);
        if (torrent && typeof torrent === 'object' && 'destroy' in torrent) {
          (torrent as any).destroy();
          console.log(`🧲 Stopped WebTorrent seeding for ${hash}`);
        }
        this.magnetUris.delete(hash);
      } catch (error) {
        console.warn(`⚠️ Error stopping WebTorrent seeding:`, error);
      }
    }
    
    // Optionally delete the hash-named file
    if (deleteFile && fs.existsSync(hash)) {
      try {
        fs.unlinkSync(hash);
        console.log(`🗑️ Deleted file ${hash}`);
      } catch (error) {
        console.warn(`⚠️ Failed to delete file ${hash}:`, error);
      }
    }
    
    return wasShared;
  }

  /**
   * Get a list of currently shared files
   * Returns only the hashes since files are stored by hash names
   */
  public getSharedFiles(): string[] {
    return Array.from(this.sharedFiles);
  }

  /**
   * Get magnet URIs for all shared files (WebTorrent only)
   */
  public getMagnetUris(): string[] {
    return Array.from(this.magnetUris.values());
  }

  /**
   * Get the URL for a shared file by its SHA256 hash
   * Returns appropriate URL based on available connection methods
   * @param hash SHA256 hash of the file (64-character hexadecimal string)
   * @returns URL or magnet URI to download the file
   */
  public async getFileUrl(hash: string): Promise<string> {
    if (!this.sharedFiles.has(hash)) {
      throw new Error(`No file with hash: ${hash}`);
    }

    // Prefer direct HTTP if available
    if (this.server) {
      const localIp = this.detectLocalIp();
      if (localIp) {
        return `http://${localIp}:${this.port}/files/${hash}`;
      }
    }

    // Fall back to WebTorrent magnet URI
    if (this.magnetUris.has(hash)) {
      return this.magnetUris.get(hash)!;
    }

    throw new Error(`File ${hash} is not available via any connection method`);
  }

  private detectLocalIp(): string | null {
    const interfaces = os.networkInterfaces();
    
    // Find the active WiFi or Ethernet interface
    for (const name of Object.keys(interfaces)) {
      if (name.toLowerCase().includes('wi-fi') || name.toLowerCase().includes('ethernet')) {
        for (const iface of interfaces[name]!) {
          if (iface.family === 'IPv4' && !iface.internal) {
            return iface.address;
          }
        }
      }
    }
    
    // Fallback: get any non-internal IPv4
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]!) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    
    return null;
  }

  private generateUniqueId(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * Calculate SHA256 hash of a file
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', (data) => {
        hash.update(data);
      });
      
      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });
      
      stream.on('error', (error) => {
        reject(error);
      });
    });
  }
}

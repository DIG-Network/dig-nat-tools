import * as fs from 'node:fs';
import * as http from 'node:http';
import * as crypto from 'node:crypto';
import express from 'express';
import os from 'node:os';
import axios from 'axios';
import { publicIpv4 } from 'public-ip';
import natUpnp from 'nat-upnp';
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
  private options: HostOptions;
  private gunRegistry: GunRegistry | null = null;
  private storeId: string;
  private capabilities: HostCapabilities | null = null;
  private upnpClient: ReturnType<typeof natUpnp.createClient> | null = null;
  private upnpMapping: { external: number; internal: number } | null = null;
  private publicIp: string | null = null;

  constructor(options: HostOptions = {}) {
    this.options = options;
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
   * Get public IP address
   */
  private async getPublicIp(): Promise<string | null> {
    try {
      const ip = await publicIpv4();
      console.log(`🌐 Detected public IP: ${ip}`);
      return ip;
    } catch (error) {
      console.warn(`⚠️ Failed to detect public IP:`, error);
      return null;
    }
  }

  /**
   * Check if a port is accessible from the internet
   */
  private async checkPortAccessibility(ip: string, port: number): Promise<boolean> {
    try {
      console.log(`🔍 Checking port accessibility for ${ip}:${port}...`);
      
      // Try to connect to our own server from a public service
      // This is a simple check using a HTTP request with a timeout
      const response = await axios.get(`http://${ip}:${port}/status`, {
        timeout: 10000, // 10 second timeout
        headers: {
          'User-Agent': 'dig-nat-tools-port-check'
        }
      });
      
      console.log(`✅ Port ${port} is accessible from the internet`);
      return response.status === 200;
    } catch (error) {
      console.log(`❌ Port ${port} is not accessible from the internet:`, (error as Error).message);
      return false;
    }
  }

  /**
   * Attempt to open port using UPnP
   */
  private async tryUpnpPortMapping(port: number): Promise<boolean> {
    try {
      console.log(`🔧 Attempting UPnP port mapping for port ${port}...`);
      
      this.upnpClient = natUpnp.createClient();
      
      // Try to map the port
      await new Promise<void>((resolve, reject) => {
        this.upnpClient!.portMapping({
          public: port,
          private: port,
          ttl: this.options.ttl || 3600, // 1 hour default
          description: 'dig-nat-tools file host'
        }, (err: Error | null) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      this.upnpMapping = { external: port, internal: port };
      console.log(`✅ UPnP port mapping successful for port ${port}`);
      return true;
    } catch (error) {
      console.warn(`⚠️ UPnP port mapping failed:`, error);
      this.upnpClient = null;
      return false;
    }
  }

  /**
   * Remove UPnP port mapping
   */
  private async removeUpnpPortMapping(): Promise<void> {
    if (this.upnpClient && this.upnpMapping) {
      try {
        console.log(`🔧 Removing UPnP port mapping for port ${this.upnpMapping.external}...`);
        
        await new Promise<void>((resolve, reject) => {
          this.upnpClient!.portUnmapping({
            public: this.upnpMapping!.external
          }, (err: Error | null) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
        
        console.log(`✅ UPnP port mapping removed`);
      } catch (error) {
        console.warn(`⚠️ Failed to remove UPnP port mapping:`, error);
      } finally {
        this.upnpClient = null;
        this.upnpMapping = null;
      }
    }
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
        console.log(`✅ HTTP server started locally on port ${this.port}`);
        
        // Get public IP
        this.publicIp = await this.getPublicIp();
        
        if (this.publicIp) {
          // Check if the port is already accessible from the internet
          let isPortAccessible = await this.checkPortAccessibility(this.publicIp, this.port);
          
          // If not accessible, try UPnP
          if (!isPortAccessible) {
            console.log(`🔧 Port ${this.port} not accessible, attempting UPnP...`);
            const upnpSuccess = await this.tryUpnpPortMapping(this.port);
            
            if (upnpSuccess) {
              // Wait a bit for the mapping to take effect, then check again
              await new Promise(resolve => setTimeout(resolve, 2000));
              isPortAccessible = await this.checkPortAccessibility(this.publicIp, this.port);
            }
          }
          
          // Only set directHttp as available if port is accessible from internet
          if (isPortAccessible) {
            console.log(`✅ HTTP server is publicly accessible at ${this.publicIp}:${this.port}`);
            capabilities.directHttp = {
              available: true,
              ip: this.publicIp,
              port: this.port
            };
          } else {
            console.warn(`⚠️ HTTP server is running locally but not accessible from the internet`);
            if (this.connectionMode === ConnectionMode.HTTP_ONLY) {
              throw new Error('HTTP-only mode requested but port is not accessible from internet and UPnP failed');
            }
          }
        } else {
          console.warn(`⚠️ Could not determine public IP address`);
          if (this.connectionMode === ConnectionMode.HTTP_ONLY) {
            throw new Error('HTTP-only mode requested but could not determine public IP');
          }
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
        console.log(`🔄 Initializing WebTorrent client...`);
        this.webTorrentClient = new WebTorrent();
        
        // Wait for WebTorrent to be ready
        await this.waitForWebTorrentReady();
        
        console.log(`✅ WebTorrent client initialized and ready`);
        
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

    // Verify at least one connection method is available
    if (!capabilities.directHttp?.available && !capabilities.webTorrent?.available) {
      throw new Error('No connection methods available. Both HTTP and WebTorrent failed to initialize.');
    }

    console.log(`🎉 FileHost initialized successfully with methods:`, {
      directHttp: capabilities.directHttp?.available || false,
      webTorrent: capabilities.webTorrent?.available || false
    });

    // Step 3: Register capabilities in Gun.js registry (AFTER WebTorrent is ready)
    if (this.gunRegistry) {
      try {
        console.log(`🔄 Registering with Gun.js registry...`);
        await this.gunRegistry.register(capabilities);
        console.log(`✅ Registered capabilities in Gun.js registry with storeId: ${this.storeId}`);
      } catch (error) {
        console.warn(`⚠️ Failed to register in Gun.js registry:`, error);
      }
    }

    // Store capabilities for use in other methods
    this.capabilities = capabilities;

    return capabilities;
  }

  /**
   * Wait for WebTorrent client to be ready
   */
  private async waitForWebTorrentReady(): Promise<void> {
    if (!this.webTorrentClient) {
      throw new Error('WebTorrent client not initialized');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebTorrent initialization timeout'));
      }, 10000); // 10 second timeout

      // WebTorrent is ready when it's initialized and can accept operations
      // We'll give it a small delay to ensure it's fully initialized
      console.log(`⏳ Waiting for WebTorrent client to be ready...`);
      
      setTimeout(() => {
        clearTimeout(timeout);
        console.log(`🎯 WebTorrent client is ready`);
        resolve();
      }, 1000); // Give WebTorrent 1 second to initialize properly
    });
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

    // Remove UPnP port mapping first
    await this.removeUpnpPortMapping();

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
        console.log(`🔄 Starting WebTorrent seeding for ${hash}...`);
        
        // Seed the file and wait for the torrent to be ready
        await new Promise<void>((resolve, reject) => {
          const seedTimeout = setTimeout(() => {
            reject(new Error('WebTorrent seeding timeout'));
          }, 30000); // 30 second timeout for seeding
          
          this.webTorrentClient!.seed(hash, (torrent) => {
            clearTimeout(seedTimeout);
            const magnetURI = torrent.magnetURI;
            this.magnetUris.set(hash, magnetURI);
            console.log(`🧲 WebTorrent seeding started for ${hash}`);
            console.log(`   Magnet URI: ${magnetURI}`);
            resolve();
          });
        });
        
        // Update capabilities in Gun.js registry with new magnet URI
        if (this.gunRegistry && this.capabilities) {
          console.log(`🔄 Updating Gun.js registry with new magnet URI...`);
          
          // Update the current capabilities with the new magnet URI
          if (this.capabilities.webTorrent) {
            this.capabilities.webTorrent.magnetUris = Array.from(this.magnetUris.values());
          }
          
          await this.gunRegistry.register(this.capabilities);
          console.log(`✅ Updated Gun.js registry with magnet URI for ${hash}`);
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
          (torrent as { destroy(): void }).destroy();
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

    // Prefer direct HTTP if available (use public IP if we have it)
    if (this.server && this.capabilities?.directHttp?.available) {
      const ip = this.publicIp || this.detectLocalIp();
      if (ip) {
        return `http://${ip}:${this.port}/files/${hash}`;
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

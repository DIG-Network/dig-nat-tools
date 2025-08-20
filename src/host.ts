// host.ts
import * as fs from 'fs';
import * as http from 'http';
import * as crypto from 'crypto';
import * as natUpnp from 'nat-upnp';
import express from 'express';
import os from 'os';
import { IFileHost } from './interfaces';

export enum ConnectionMode {
  UPNP = 'upnp',
  PLAIN = 'plain'
}

export interface HostOptions {
  port?: number;
  ttl?: number;  // Time to live for port mapping (seconds)
  connectionMode?: ConnectionMode;  // Connection mode for NAT traversal
}

export class FileHost implements IFileHost {
  private app: express.Application;
  private server: http.Server | null = null;
  private upnpClient: natUpnp.Client | null = null;
  private connectionMode: ConnectionMode;
  private port: number;
  private externalPort: number | null = null;
  private ttl: number;
  private sharedFiles: Set<string> = new Set(); // Tracks shared file hashes

  constructor(options: HostOptions = {}) {
    this.port = options.port || 0;  // 0 means a random available port
    this.ttl = options.ttl || 3600;  // Default 1 hour
    this.connectionMode = options.connectionMode || ConnectionMode.UPNP;
    
    // Initialize NAT clients based on connection mode
    if (this.connectionMode !== ConnectionMode.PLAIN) {
      // Initialize UPnP client
      this.upnpClient = natUpnp.createClient();
    }
    
    // Initialize Express app
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
   * Start the file hosting server
   */
  public async start(): Promise<{ externalIp: string, port: number }> {
    return new Promise((resolve, reject) => {
      // Start HTTP server
      console.log(`Starting HTTP server on port ${this.port || 'random'}...`);
      // Bind to all interfaces (0.0.0.0) instead of just localhost
      this.server = this.app.listen(this.port, '0.0.0.0', async () => {
        if (!this.server) {
          return reject(new Error('Failed to start server'));
        }
        
        const address = this.server.address();
        if (!address || typeof address === 'string') {
          return reject(new Error('Invalid server address'));
        }

        this.port = address.port;
        console.log(`HTTP server started on local port ${this.port}`);
        
        try {
          if (this.connectionMode === ConnectionMode.PLAIN) {
            // Skip NAT traversal, use local IP and current port
            console.log('Using plain connection mode (no NAT traversal)');
            const localIp = this.detectLocalIp();
            if (!localIp) {
              return reject(new Error('Could not determine local IP address'));
            }
            
            this.externalPort = this.port;
            console.log(`Server accessible at: http://${localIp}:${this.port}`);
            
            resolve({ 
              externalIp: localIp, 
              port: this.port 
            });
          } else {
            // Map port using NAT traversal
            await this.mapPort();
            
            // Get external IP
            const externalIp = await this.getExternalIp();
            
            console.log(`Server accessible at: http://${externalIp}:${this.externalPort || this.port}`);
            
            resolve({ 
              externalIp, 
              port: this.externalPort || this.port 
            });
          }
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Stop the file hosting server
   */
  public async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve, reject) => {
        this.server?.close((err) => {
          if (err) {
            reject(err);
          } else {
            if (this.connectionMode === ConnectionMode.PLAIN) {
              // No NAT traversal to clean up
              resolve();
            } else {
              this.unmapPort()
                .then(() => resolve())
                .catch(reject);
            }
          }
        });
      });
    }
    return Promise.resolve();
  }

  /**
   * Share a file and get the SHA256 hash for it
   * The file will be copied to a new location named by its SHA256 hash
   * The returned hash becomes the file identifier in URLs (e.g., /files/{hash})
   * @param filePath Path to the file to share
   * @returns SHA256 hash of the file (64-character hexadecimal string)
   */
  public async shareFile(filePath: string): Promise<string> {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    // Calculate SHA256 hash of the file content
    const hash = await this.calculateFileHash(filePath);
    
    // Copy the file to a location named by its hash (if not already there)
    if (!fs.existsSync(hash)) {
      fs.copyFileSync(filePath, hash);
    }
    
    // Track this hash as a shared file
    this.sharedFiles.add(hash);
    
    return hash; // This hash becomes the file path component in URLs
  }

  /**
   * Remove a shared file
   * This removes the file from tracking and optionally deletes the hash-named file
   */
  public unshareFile(hash: string, deleteFile: boolean = false): boolean {
    const wasShared = this.sharedFiles.delete(hash);
    
    // Optionally delete the hash-named file
    if (deleteFile && fs.existsSync(hash)) {
      try {
        fs.unlinkSync(hash);
      } catch (error) {
        console.warn(`Failed to delete file ${hash}:`, error);
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

  private async mapPort(): Promise<void> {
    return new Promise<void>((resolve, _reject) => {
      console.log(`Attempting to map port ${this.port} via UPnP...`);
      
      // Use UPnP for port mapping
      this.mapPortUpnp(resolve);
    });
  }

  private mapPortUpnp(resolve: () => void): void {
    if (!this.upnpClient) {
      console.warn('UPnP client not initialized');
      this.externalPort = this.port;
      resolve();
      return;
    }

    this.upnpClient.portMapping({
      public: this.port,
      private: this.port,
      ttl: this.ttl
    }, (err: Error | null, info?: { public?: number }) => {
      if (err) {
        console.warn(`UPnP port mapping failed: ${err.message}`);
        console.warn('Continuing without port forwarding - you may need to manually forward the port');
        // Don't reject, continue without port forwarding
        this.externalPort = this.port;
        resolve();
      } else {
        console.log('UPnP port mapping successful');
        if (info && info.public) {
          this.externalPort = info.public;
          console.log(`External port mapped: ${this.externalPort}`);
        } else {
          this.externalPort = this.port;
        }
        resolve();
      }
    });
  }

  private async unmapPort(): Promise<void> {
    if (this.externalPort) {
      return new Promise<void>((resolve) => {
        // Use UPnP for port unmapping
        if (!this.upnpClient) {
          console.warn('UPnP client not initialized');
          this.externalPort = null;
          resolve();
          return;
        }

        this.upnpClient.portUnmapping({
          public: this.externalPort
        }, () => {
          this.externalPort = null;
          resolve();
        });
      });
    }
    return Promise.resolve();
  }

  private async getExternalIp(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      console.log(`Getting external IP address via UPnP...`);
      
      // Use UPnP for external IP
      this.getExternalIpUpnp(resolve, reject);
    });
  }

  private getExternalIpUpnp(resolve: (ip: string) => void, reject: (error: Error) => void): void {
    if (!this.upnpClient) {
      console.warn('UPnP client not initialized, falling back to local IP');
      const localIp = this.detectLocalIp();
      if (localIp) {
        resolve(localIp);
      } else {
        reject(new Error('Could not determine IP address'));
      }
      return;
    }

    this.upnpClient.externalIp((err: Error | null, upnpIp?: string) => {
      if (err || !upnpIp) {
        console.warn('Failed to get external IP via UPnP, falling back to local IP');
        const localIp = this.detectLocalIp();
        if (localIp) {
          resolve(localIp);
        } else {
          reject(new Error('Could not determine IP address'));
        }
      } else {
        console.log(`UPnP reported external IP: ${upnpIp}`);
        
        // Check if the UPnP IP is actually a private/local IP
        // This indicates we're behind a cascaded router/access point - not supported
        if (this.isPrivateIp(upnpIp)) {
          reject(new Error(`Cascading network topology detected (UPnP returned private IP ${upnpIp}). This configuration is not supported. Please ensure the device is directly connected to a router with a public IP address.`));
        } else {
          console.log(`Using UPnP external IP: ${upnpIp}`);
          resolve(upnpIp);
        }
      }
    });
  }

  // Check if an IP is in private address space
  private isPrivateIp(ip: string): boolean {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return false;
    
    // 192.168.x.x
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 10.x.x.x
    if (parts[0] === 10) return true;
    // 172.16.x.x - 172.31.x.x
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    
    return false;
  }

  private detectLocalIp(): string | null {
    const interfaces = os.networkInterfaces();
    
    // Find the active WiFi or Ethernet interface
    for (const name of Object.keys(interfaces)) {
      if (name.toLowerCase().includes('wi-fi') || name.toLowerCase().includes('ethernet')) {
        for (const iface of interfaces[name]!) {
          if (iface.family === 'IPv4' && !iface.internal) {
            console.log(`Found local IP from ${name}: ${iface.address}`);
            return iface.address;
          }
        }
      }
    }
    
    // Fallback: get any non-internal IPv4
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]!) {
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log(`Found fallback local IP from ${name}: ${iface.address}`);
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

  /**
   * Get the URL for a shared file by its SHA256 hash
   * The URL format will be: http://{host}:{port}/files/{hash}
   * where {hash} is the 64-character hexadecimal SHA256 string
   * @param hash SHA256 hash of the file (64-character hexadecimal string)
   * @returns URL to download the file (path component contains the SHA256 hash)
   */
  public async getFileUrl(hash: string): Promise<string> {
    if (!this.sharedFiles.has(hash)) {
      throw new Error(`No file with hash: ${hash}`);
    }

    if (!this.externalPort) {
      throw new Error('Server is not started or port is not mapped');
    }

    if (this.connectionMode === ConnectionMode.PLAIN) {
      // Use local IP since we're not doing NAT traversal
      const localIp = this.detectLocalIp();
      if (!localIp) {
        throw new Error('Could not determine local IP address');
      }
      return `http://${localIp}:${this.externalPort}/files/${hash}`;
    } else {
      const externalIp = await this.getExternalIp();
      return `http://${externalIp}:${this.externalPort}/files/${hash}`;
    }
  }
}

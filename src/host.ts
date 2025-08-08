// host.ts
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as natUpnp from 'nat-upnp';
import express from 'express';

export interface HostOptions {
  port?: number;
  ttl?: number;  // Time to live for UPnP mapping (seconds)
}

export class FileHost {
  private app: express.Application;
  private server: http.Server | null = null;
  private client: natUpnp.Client;
  private port: number;
  private externalPort: number | null = null;
  private ttl: number;
  private fileMappings: Map<string, string> = new Map();

  constructor(options: HostOptions = {}) {
    this.port = options.port || 0;  // 0 means a random available port
    this.ttl = options.ttl || 3600;  // Default 1 hour
    
    // Initialize UPnP client
    this.client = natUpnp.createClient();
    
    // Initialize Express app
    this.app = express();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Route to serve files
    this.app.get('/files/:id', (req, res) => {
      const id = req.params.id;
      const filePath = this.fileMappings.get(id);
      
      if (!filePath) {
        return res.status(404).json({ error: 'File not found' });
      }

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        this.fileMappings.delete(id);
        return res.status(404).json({ error: 'File no longer exists' });
      }

      // Get file stats
      const stats = fs.statSync(filePath);
      
      // Set response headers
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename=${path.basename(filePath)}`);
      
      // Stream file to response
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    });

    // Route to check server status
    this.app.get('/status', (req, res) => {
      res.json({ 
        status: 'online',
        availableFiles: Array.from(this.fileMappings.keys())
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
          // Map port using UPnP
          await this.mapPort();
          
          // Get external IP
          const externalIp = await this.getExternalIp();
          
          console.log(`Server accessible at: http://${externalIp}:${this.externalPort || this.port}`);
          
          resolve({ 
            externalIp, 
            port: this.externalPort || this.port 
          });
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
            this.unmapPort()
              .then(() => resolve())
              .catch(reject);
          }
        });
      });
    }
    return Promise.resolve();
  }

  /**
   * Share a file and get the unique ID for it
   */
  public shareFile(filePath: string): string {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    // Generate a unique ID for this file
    const id = this.generateUniqueId();
    
    // Store the mapping
    this.fileMappings.set(id, filePath);
    
    return id;
  }

  /**
   * Remove a shared file
   */
  public unshareFile(id: string): boolean {
    return this.fileMappings.delete(id);
  }

  /**
   * Get a list of currently shared files
   */
  public getSharedFiles(): { id: string, path: string }[] {
    return Array.from(this.fileMappings.entries())
      .map(([id, path]) => ({ id, path }));
  }

  private async mapPort(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      console.log(`Attempting to map port ${this.port} via UPnP...`);
      this.client.portMapping({
        public: this.port,
        private: this.port,
        ttl: this.ttl
      }, (err: Error | null, info?: any) => {
        if (err) {
          console.warn(`UPnP port mapping failed: ${err.message}`);
          console.warn('Continuing without UPnP - you may need to manually forward the port');
          // Don't reject, continue without UPnP
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
    });
  }

  private async unmapPort(): Promise<void> {
    if (this.externalPort) {
      return new Promise<void>((resolve) => {
        this.client.portUnmapping({
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
      console.log('Getting external IP address...');
      
      // First try to get the actual local IP address
      const os = require('os');
      const interfaces = os.networkInterfaces();
      let localIp: string | null = null;
      
      // Find the active WiFi or Ethernet interface
      for (const name of Object.keys(interfaces)) {
        if (name.toLowerCase().includes('wi-fi') || name.toLowerCase().includes('ethernet')) {
          for (const iface of interfaces[name]!) {
            if (iface.family === 'IPv4' && !iface.internal) {
              localIp = iface.address;
              console.log(`Found local IP from ${name}: ${localIp}`);
              break;
            }
          }
        }
      }
      
      // If we didn't find a specific interface, get any non-internal IPv4
      if (!localIp) {
        for (const name of Object.keys(interfaces)) {
          for (const iface of interfaces[name]!) {
            if (iface.family === 'IPv4' && !iface.internal) {
              localIp = iface.address;
              console.log(`Found fallback local IP from ${name}: ${localIp}`);
              break;
            }
          }
          if (localIp) break;
        }
      }
      
      // Try UPnP for external IP (this might be different from local IP if behind NAT)
      this.client.externalIp((err: Error | null, upnpIp?: string) => {
        if (err || !upnpIp) {
          console.warn('Failed to get external IP via UPnP');
          if (localIp) {
            console.log(`Using detected local IP: ${localIp}`);
            resolve(localIp);
          } else {
            reject(new Error('Could not determine IP address'));
          }
        } else {
          console.log(`UPnP reported external IP: ${upnpIp}`);
          if (localIp && upnpIp !== localIp) {
            console.log(`Note: UPnP IP (${upnpIp}) differs from local IP (${localIp})`);
            console.log(`Using local IP for internal network access: ${localIp}`);
            resolve(localIp);
          } else {
            console.log(`Using UPnP external IP: ${upnpIp}`);
            resolve(upnpIp);
          }
        }
      });
    });
  }

  private generateUniqueId(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * Get the URL for a shared file
   */
  public async getFileUrl(id: string): Promise<string> {
    if (!this.fileMappings.has(id)) {
      throw new Error(`No file with ID: ${id}`);
    }

    if (!this.externalPort) {
      throw new Error('Server is not started or port is not mapped');
    }

    const externalIp = await this.getExternalIp();
    return `http://${externalIp}:${this.externalPort}/files/${id}`;
  }
}

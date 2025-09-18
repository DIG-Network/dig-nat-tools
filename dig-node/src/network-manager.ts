import { EventEmitter } from 'events';
import { NodeConfig, DigFileInfo, PeerFileAnnouncement, HostCapabilities } from './types.js';
import { Logger } from './logger.js';
import fs from 'fs';
import path from 'path';

export class NetworkManager extends EventEmitter {
  private config: NodeConfig;
  private logger: Logger;
  private fileHost: unknown = null;
  private fileClient: unknown = null;
  private isStarted: boolean = false;
  private storeId: string;
  private knownPeers: Map<string, PeerFileAnnouncement> = new Map();
  private digNatToolsLoaded: boolean = false;
  private digNatTools: unknown = null;

  constructor(config: NodeConfig, logger: Logger) {
    super();
    this.config = config;
    this.logger = logger;
    this.storeId = this.generateStoreId();
  }

  private generateStoreId(): string {
    return `dig-node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async loadDigNatTools(): Promise<boolean> {
    try {
      // Use relative import to avoid file:// URL issues
      const modulePath = '../../dist/index.js';
      this.logger.debug(`Attempting to load dig-nat-tools from: ${modulePath}`);
      
      // Use dynamic import for runtime loading
      this.digNatTools = await import(modulePath) as any;
      this.logger.info('dig-nat-tools loaded successfully');
      return true;
    } catch (error) {
      this.logger.warn('Failed to load dig-nat-tools:', error);
      return false;
    }
  }

  public async start(): Promise<void> {
    if (this.isStarted) {
      throw new Error('Network manager already started');
    }

    try {
      // Try to load dig-nat-tools
      this.digNatToolsLoaded = await this.loadDigNatTools();
      
      if (!this.digNatToolsLoaded) {
        this.logger.warn('dig-nat-tools not available, using basic implementation');
        this.isStarted = true;
        return;
      }

      // Debug what was loaded
      this.logger.debug('dig-nat-tools exports:', Object.keys(this.digNatTools || {}));
      this.logger.debug('FileHost available:', !!(this.digNatTools as any)?.FileHost);
      this.logger.debug('ConnectionMode available:', !!(this.digNatTools as any)?.ConnectionMode);
      this.logger.debug('FileClient available:', !!(this.digNatTools as any)?.FileClient);

      // Initialize FileHost for sharing our files
      if ((this.digNatTools as any)?.FileHost && (this.digNatTools as any)?.ConnectionMode) {
        this.logger.debug('Creating FileHost instance...');
        this.fileHost = new (this.digNatTools as any).FileHost({
          port: this.config.port,
          storeId: this.storeId,
          connectionMode: (this.digNatTools as any).ConnectionMode.AUTO,
          gun: {
            peers: this.config.gunOptions.peers || [],
            namespace: this.config.gunOptions.namespace
          }
        });
        this.logger.debug('FileHost instance created successfully');
      }

      // Initialize FileClient for downloading files
      if ((this.digNatTools as any)?.FileClient) {
        this.logger.debug('Creating FileClient instance...');
        this.fileClient = new (this.digNatTools as any).FileClient({
          peers: this.config.gunOptions.peers,
          namespace: this.config.gunOptions.namespace,
          timeout: 30000
        });
        this.logger.debug('FileClient instance created successfully');
      }

      // Start the file host if available
      if (this.fileHost) {
        this.logger.debug('Starting FileHost...');
        const capabilities = await (this.fileHost as any).start();
        this.logger.info('File host started with capabilities:', capabilities);
        
        // Set up periodic peer discovery
        this.setupPeriodicPeerDiscovery();
        
        // Actively discover existing peers
        await this.discoverExistingPeers();
      } else {
        this.logger.warn('FileHost not available - file sharing will not work');
      }

      this.isStarted = true;
      this.logger.info('Network manager started with dig-nat-tools integration');
    } catch (error) {
      this.logger.error('Failed to start network manager:', error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    try {
      if (this.fileHost && (this.fileHost as any).stop) {
        await (this.fileHost as any).stop();
        this.logger.debug('FileHost stopped');
      }

      if (this.fileClient && (this.fileClient as any).destroy) {
        await (this.fileClient as any).destroy();
        this.logger.debug('FileClient destroyed');
      }
      
      this.isStarted = false;
      this.logger.info('Network manager stopped');
    } catch (error) {
      this.logger.error('Error stopping network manager:', error);
      throw error;
    }
  }

  private setupPeriodicPeerDiscovery(): void {
    // Since FileHost and FileClient handle Gun.js internally, we'll use periodic polling 
    // to discover peers instead of event-based discovery
    this.logger.debug('Setting up periodic peer discovery...');
    
    // Start periodic peer discovery every 10 seconds
    globalThis.setInterval(async () => {
      try {
        await this.discoverExistingPeers();
      } catch (error) {
        this.logger.debug('Error in periodic peer discovery:', error);
      }
    }, 10000);

    this.logger.debug('Periodic peer discovery set up');
  }

  private async discoverExistingPeers(): Promise<void> {
    if (!this.fileClient || !this.digNatToolsLoaded) {
      this.logger.debug('Cannot discover peers - FileClient not available');
      return;
    }

    try {
      this.logger.debug('🔍 Discovering existing peers...');
      const availablePeers = await (this.fileClient as any).findAvailablePeers();
      
      this.logger.info(`🌐 Found ${availablePeers.length} existing peers`);
      
      for (const peerCapabilities of availablePeers) {
        if (peerCapabilities.storeId && peerCapabilities.storeId !== this.storeId) {
          this.logger.debug(`📡 Processing existing peer: ${peerCapabilities.storeId}`);
          
          // Create announcement for this peer
          const announcement: PeerFileAnnouncement = {
            storeId: peerCapabilities.storeId,
            files: await this.discoverPeerFiles(peerCapabilities.storeId),
            capabilities: peerCapabilities,
            timestamp: Date.now()
          };
          
          this.knownPeers.set(peerCapabilities.storeId, announcement);
          this.emit('peerAnnouncement', announcement);
        }
      }
    } catch (error) {
      this.logger.error('Error discovering existing peers:', error);
    }
  }

  private async discoverPeerFiles(storeId: string): Promise<DigFileInfo[]> {
    if (!this.fileClient || !this.digNatToolsLoaded) {
      return [];
    }

    try {
      this.logger.debug(`🔍 Querying files from peer: ${storeId}`);
      
      // For now, we'll return empty files list since we don't have direct access
      // to peer file announcements without the Gun registry events.
      // The FileHost/FileClient handles the Gun.js registry internally,
      // but doesn't expose file lists directly through the API.
      // In a real implementation, this would require extending the API
      // or using a different approach for file discovery.
      return [];
    } catch (error) {
      this.logger.error(`Error querying files from peer ${storeId}:`, error);
      return [];
    }
  }

  public async announceFiles(files: DigFileInfo[]): Promise<void> {
    this.logger.debug(`announceFiles called with ${files.length} files`);
    this.logger.debug(`fileHost exists: ${!!this.fileHost}`);
    this.logger.debug(`digNatToolsLoaded: ${this.digNatToolsLoaded}`);
    
    if (!this.fileHost || !this.digNatToolsLoaded) {
      this.logger.debug(`Would announce ${files.length} files to network (dig-nat-tools not available)`);
      return;
    }

    try {
      const sharedHashes: string[] = [];
      
      for (const file of files) {
        const fullPath = path.join(this.config.digDirectory, file.path);
        if (fs.existsSync(fullPath)) {
          try {
            const hash = await (this.fileHost as any).shareFile(fullPath);
            if (hash === file.hash) {
              sharedHashes.push(hash);
              this.logger.debug(`Successfully shared file: ${file.path} (${hash})`);
            } else {
              this.logger.warn(`Hash mismatch for file ${file.path}: expected ${file.hash}, got ${hash}`);
            }
          } catch (error) {
            this.logger.error(`Failed to share file ${file.path}:`, error);
          }
        } else {
          this.logger.warn(`File not found: ${fullPath}`);
        }
      }

      this.logger.info(`Successfully announced ${sharedHashes.length} of ${files.length} files to network`);
    } catch (error) {
      this.logger.error('Failed to announce files:', error);
    }
  }

  public async getFileUrl(hash: string, storeId: string): Promise<string | null> {
    const peerAnnouncement = this.knownPeers.get(storeId);
    if (!peerAnnouncement) {
      this.logger.warn(`Unknown peer: ${storeId}`);
      return null;
    }

    try {
      const capabilities = peerAnnouncement.capabilities;
      
      if (capabilities.directHttp?.available) {
        const baseUrl = `http://${capabilities.directHttp.ip}:${capabilities.directHttp.port}`;
        return `${baseUrl}/files/${hash}`;
      }
      
      if (capabilities.webTorrent?.available && capabilities.webTorrent.magnetUris) {
        const magnetUri = capabilities.webTorrent.magnetUris.find(uri => uri.includes(hash));
        if (magnetUri) {
          return magnetUri;
        }
      }
      
      return null;
    } catch (error) {
      this.logger.error(`Failed to get file URL for ${hash} from ${storeId}:`, error);
      return null;
    }
  }

  public async downloadFile(url: string, targetPath: string): Promise<boolean> {
    if (!this.fileClient || !this.digNatToolsLoaded) {
      this.logger.warn('FileClient not available, cannot download file');
      return false;
    }

    try {
      this.logger.debug(`Downloading ${url} to ${targetPath}`);
      
      const buffer = await (this.fileClient as any).downloadAsBuffer(url);
      const fullTargetPath = path.join(this.config.digDirectory, targetPath);
      const fullTargetDir = path.dirname(fullTargetPath);
      
      if (!fs.existsSync(fullTargetDir)) {
        fs.mkdirSync(fullTargetDir, { recursive: true });
      }
      
      fs.writeFileSync(fullTargetPath, buffer);
      this.logger.info(`Successfully downloaded file to: ${fullTargetPath}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to download ${url}:`, error);
      return false;
    }
  }

  public async downloadFileByHash(storeId: string, fileHash: string, fileName: string): Promise<boolean> {
    if (!this.fileClient || !this.digNatToolsLoaded) {
      this.logger.warn('FileClient not available, cannot download file');
      return false;
    }

    try {
      this.logger.debug(`Downloading file ${fileHash} from peer ${storeId}`);
      
      const buffer = await (this.fileClient as any).downloadFile(storeId, fileHash);
      const targetPath = path.join(this.config.digDirectory, fileName);
      const targetDir = path.dirname(targetPath);
      
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      
      fs.writeFileSync(targetPath, buffer);
      this.logger.info(`Successfully downloaded file: ${fileName}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to download file ${fileHash} from ${storeId}:`, error);
      return false;
    }
  }

  public async findAvailablePeers(): Promise<HostCapabilities[]> {
    if (!this.fileClient || !this.digNatToolsLoaded) {
      return [];
    }

    try {
      return await (this.fileClient as any).findAvailablePeers();
    } catch (error) {
      this.logger.error('Failed to find available peers:', error);
      return [];
    }
  }

  public getPeerCount(): number {
    return this.knownPeers.size;
  }

  public getKnownPeers(): string[] {
    return Array.from(this.knownPeers.keys());
  }

  public getSharedFiles(): string[] {
    if (!this.fileHost || !this.digNatToolsLoaded) {
      return [];
    }

    try {
      return (this.fileHost as any).getSharedFiles();
    } catch (error) {
      this.logger.error('Failed to get shared files:', error);
      return [];
    }
  }

  public async checkPeerCapabilities(storeId: string): Promise<HostCapabilities | null> {
    if (!this.fileClient || !this.digNatToolsLoaded) {
      return null;
    }

    try {
      return await (this.fileClient as any).checkPeerCapabilities(storeId);
    } catch (error) {
      this.logger.error(`Failed to check capabilities for peer ${storeId}:`, error);
      return null;
    }
  }

  public isDigNatToolsAvailable(): boolean {
    return this.digNatToolsLoaded;
  }

  public async shareFile(filePath: string): Promise<string | null> {
    if (!this.fileHost || !this.digNatToolsLoaded) {
      this.logger.debug(`Cannot share file ${filePath} - FileHost not available`);
      return null;
    }

    try {
      const hash = await (this.fileHost as any).shareFile(filePath);
      this.logger.debug(`📤 File shared: ${filePath} -> ${hash}`);
      return hash;
    } catch (error) {
      this.logger.error(`Failed to share file ${filePath}:`, error);
      return null;
    }
  }
}
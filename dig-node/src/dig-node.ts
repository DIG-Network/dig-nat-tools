import { EventEmitter } from 'events';
import { NodeConfig, DigFileInfo, PeerFileAnnouncement, DownloadJob, HostCapabilities } from './types.js';
import { NetworkManager } from './network-manager.js';
import { Logger } from './logger.js';
import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import chalk from 'chalk';
import ora from 'ora';

export class DigNode extends EventEmitter {
  private config: NodeConfig;
  private networkManager: NetworkManager;
  private logger: Logger;
  private isRunning: boolean = false;
  private syncTimer?: ReturnType<typeof globalThis.setInterval>;
  private downloadQueue: DownloadJob[] = [];
  private activeDownloads: Set<string> = new Set();
  private fileWatcher?: chokidar.FSWatcher;
  private localFiles: DigFileInfo[] = [];

  constructor(config: NodeConfig) {
    super();
    this.config = config;
    this.logger = new Logger(config.logLevel);
    this.networkManager = new NetworkManager(config, this.logger);

    // Set up event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.networkManager.on('peerAnnouncement', (announcement: PeerFileAnnouncement) => {
      this.logger.debug(`📡 Received announcement from ${announcement.storeId}`);
      this.handlePeerAnnouncement(announcement);
    });

    this.networkManager.on('peerConnected', (storeId: string) => {
      this.logger.info(`🤝 Peer connected: ${storeId}`);
    });

    this.networkManager.on('peerDisconnected', (storeId: string) => {
      this.logger.info(`👋 Peer disconnected: ${storeId}`);
    });
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Node is already running');
    }

    const spinner = ora('Starting DIG Node...').start();

    try {
      // Ensure directory exists
      if (!fs.existsSync(this.config.digDirectory)) {
        fs.mkdirSync(this.config.digDirectory, { recursive: true });
      }

      // Initialize and scan for .dig files
      spinner.text = 'Scanning .dig files...';
      await this.scanDigFiles();
      spinner.succeed(`Found ${this.localFiles.length} local .dig files`);

      // Start network manager
      spinner.start('Starting network services...');
      await this.networkManager.start();
      spinner.succeed('Network services started');

      // Share all local .dig files through FileHost
      spinner.start('Sharing files to network...');
      await this.shareLocalFiles();
      spinner.succeed('Files shared to network');

      // Set up file watcher
      this.setupFileWatcher();

      // Start periodic sync
      this.startPeriodicSync();

      this.isRunning = true;
      this.logger.info(chalk.green('✅ DIG Node started successfully'));
      this.logger.info(`📁 Watching directory: ${this.config.digDirectory}`);
      this.logger.info(`🌐 Listening on port: ${this.config.port}`);
      this.logger.info(`🔗 GunJS namespace: ${this.config.gunOptions.namespace}`);
      this.logger.info(`🔧 dig-nat-tools: ${this.networkManager.isDigNatToolsAvailable() ? 'available' : 'not available'}`);
      
      if (this.networkManager.isDigNatToolsAvailable()) {
        const sharedFiles = this.networkManager.getSharedFiles();
        this.logger.info(`📤 Sharing ${sharedFiles.length} files via dig-nat-tools`);
      }

    } catch (error) {
      spinner.fail('Failed to start DIG Node');
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    const spinner = ora('Stopping DIG Node...').start();

    try {
      // Stop periodic sync
      if (this.syncTimer) {
        globalThis.clearInterval(this.syncTimer);
      }

      // Stop file watcher
      if (this.fileWatcher) {
        await this.fileWatcher.close();
      }

      // Stop network manager
      await this.networkManager.stop();

      this.isRunning = false;
      spinner.succeed('DIG Node stopped');
      this.logger.info(chalk.yellow('👋 DIG Node stopped'));

    } catch (error) {
      spinner.fail('Error stopping DIG Node');
      throw error;
    }
  }

  private async announceFiles(): Promise<void> {
    if (!this.isRunning) return;

    try {
      await this.networkManager.announceFiles(this.localFiles);
      this.logger.debug(`📡 Announced ${this.localFiles.length} files to network`);
    } catch (error) {
      this.logger.error('Failed to announce files:', error);
    }
  }

  private async handlePeerAnnouncement(announcement: PeerFileAnnouncement): Promise<void> {
    this.logger.debug(`📡 Received peer announcement from ${announcement.storeId}`);
    this.logger.debug(`📊 Peer capabilities:`, {
      storeId: announcement.capabilities.storeId,
      directHttp: announcement.capabilities.directHttp?.available || false,
      webTorrent: announcement.capabilities.webTorrent?.available || false
    });
    
    if (announcement.capabilities.webTorrent?.magnetUris && 
        announcement.capabilities.webTorrent.magnetUris.length > 0) {
      
      this.logger.info(`🧲 Peer ${announcement.storeId} has ${announcement.capabilities.webTorrent.magnetUris.length} files available`);
    
      
      for (const magnetUri of announcement.capabilities.webTorrent.magnetUris) {
        // Extract file hash from magnet URI (dn parameter contains the hash)
        const dnMatch = magnetUri.match(/dn=([^&]+)/);
        if (dnMatch) {
          const fileHash = decodeURIComponent(dnMatch[1]);
          this.logger.debug(`📄 Available file: ${fileHash}`);
          
          // Check if we already have this file or are currently downloading it
          const hasFile = this.localFiles.some(f => f.hash === fileHash);
          const isDownloading = this.activeDownloads.has(fileHash);
          
          if (!hasFile && !isDownloading) {
            this.logger.info(`🔍 Found new file available: ${fileHash}`);
            
            // Mark as downloading to prevent duplicate attempts
            this.activeDownloads.add(fileHash);
            this.logger.debug(`📥 Marked file ${fileHash} as downloading`);
            
            try {
              const success = await this.downloadFileFromPeer(
                announcement.capabilities, 
                fileHash, 
                `${fileHash}.dig`
              );
              
              if (success) {
                // Rescan files to include the newly downloaded file
                await this.scanDigFiles();
              }
            } finally {
              // Always remove from active downloads when done
              this.activeDownloads.delete(fileHash);
              this.logger.debug(`🔄 Removed file ${fileHash} from active downloads`);
            }
          } else if (isDownloading) {
            this.logger.debug(`⏳ File ${fileHash} is already being downloaded, skipping`);
          } else {
            this.logger.debug(`✅ File ${fileHash} already exists locally, skipping`);
          }
        }
      }
    }
  }

  private async downloadFileFromPeer(capabilities: HostCapabilities, fileHash: string, fileName: string): Promise<boolean> {
    try {
      this.logger.info(`📥 Downloading file ${fileHash} from peer ${capabilities.storeId}`);
      
      const success = await this.networkManager.downloadFileFromPeer(capabilities, fileHash, fileName);
      
      if (success) {
        this.logger.info(`✅ Successfully downloaded: ${fileName}`);
      } else {
        this.logger.warn(`❌ Failed to download: ${fileName}`);
      }
      
      return success;
    } catch (error) {
      this.logger.error(`Error downloading file ${fileHash}:`, error);
      return false;
    }
  }

  private startPeriodicSync(): void {
    const interval = this.config.syncInterval || 30000; // 30 seconds default
    
    this.syncTimer = globalThis.setInterval(async () => {
      try {
        await this.announceFiles();
      } catch (error) {
        this.logger.error('Error during periodic sync:', error);
      }
    }, interval);
  }

  private async scanDigFiles(): Promise<void> {
    this.logger.debug(`Scanning directory: ${this.config.digDirectory}`);
    
    try {
      const entries = fs.readdirSync(this.config.digDirectory, { withFileTypes: true });
      this.localFiles = [];
      
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.dig')) {
          const filePath = path.join(this.config.digDirectory, entry.name);
          const fileInfo = await this.createFileInfo(filePath);
          if (fileInfo) {
            this.localFiles.push(fileInfo);
          }
        }
      }

      this.logger.info(`Found ${this.localFiles.length} .dig files`);
    } catch (error) {
      this.logger.error('Error scanning directory:', error);
    }
  }

  private async createFileInfo(filePath: string): Promise<DigFileInfo | null> {
    try {
      const stats = fs.statSync(filePath);
      const hash = await this.calculateFileHash(filePath);
      
      return {
        hash,
        path: path.relative(this.config.digDirectory, filePath),
        size: stats.size,
        lastModified: stats.mtime.getTime()
      };
    } catch (error) {
      this.logger.error(`Error creating file info for ${filePath}:`, error);
      return null;
    }
  }

  private async calculateFileHash(filePath: string): Promise<string> {
    const crypto = await import('crypto');
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

  private async shareLocalFiles(): Promise<void> {
    if (!this.networkManager.isDigNatToolsAvailable()) {
      this.logger.warn('dig-nat-tools not available, files will not be shared');
      return;
    }

    try {
      // Share each .dig file through the NetworkManager's FileHost
      for (const fileInfo of this.localFiles) {
        const fullPath = path.join(this.config.digDirectory, fileInfo.path);
        if (fs.existsSync(fullPath)) {
          await this.networkManager.shareFile(fullPath);
          this.logger.debug(`📤 Shared file: ${fileInfo.path}`);
        }
      }
      
      this.logger.info(`📤 Shared ${this.localFiles.length} files to network`);
    } catch (error) {
      this.logger.error('Error sharing local files:', error);
    }
  }

  private setupFileWatcher(): void {
    this.fileWatcher = chokidar.watch('*.dig', {
      cwd: this.config.digDirectory,
      persistent: true,
      ignoreInitial: true
    });

    this.fileWatcher.on('add', async (relativePath: string) => {
      const fullPath = path.join(this.config.digDirectory, relativePath);
      this.logger.info(`📁 New file detected: ${relativePath}`);
      
      const fileInfo = await this.createFileInfo(fullPath);
      if (fileInfo) {
        this.localFiles.push(fileInfo);
        
        // Share the new file
        if (this.networkManager.isDigNatToolsAvailable()) {
          await this.networkManager.shareFile(fullPath);
          this.logger.debug(`📤 Shared new file: ${relativePath}`);
        }
      }
    });

    this.fileWatcher.on('change', async (relativePath: string) => {
      const fullPath = path.join(this.config.digDirectory, relativePath);
      this.logger.info(`📁 File changed: ${relativePath}`);
      
      // Remove old file info
      this.localFiles = this.localFiles.filter(f => f.path !== relativePath);
      
      // Add updated file info
      const fileInfo = await this.createFileInfo(fullPath);
      if (fileInfo) {
        this.localFiles.push(fileInfo);
        
        // Re-share the updated file
        if (this.networkManager.isDigNatToolsAvailable()) {
          await this.networkManager.shareFile(fullPath);
          this.logger.debug(`📤 Re-shared updated file: ${relativePath}`);
        }
      }
    });

    this.fileWatcher.on('unlink', (relativePath: string) => {
      this.logger.info(`📁 File removed: ${relativePath}`);
      this.localFiles = this.localFiles.filter(f => f.path !== relativePath);
      // Note: FileHost should handle unsharing automatically
    });

    this.logger.debug('File watcher set up');
  }

  public getStatus(): { isRunning: boolean; localFiles: number; queuedDownloads: number; activeDownloads: number; directory: string; port: number; digNatToolsAvailable: boolean; sharedFiles: number; knownPeers: number } {
    return {
      isRunning: this.isRunning,
      localFiles: this.localFiles.length,
      queuedDownloads: this.downloadQueue.length,
      activeDownloads: this.activeDownloads.size,
      directory: this.config.digDirectory,
      port: this.config.port,
      digNatToolsAvailable: this.networkManager.isDigNatToolsAvailable(),
      sharedFiles: this.networkManager.getSharedFiles().length,
      knownPeers: this.networkManager.getPeerCount()
    };
  }
}
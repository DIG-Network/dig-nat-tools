import { EventEmitter } from 'events';
import { NodeConfig, DigFileInfo, PeerFileAnnouncement, DownloadJob } from './types.js';
import { FileManager } from './file-manager.js';
import { NetworkManager } from './network-manager.js';
import { Logger } from './logger.js';
import chalk from 'chalk';
import ora from 'ora';

export class DigNode extends EventEmitter {
  private config: NodeConfig;
  private fileManager: FileManager;
  private networkManager: NetworkManager;
  private logger: Logger;
  private isRunning: boolean = false;
  private syncTimer?: NodeJS.Timeout;
  private downloadQueue: DownloadJob[] = [];
  private activeDownloads: Set<string> = new Set();

  constructor(config: NodeConfig) {
    super();
    this.config = config;
    this.logger = new Logger(config.logLevel);
    this.fileManager = new FileManager(config.digDirectory, this.logger);
    this.networkManager = new NetworkManager(config, this.logger);

    // Set up event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.fileManager.on('fileAdded', (fileInfo: DigFileInfo) => {
      this.logger.info(`📁 New file detected: ${fileInfo.path}`);
      this.announceFiles();
    });

    this.fileManager.on('fileRemoved', (filePath: string) => {
      this.logger.info(`📁 File removed: ${filePath}`);
      this.announceFiles();
    });

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
      // Initialize file manager
      spinner.text = 'Scanning .dig files...';
      await this.fileManager.initialize();
      const localFiles = this.fileManager.getFiles();
      spinner.succeed(`Found ${localFiles.length} local .dig files`);

      // Start network manager
      spinner.start('Starting network services...');
      await this.networkManager.start();
      spinner.succeed('Network services started');

      // Announce our files
      spinner.start('Announcing files to network...');
      await this.announceFiles();
      spinner.succeed('Files announced to network');

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

      // Stop network manager
      await this.networkManager.stop();

      // Stop file manager
      await this.fileManager.stop();

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
      const files = this.fileManager.getFiles();
      await this.networkManager.announceFiles(files);
      this.logger.debug(`📡 Announced ${files.length} files to network`);
    } catch (error) {
      this.logger.error('Failed to announce files:', error);
    }
  }

  private async handlePeerAnnouncement(announcement: PeerFileAnnouncement): Promise<void> {
    const localFiles = this.fileManager.getFiles();
    const localHashes = new Set(localFiles.map((f: DigFileInfo) => f.hash));
    
    // Find files we don't have
    const missingFiles = announcement.files.filter(file => !localHashes.has(file.hash));
    
    if (missingFiles.length > 0) {
      this.logger.info(`🔍 Found ${missingFiles.length} new files from peer ${announcement.storeId}`);
      
      // Queue downloads
      for (const file of missingFiles) {
        await this.queueDownload(file, announcement);
      }
    }
  }

  private async queueDownload(file: DigFileInfo, announcement: PeerFileAnnouncement): Promise<void> {
    try {
      // Use the NetworkManager's downloadFileByHash method for automatic peer lookup
      const success = await this.networkManager.downloadFileByHash(
        announcement.storeId, 
        file.hash, 
        file.path
      );
      
      if (success) {
        this.logger.info(`✅ Downloaded: ${file.path}`);
      } else {
        this.logger.warn(`❌ Failed to download: ${file.path}`);
        
        // Fallback: try to get URL and use regular download
        const downloadUrl = await this.networkManager.getFileUrl(file.hash, announcement.storeId);
        if (downloadUrl) {
          const job: DownloadJob = {
            hash: file.hash,
            sourceUrl: downloadUrl,
            targetPath: file.path,
            priority: 1
          };

          this.downloadQueue.push(job);
          this.logger.debug(`📥 Queued download as fallback: ${file.path}`);
          this.processDownloadQueue();
        }
      }
    } catch (error) {
      this.logger.error(`Failed to queue download for ${file.hash}:`, error);
    }
  }

  private async processDownloadQueue(): Promise<void> {
    const maxConcurrent = this.config.maxConcurrentDownloads || 5;
    
    while (this.downloadQueue.length > 0 && this.activeDownloads.size < maxConcurrent) {
      const job = this.downloadQueue.shift();
      if (!job) break;

      if (this.activeDownloads.has(job.hash)) {
        continue; // Already downloading
      }

      this.activeDownloads.add(job.hash);
      this.downloadFile(job).finally(() => {
        this.activeDownloads.delete(job.hash);
      });
    }
  }

  private async downloadFile(job: DownloadJob): Promise<void> {
    try {
      this.logger.info(`📥 Downloading: ${job.targetPath}`);
      
      const success = await this.networkManager.downloadFile(job.sourceUrl, job.targetPath);
      
      if (success) {
        this.logger.info(`✅ Downloaded: ${job.targetPath}`);
        // File manager will detect the new file and add it to our collection
      } else {
        this.logger.warn(`❌ Failed to download: ${job.targetPath}`);
      }
    } catch (error) {
      this.logger.error(`Error downloading ${job.targetPath}:`, error);
    }
  }

  private startPeriodicSync(): void {
    const interval = this.config.syncInterval || 30000; // 30 seconds default
    
    this.syncTimer = globalThis.setInterval(async () => {
      try {
        await this.announceFiles();
        this.processDownloadQueue();
      } catch (error) {
        this.logger.error('Error during periodic sync:', error);
      }
    }, interval);
  }

  public getStatus(): { isRunning: boolean; localFiles: number; queuedDownloads: number; activeDownloads: number; directory: string; port: number; digNatToolsAvailable: boolean; sharedFiles: number; knownPeers: number } {
    const localFiles = this.fileManager.getFiles();
    return {
      isRunning: this.isRunning,
      localFiles: localFiles.length,
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
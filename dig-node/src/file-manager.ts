import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import chokidar from 'chokidar';
import { DigFileInfo } from './types.js';
import { Logger } from './logger.js';

export class FileManager extends EventEmitter {
  private digDirectory: string;
  private logger: Logger;
  private files: Map<string, DigFileInfo> = new Map(); // hash -> file info
  private watcher?: chokidar.FSWatcher;

  constructor(digDirectory: string, logger: Logger) {
    super();
    this.digDirectory = digDirectory;
    this.logger = logger;
  }

  public async initialize(): Promise<void> {
    // Ensure directory exists
    if (!fs.existsSync(this.digDirectory)) {
      fs.mkdirSync(this.digDirectory, { recursive: true });
    }

    // Scan existing files
    await this.scanDirectory();

    // Set up file watcher
    this.setupWatcher();
  }

  public async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
    }
  }

  private async scanDirectory(): Promise<void> {
    this.logger.debug(`Scanning directory: ${this.digDirectory}`);
    
    try {
      const entries = fs.readdirSync(this.digDirectory, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.dig')) {
          const filePath = path.join(this.digDirectory, entry.name);
          await this.addFile(filePath);
        }
      }

      this.logger.info(`Found ${this.files.size} .dig files`);
    } catch (error) {
      this.logger.error('Error scanning directory:', error);
    }
  }

  private setupWatcher(): void {
    this.watcher = chokidar.watch('*.dig', {
      cwd: this.digDirectory,
      persistent: true,
      ignoreInitial: true
    });

    this.watcher.on('add', async (relativePath: string) => {
      const fullPath = path.join(this.digDirectory, relativePath);
      await this.addFile(fullPath);
    });

    this.watcher.on('change', async (relativePath: string) => {
      const fullPath = path.join(this.digDirectory, relativePath);
      await this.updateFile(fullPath);
    });

    this.watcher.on('unlink', (relativePath: string) => {
      const fullPath = path.join(this.digDirectory, relativePath);
      this.removeFile(fullPath);
    });

    this.logger.debug('File watcher set up');
  }

  private async addFile(filePath: string): Promise<void> {
    try {
      const stats = fs.statSync(filePath);
      const hash = await this.calculateFileHash(filePath);
      
      const fileInfo: DigFileInfo = {
        hash,
        path: path.relative(this.digDirectory, filePath),
        size: stats.size,
        lastModified: stats.mtime.getTime()
      };

      this.files.set(hash, fileInfo);
      this.logger.debug(`Added file: ${fileInfo.path} (${hash})`);
      this.emit('fileAdded', fileInfo);
    } catch (error) {
      this.logger.error(`Error adding file ${filePath}:`, error);
    }
  }

  private async updateFile(filePath: string): Promise<void> {
    try {
      // Remove old entry if exists
      const oldFileInfo = Array.from(this.files.values()).find(f => 
        path.join(this.digDirectory, f.path) === filePath
      );
      
      if (oldFileInfo) {
        this.files.delete(oldFileInfo.hash);
      }

      // Add updated file
      await this.addFile(filePath);
    } catch (error) {
      this.logger.error(`Error updating file ${filePath}:`, error);
    }
  }

  private removeFile(filePath: string): void {
    const fileInfo = Array.from(this.files.values()).find(f => 
      path.join(this.digDirectory, f.path) === filePath
    );

    if (fileInfo) {
      this.files.delete(fileInfo.hash);
      this.logger.debug(`Removed file: ${fileInfo.path}`);
      this.emit('fileRemoved', filePath);
    }
  }

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

  public getFiles(): DigFileInfo[] {
    return Array.from(this.files.values());
  }

  public getFile(hash: string): DigFileInfo | undefined {
    return this.files.get(hash);
  }

  public hasFile(hash: string): boolean {
    return this.files.has(hash);
  }

  public getFilePath(hash: string): string | undefined {
    const fileInfo = this.files.get(hash);
    if (fileInfo) {
      return path.join(this.digDirectory, fileInfo.path);
    }
    return undefined;
  }

  public async addDownloadedFile(hash: string, fileName: string, buffer: Buffer): Promise<boolean> {
    try {
      // Verify hash
      const calculatedHash = crypto.createHash('sha256').update(buffer).digest('hex');
      if (calculatedHash !== hash) {
        this.logger.error(`Hash mismatch for downloaded file ${fileName}: expected ${hash}, got ${calculatedHash}`);
        return false;
      }

      // Write file
      const filePath = path.join(this.digDirectory, fileName);
      fs.writeFileSync(filePath, buffer);

      this.logger.info(`Successfully saved downloaded file: ${fileName}`);
      return true;
    } catch (error) {
      this.logger.error(`Error saving downloaded file ${fileName}:`, error);
      return false;
    }
  }
}
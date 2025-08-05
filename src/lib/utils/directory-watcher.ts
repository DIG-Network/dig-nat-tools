import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';

// Type declarations for modules without built-in TypeScript support
interface FSWatcher {
  on(event: 'add' | 'change' | 'unlink', listener: (path: string) => void): this;
  on(event: 'ready', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  close(): Promise<void>;
}

// Import with type assertion
// eslint-disable-next-line @typescript-eslint/no-var-requires
const chokidar = require('chokidar') as {
  watch(paths: string, options?: any): FSWatcher;
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const debounce = require('lodash.debounce') as <T extends (...args: any[]) => any>(
  func: T,
  wait?: number
) => T;

/**
 * Event for when a new file is discovered
 */
export interface FileDiscoveredEvent {
  filePath: string;
  hash: string;
  size: number;
}

/**
 * Event for when a file is removed
 */
export interface FileRemovedEvent {
  filePath: string;
  hash: string;
}

/**
 * Options for directory watcher
 */
export interface DirectoryWatcherOptions {
  /** Path to directory to watch */
  directory: string;
  
  /** Whether to watch subdirectories recursively (default: true) */
  recursive?: boolean;
  
  /** File extensions to include (default: include all files) */
  includeExtensions?: string[];
  
  /** File extensions to exclude (default: exclude none) */
  excludeExtensions?: string[];
  
  /** Maximum file size in bytes to consider (default: no limit) */
  maxFileSize?: number;
  
  /** Whether to persist file hash cache between sessions (default: true) */
  persistHashes?: boolean;
  
  /** Directory to store hash cache (default: same as watched directory) */
  persistenceDir?: string;
}

/**
 * Class for watching a directory, calculating file hashes, and monitoring for changes
 */
export class DirectoryWatcher extends EventEmitter {
  private options: DirectoryWatcherOptions;
  private watcher: FSWatcher | null = null;
  private fileHashes: Map<string, string> = new Map(); // filePath -> hash
  private hashToFile: Map<string, string> = new Map(); // hash -> filePath
  private hashCachePath: string;
  private isInitialScan = true;
  private processingFiles = new Set<string>();
  
  /**
   * Create a new DirectoryWatcher
   * @param options Configuration options
   */
  constructor(options: DirectoryWatcherOptions) {
    super();
    this.options = {
      recursive: true,
      persistHashes: true,
      ...options
    };
    
    // Ensure the directory exists
    if (!fs.existsSync(this.options.directory)) {
      throw new Error(`Watch directory does not exist: ${this.options.directory}`);
    }
    
    // Set up hash cache path
    const cacheDir = this.options.persistenceDir || this.options.directory;
    this.hashCachePath = path.join(cacheDir, '.dig-file-hashes.json');
    
    // Load file hash cache if enabled
    this.loadHashCache();
  }
  
  /**
   * Start watching the directory
   */
  async start(): Promise<void> {
    // Create watcher instance
    const watchPattern = this.options.recursive 
      ? path.join(this.options.directory, '**', '*') 
      : path.join(this.options.directory, '*');
      
    this.watcher = chokidar.watch(watchPattern, {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });
    
    // Set up event handlers
    this.watcher
      .on('add', (filePath: string) => this.handleFileAdded(filePath))
      .on('change', (filePath: string) => this.handleFileChanged(filePath))
      .on('unlink', (filePath: string) => this.handleFileRemoved(filePath))
      .on('ready', () => {
        this.isInitialScan = false;
        console.log(`Initial directory scan completed for ${this.options.directory}`);
      })
      .on('error', (error: Error) => {
        console.error(`Watcher error: ${error}`);
        this.emit('error', error);
      });
    
    return Promise.resolve();
  }
  
  /**
   * Stop watching the directory
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    
    // Save hash cache if enabled
    if (this.options.persistHashes) {
      this.saveHashCache();
    }
    
    return Promise.resolve();
  }
  
  /**
   * Get all currently tracked file hashes
   */
  getTrackedFiles(): Map<string, string> {
    return new Map(this.fileHashes);
  }
  
  /**
   * Load hash cache from disk
   */
  private loadHashCache(): void {
    if (!this.options.persistHashes) return;
    
    try {
      if (fs.existsSync(this.hashCachePath)) {
        const cache = fs.readJsonSync(this.hashCachePath);
        
        // Add existing files from cache
        for (const [filePath, hash] of Object.entries(cache)) {
          if (fs.existsSync(filePath) && typeof hash === 'string') {
            this.fileHashes.set(filePath, hash);
            this.hashToFile.set(hash, filePath);
          }
        }
        
        console.log(`Loaded ${this.fileHashes.size} file hashes from cache`);
      }
    } catch (error) {
      console.error(`Error loading hash cache: ${error}`);
    }
  }
  
  /**
   * Save hash cache to disk
   */
  private saveHashCache(): void {
    if (!this.options.persistHashes) return;
    
    try {
      const cacheObj: Record<string, string> = {};
      for (const [filePath, hash] of this.fileHashes.entries()) {
        cacheObj[filePath] = hash;
      }
      
      fs.writeJsonSync(this.hashCachePath, cacheObj, { spaces: 2 });
      console.log(`Saved ${this.fileHashes.size} file hashes to cache`);
    } catch (error) {
      console.error(`Error saving hash cache: ${error}`);
    }
  }
  
  /**
   * Check if a file should be processed based on options
   */
  private shouldProcessFile(filePath: string): boolean {
    try {
      // Check if it's a directory
      if (fs.statSync(filePath).isDirectory()) {
        return false;
      }
      
      // Get file extension
      const ext = path.extname(filePath).toLowerCase();
      
      // Check extension inclusion
      if (this.options.includeExtensions && this.options.includeExtensions.length > 0) {
        if (!this.options.includeExtensions.includes(ext)) {
          return false;
        }
      }
      
      // Check extension exclusion
      if (this.options.excludeExtensions && this.options.excludeExtensions.includes(ext)) {
        return false;
      }
      
      // Check file size
      if (this.options.maxFileSize) {
        const stats = fs.statSync(filePath);
        if (stats.size > this.options.maxFileSize) {
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error(`Error checking file ${filePath}: ${error}`);
      return false;
    }
  }
  
  /**
   * Calculate SHA-256 hash for a file
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        
        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', (error) => reject(error));
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Handle file added or changed
   */
  private async handleFileAdded(filePath: string): Promise<void> {
    // Don't process the hash cache file
    if (filePath === this.hashCachePath) return;
    
    // Skip if we're already processing this file
    if (this.processingFiles.has(filePath)) return;
    
    // Check if file should be processed
    if (!this.shouldProcessFile(filePath)) return;
    
    try {
      this.processingFiles.add(filePath);
      
      // Calculate file hash
      const hash = await this.calculateFileHash(filePath);
      const stats = fs.statSync(filePath);
      const fileSize = stats.size;
      
      // Check if we already know this file by its hash
      const existingFilePath = this.hashToFile.get(hash);
      if (existingFilePath && existingFilePath !== filePath) {
        console.log(`File ${filePath} is duplicate of ${existingFilePath}, using existing hash`);
        this.fileHashes.set(filePath, hash);
      } else if (!this.fileHashes.has(filePath) || this.fileHashes.get(filePath) !== hash) {
        // New or changed file
        const oldHash = this.fileHashes.get(filePath);
        if (oldHash) {
          // Remove old hash mapping
          this.hashToFile.delete(oldHash);
        }
        
        // Update mappings
        this.fileHashes.set(filePath, hash);
        this.hashToFile.set(hash, filePath);
        
        // Emit discovery event
        this.emit('file:discovered', {
          filePath,
          hash,
          size: fileSize
        } as FileDiscoveredEvent);
        
        console.log(`${oldHash ? 'Updated' : 'Added'} file: ${filePath} with hash ${hash}`);
      }
      
      // Debounced save to avoid excessive disk writes during batch operations
      this.debouncedSaveHashCache();
    } catch (error) {
      console.error(`Error processing file ${filePath}: ${error}`);
    } finally {
      this.processingFiles.delete(filePath);
    }
  }
  
  /**
   * Handle file changed (same as added for our purposes)
   */
  private handleFileChanged = this.handleFileAdded;
  
  /**
   * Handle file removed
   */
  private handleFileRemoved(filePath: string): void {
    // Get hash before removing
    const hash = this.fileHashes.get(filePath);
    if (hash) {
      // Remove from mappings
      this.fileHashes.delete(filePath);
      this.hashToFile.delete(hash);
      
      // Emit removal event
      this.emit('file:removed', {
        filePath,
        hash
      } as FileRemovedEvent);
      
      console.log(`Removed file: ${filePath} with hash ${hash}`);
      
      // Save hash cache
      this.debouncedSaveHashCache();
    }
  }
  
  /**
   * Debounced hash cache save to avoid too many disk writes
   */
  private debouncedSaveHashCache = debounce(() => {
    if (this.options.persistHashes) {
      this.saveHashCache();
    }
  }, 5000);
} 
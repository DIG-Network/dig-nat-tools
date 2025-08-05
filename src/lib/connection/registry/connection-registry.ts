/**
 * Connection Registry - Tracks successful connection methods for peers
 * 
 * Provides a persistent registry of connection methods that work for specific peers,
 * allowing for faster reconnection in the future.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import Debug from 'debug';
import { CONNECTION_TYPE } from '../../../types/constants';

const debug = Debug('dig-nat-tools:connection-registry');

// Registry entry interface
export interface RegistryEntry {
  peerId: string;
  connectionType: CONNECTION_TYPE;
  address?: string;
  port?: number;
  lastSuccessTime: number;
  successCount: number;
  metadata?: Record<string, any>;
}

/**
 * Connection Registry class
 * Maintains a persistent record of successful connection methods for peers
 */
export class ConnectionRegistry {
  private registryDir: string;
  private maxAge: number; // in milliseconds
  private initialized: boolean = false;
  private memoryCache: Map<string, RegistryEntry> = new Map();

  /**
   * Create a new ConnectionRegistry
   * @param options Registry options
   */
  constructor(options: {
    registryDir?: string;
    maxAgeDays?: number;
  } = {}) {
    // Default to a directory in the user's home directory
    this.registryDir = options.registryDir || 
      path.join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.dig-nat-tools', 'registry');
    
    // Default max age is 45 days
    this.maxAge = (options.maxAgeDays || 45) * 24 * 60 * 60 * 1000;
  }

  /**
   * Initialize the registry
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure registry directory exists
      await fs.ensureDir(this.registryDir);
      debug(`Connection registry initialized at ${this.registryDir}`);
      
      // Load registry entries into memory
      await this.loadRegistry();
      
      // Clean up old entries
      await this.cleanupOldEntries();
      
      this.initialized = true;
    } catch (err) {
      debug(`Failed to initialize connection registry: ${(err as Error).message}`);
      throw err;
    }
  }

  /**
   * Load registry entries from disk into memory
   */
  private async loadRegistry(): Promise<void> {
    try {
      const files = await fs.readdir(this.registryDir);
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        try {
          const filePath = path.join(this.registryDir, file);
          const data = await fs.readFile(filePath, 'utf8');
          const entry = JSON.parse(data) as RegistryEntry;
          
          // Add to memory cache
          this.memoryCache.set(entry.peerId, entry);
          
          debug(`Loaded registry entry for peer ${entry.peerId}`);
        } catch (err) {
          debug(`Error loading registry file ${file}: ${(err as Error).message}`);
        }
      }
      
      debug(`Loaded ${this.memoryCache.size} registry entries into memory`);
    } catch (err) {
      debug(`Error loading registry: ${(err as Error).message}`);
    }
  }

  /**
   * Save a successful connection method for a peer
   * @param peerId The peer ID
   * @param connectionType The connection type that succeeded
   * @param options Additional options
   */
  async saveSuccessfulConnection(
    peerId: string,
    connectionType: CONNECTION_TYPE,
    options: {
      address?: string;
      port?: number;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<void> {
    await this.initialize();

    try {
      // Create entry
      const entry: RegistryEntry = {
        peerId,
        connectionType,
        address: options.address,
        port: options.port,
        lastSuccessTime: Date.now(),
        successCount: 1,
        metadata: options.metadata
      };
      
      // Check if we already have an entry for this peer
      const existingEntry = this.memoryCache.get(peerId);
      if (existingEntry) {
        // Update existing entry
        entry.successCount = existingEntry.successCount + 1;
        
        // If the connection type is different, note it in debug
        if (existingEntry.connectionType !== connectionType) {
          debug(`Connection type for peer ${peerId} changed from ${existingEntry.connectionType} to ${connectionType}`);
        }
      }
      
      // Update memory cache
      this.memoryCache.set(peerId, entry);
      
      // Generate filename based on peer ID
      const safeFileName = this.getSafeFileName(peerId);
      const filePath = path.join(this.registryDir, `${safeFileName}.json`);
      
      // Write to disk
      await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf8');
      
      debug(`Saved successful ${connectionType} connection for peer ${peerId}`);
    } catch (err) {
      debug(`Error saving connection entry: ${(err as Error).message}`);
    }
  }

  /**
   * Get the most successful connection method for a peer
   * @param peerId The peer ID
   * @returns The connection entry if found, undefined otherwise
   */
  async getConnectionMethod(peerId: string): Promise<RegistryEntry | undefined> {
    await this.initialize();
    return this.memoryCache.get(peerId);
  }

  /**
   * Get all successful connection methods for a peer
   * @param peerId The peer ID
   * @returns An array of CONNECTION_TYPE values, ordered by success count
   */
  getSuccessfulMethods(peerId: string): CONNECTION_TYPE[] {
    // If we're not initialized yet, return an empty array
    if (!this.initialized) {
      return [];
    }
    
    const entry = this.memoryCache.get(peerId);
    if (!entry) {
      return [];
    }
    
    // For now, we only store one connection type per peer
    // In the future, we could expand this to track multiple successful methods
    return [entry.connectionType];
  }

  /**
   * Remove a connection method for a peer
   * @param peerId The peer ID
   */
  async removeConnectionMethod(peerId: string): Promise<void> {
    await this.initialize();
    
    try {
      // Remove from memory cache
      this.memoryCache.delete(peerId);
      
      // Remove file
      const safeFileName = this.getSafeFileName(peerId);
      const filePath = path.join(this.registryDir, `${safeFileName}.json`);
      
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
        debug(`Removed connection method for peer ${peerId}`);
      }
    } catch (err) {
      debug(`Error removing connection method: ${(err as Error).message}`);
    }
  }

  /**
   * Clean up old registry entries (older than maxAge)
   */
  async cleanupOldEntries(): Promise<void> {
    const now = Date.now();
    const cleanupThreshold = now - this.maxAge;
    
    let cleanedCount = 0;
    
    // Check memory cache first
    for (const [peerId, entry] of this.memoryCache.entries()) {
      if (entry.lastSuccessTime < cleanupThreshold) {
        await this.removeConnectionMethod(peerId);
        cleanedCount++;
      }
    }
    
    // Also check filesystem directly for any files we missed
    try {
      const files = await fs.readdir(this.registryDir);
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        try {
          const filePath = path.join(this.registryDir, file);
          const stats = await fs.stat(filePath);
          
          // Check file modification time as a backup
          if (stats.mtimeMs < cleanupThreshold) {
            await fs.remove(filePath);
            cleanedCount++;
          }
        } catch (err) {
          debug(`Error checking file age for ${file}: ${(err as Error).message}`);
        }
      }
      
      debug(`Cleaned up ${cleanedCount} old registry entries`);
    } catch (err) {
      debug(`Error during registry cleanup: ${(err as Error).message}`);
    }
  }

  /**
   * Convert a peer ID to a safe filename
   * @param peerId The peer ID
   * @returns A safe filename
   */
  private getSafeFileName(peerId: string): string {
    // If the ID is complex, hash it to get a predictable filename
    if (peerId.length > 64 || /[<>:"/\\|?*\x00-\x1F]/g.test(peerId)) {
      return crypto.createHash('md5').update(peerId).digest('hex');
    }
    return peerId.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  }
}

// Export a singleton instance for convenience
export const connectionRegistry = new ConnectionRegistry();

export default connectionRegistry; 
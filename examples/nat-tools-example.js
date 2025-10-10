/**
 * NAT Tools Example
 * 
 * This example demonstrates the simplified NatTools interface:
 * 1. Seeds all *.dig files from ~/.dig directory (or Windows equivalent)
 * 2. Periodically discovers magnet URIs from the Gun.js registry
 * 3. Downloads files that we don't already have
 */

import { NatTools } from '../dist/index.js';
import { webTorrentManager } from '../dist/webtorrent-manager.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// Configuration
const CONFIG = {
  digDirectory: path.join(os.homedir(), '.dig'),
  discoveryIntervalMs: 30000, // 5 minutes
  peers: ['http://dig-relay-prod.eba-2cmanxbe.us-east-1.elasticbeanstalk.com/gun']
};

// Track files currently being downloaded to prevent duplicates
const downloadingFiles = new Set();
const downloadQueue = []; // Queue for pending downloads
let currentDownload = null; // Track current download

/**
 * Process the next download in the queue
 */
function processNextDownload(natTools) {
  // If already downloading or queue is empty, do nothing
  if (currentDownload !== null || downloadQueue.length === 0) {
    return;
  }

  // Get the next download from the queue
  const { magnetUri, displayName, existingFiles } = downloadQueue.shift();
  currentDownload = magnetUri;
  downloadingFiles.add(magnetUri);

  logger.info(`\n📥 Starting download: ${displayName} (${downloadQueue.length} remaining in queue)`);

  // Fire-and-forget: just start the download
  // Events will be handled by the global listeners set up in main()
  natTools.downloadFromMagnet(magnetUri);
}

/**
 * Add a download to the queue and start processing if not already downloading
 */
function queueDownload(natTools, magnetUri, displayName, existingFiles) {
  downloadQueue.push({ magnetUri, displayName, existingFiles });
  logger.info(`📋 Queued: ${displayName} (queue size: ${downloadQueue.length})`);
  
  // Start processing if not already downloading
  processNextDownload(natTools);
}

// Create a simple logger
const logger = {
  debug: (message, ...args) => {
    if (process.env.DEBUG) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  },
  info: (message, ...args) => console.log(`[INFO] ${message}`, ...args),
  warn: (message, ...args) => console.warn(`[WARN] ${message}`, ...args),
  error: (message, ...args) => console.error(`[ERROR] ${message}`, ...args)
};

/**
 * Calculate SHA256 hash of a file
 */
function calculateFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

/**
 * Get all *.dig files from a directory
 */
function getDigFiles(directory) {
  if (!fs.existsSync(directory)) {
    logger.info(`Creating directory: ${directory}`);
    fs.mkdirSync(directory, { recursive: true });
    return [];
  }

  const files = fs.readdirSync(directory);
  return files
    .filter(file => file.endsWith('.dig'))
    .map(file => path.join(directory, file));
}

/**
 * Seed all *.dig files from the configured directory
 */
async function seedAllDigFiles(natTools) {
  logger.info('🌱 Starting to seed *.dig files...');

  const digFiles = getDigFiles(CONFIG.digDirectory);

  if (digFiles.length === 0) {
    logger.info('📭 No *.dig files found to seed');
    return [];
  }

  logger.info(`📦 Found ${digFiles.length} *.dig files to seed`);

  const seededFiles = [];

  for (const filePath of digFiles) {
    try {
      const fileName = path.basename(filePath);
      logger.info(`🌱 Seeding: ${fileName}`);

      const result = await natTools.seedFile(filePath);
      seededFiles.push(result);

      logger.info(`✅ Seeded: ${fileName}`);
    } catch (error) {
      logger.error(`❌ Failed to seed ${path.basename(filePath)}:`, error.message);
    }
  }

  logger.info(`✅ Seeded ${seededFiles.length} files successfully`);
  return seededFiles;
}

/**
 * Rebroadcast all currently seeded magnet URIs
 */
async function rebroadcastMagnetUris(natTools) {
  try {
    const seededFiles = natTools.getSeededFiles();
    
    if (seededFiles.size === 0) {
      logger.debug('No files to rebroadcast');
      return;
    }

    logger.info(`📡 Rebroadcasting ${seededFiles.size} magnet URIs...`);

    const count = await natTools.rebroadcastMagnetUris();
    
    logger.info(`✅ Rebroadcast ${count} magnet URIs successfully`);
  } catch (error) {
    logger.error('❌ Error during rebroadcast:', error.message);
  }
}

/**
 * Discover and download new files
 */
async function discoverAndDownload(natTools) {
  try {
    logger.info('🔍 Discovering magnet URIs...');

    // Discover magnet URIs (only from last 1 minute)
    const magnetUris = await natTools.discoverMagnetUris(60000);

    if (magnetUris.length === 0) {
      logger.info('📭 No magnet URIs found');
      return;
    }

    logger.info(`📋 Discovered ${magnetUris.length} magnet URIs`);

    // Get list of files we already have
    const seededFiles = natTools.getSeededFiles();
    const seededMagnetUris = new Set(Array.from(seededFiles.values()));

    // Get existing file hashes in download directory
    const existingFiles = new Set();
    if (fs.existsSync(CONFIG.digDirectory)) {
      const downloadedFiles = fs.readdirSync(CONFIG.digDirectory);
      downloadedFiles.forEach(file => {
        const filePath = path.join(CONFIG.digDirectory, file);
        if (fs.statSync(filePath).isFile()) {
          try {
            const hash = calculateFileHash(filePath);
            existingFiles.add(hash);
          } catch (error) {
            logger.warn(`⚠️ Could not hash file ${file}:`, error.message);
          }
        }
      });
    }

    // Filter out magnet URIs we already have
    const newMagnetUris = magnetUris.filter(uri => !seededMagnetUris.has(uri));

    if (newMagnetUris.length === 0) {
      logger.info('✅ All discovered files are already seeded');
      return;
    }

    // Ensure download directory exists
    if (!fs.existsSync(CONFIG.digDirectory)) {
      fs.mkdirSync(CONFIG.digDirectory, { recursive: true });
    }

    logger.info(`📥 Found ${newMagnetUris.length} new files to download`);
    logger.info(`🔄 Adding to sequential download queue...`);

    // Create a set of magnet URIs already in the queue
    const queuedMagnetUris = new Set(downloadQueue.map(item => item.magnetUri));

    // Queue all new downloads
    let addedCount = 0;
    for (const magnetUri of newMagnetUris) {
      // Skip if already downloading, in queue, or we already have it seeded
      if (downloadingFiles.has(magnetUri) || queuedMagnetUris.has(magnetUri)) {
        continue;
      }

      // Extract display name from magnet URI (dn parameter) or use timestamp
      const displayNameMatch = magnetUri.match(/dn=([^&]+)/);
      const displayName = displayNameMatch ? decodeURIComponent(displayNameMatch[1]) : `file-${Date.now()}`;

      // Add to queue
      queueDownload(natTools, magnetUri, displayName, existingFiles);
      addedCount++;
    }

    if (addedCount > 0) {
      logger.info(`✅ Added ${addedCount} new downloads to queue`);
    } else {
      logger.info(`ℹ️ No new downloads to add (all are already downloading or queued)`);
    }

  } catch (error) {
    logger.error('❌ Error during discovery/download:', error.message);
  }
}

/**
 * Main function
 */
async function main() {
  logger.info('='.repeat(60));
  logger.info('🚀 NAT Tools Example Starting');
  logger.info('='.repeat(60));
  logger.info(`📂 Dig directory: ${CONFIG.digDirectory}`);
  logger.info(`📥 Download directory: ${CONFIG.digDirectory}`);
  logger.info(`🔄 Discovery interval: ${CONFIG.discoveryIntervalMs}ms`);
  logger.info('='.repeat(60));

  // Create NatTools instance
  const natTools = new NatTools({
    peers: CONFIG.peers,
    namespace: 'dig-nat-tools',
    logger: logger
  });

  try {
    // Initialize
    logger.info('🔧 Initializing NAT Tools...');
    await natTools.initialize();
    logger.info('✅ NAT Tools initialized');

    // Set up download event handlers
    webTorrentManager.on('metadata', (data) => {
      logger.info(`📋 Metadata received: ${data.name} (${(data.size / 1024 / 1024).toFixed(2)} MB)`);
    });

    webTorrentManager.on('download', (data) => {
      if (data.progress > 0) {
        const progressPercent = (data.progress * 100).toFixed(1);
        const downloadedMB = (data.downloaded / 1024 / 1024).toFixed(2);
        const speedMBps = (data.downloadSpeed / 1024 / 1024).toFixed(2);
        logger.info(`📊 Progress: ${progressPercent}% | ${downloadedMB} MB | ${speedMBps} MB/s - ${data.name}`);
      }
    });

    // Handle download completion
    webTorrentManager.on('download-complete', async (data) => {
      logger.info(`✅ Download complete: ${data.name} (${data.size} bytes)`);

      try {
        // Calculate hash of downloaded content
        const contentHash = crypto.createHash('sha256').update(data.buffer).digest('hex');

        // Find the display name from the magnet URI
        const displayNameMatch = data.magnetUri.match(/dn=([^&]+)/);
        const displayName = displayNameMatch ? decodeURIComponent(displayNameMatch[1]) : `file-${Date.now()}`;

        // Save the file with the display name or content hash
        const fileName = displayName.endsWith('.dig') ? displayName : `${contentHash}.dig`;
        const filePath = path.join(CONFIG.digDirectory, fileName);

        // Check if we already have this file
        if (fs.existsSync(filePath)) {
          logger.info(`⏭️ File already exists: ${fileName}`);
        } else {
          fs.writeFileSync(filePath, data.buffer);
          logger.info(`💾 Saved file: ${fileName}`);

          // Optionally seed the downloaded file
          try {
            await natTools.seedFile(filePath);
            logger.info(`🌱 Now seeding downloaded file: ${fileName}`);
          } catch (error) {
            logger.warn(`⚠️ Could not seed downloaded file:`, error.message);
          }
        }
      } catch (error) {
        logger.error(`❌ Error processing downloaded file:`, error.message);
      } finally {
        // Remove from downloading set
        downloadingFiles.delete(data.magnetUri);
        if (currentDownload === data.magnetUri) {
          currentDownload = null;
        }

        // Process next download in queue
        setImmediate(() => processNextDownload(natTools));
      }
    });

    // Handle download errors
    webTorrentManager.on('download-error', (data) => {
      logger.error(`❌ Download failed: ${data.magnetUri.substring(0, 50)}...`, data.error);

      // Remove from downloading set
      downloadingFiles.delete(data.magnetUri);
      if (currentDownload === data.magnetUri) {
        currentDownload = null;
      }

      // Process next download in queue
      setImmediate(() => processNextDownload(natTools));
    });

    // Check availability
    const webTorrentAvailable = natTools.isWebTorrentAvailable();
    const registryAvailable = natTools.isRegistryAvailable();

    logger.info(`📊 WebTorrent: ${webTorrentAvailable ? '✅' : '❌'}`);
    logger.info(`📊 Gun Registry: ${registryAvailable ? '✅' : '❌'}`);

    if (!webTorrentAvailable || !registryAvailable) {
      throw new Error('Required services not available');
    }

    // Seed all *.dig files
    await seedAllDigFiles(natTools);

    logger.info('='.repeat(60));
    logger.info('🔄 Starting periodic discovery and rebroadcast...');
    logger.info('   Press Ctrl+C to stop');
    logger.info('='.repeat(60));

    // Start periodic discovery, download, and rebroadcast
    const periodicInterval = setInterval(async () => {
      // Rebroadcast magnet URIs to keep them fresh
      await rebroadcastMagnetUris(natTools);
      
      // Discover and download new files
      await discoverAndDownload(natTools);
    }, CONFIG.discoveryIntervalMs);

    // Run initial discovery
    await discoverAndDownload(natTools);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('\n\n🛑 Shutting down gracefully...');
      clearInterval(periodicInterval);

      try {
        await natTools.destroy();
        logger.info('✅ Cleanup complete');
        process.exit(0);
      } catch (error) {
        logger.error('❌ Error during cleanup:', error.message);
        process.exit(1);
      }
    });

    // Keep the process running
    logger.info('✅ Application running...');

  } catch (error) {
    logger.error('❌ Fatal error:', error.message);
    logger.error(error.stack);

    try {
      await natTools.destroy();
    } catch (cleanupError) {
      logger.error('❌ Error during cleanup:', cleanupError.message);
    }

    process.exit(1);
  }
}

// Run the example
main();

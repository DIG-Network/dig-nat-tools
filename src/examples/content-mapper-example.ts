/**
 * Example showing how to use the hostFileCallback to map content IDs to file paths
 * 
 * This demonstrates an implementation where:
 * 1. Content IDs can be user-friendly identifiers
 * 2. The actual file path is determined by the host implementation
 * 3. The mapping between contentId and fileHash is maintained
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { createHost, announceFile, FileHost } from '../index';

// Example content mapping database (in a real app, this could be in a database)
interface ContentMapping {
  contentId: string;
  filePath: string;
  fileHash?: string;  // Will be computed if not provided
}

// Example content mappings
const contentMappings: ContentMapping[] = [
  {
    contentId: 'example-video',
    filePath: path.join(__dirname, 'files', 'sample-video.mp4')
  },
  {
    contentId: 'example-document',
    filePath: path.join(__dirname, 'files', 'sample-document.pdf')
  },
  {
    contentId: 'custom-content-id-123',
    filePath: path.join(__dirname, 'files', 'sample-image.jpg')
  }
];

// In-memory cache of file hashes
const fileHashCache = new Map<string, string>();

/**
 * Calculate SHA-256 hash of a file
 * @param filePath - Path to the file
 * @returns Promise resolving to the SHA-256 hash
 */
async function calculateFileHash(filePath: string): Promise<string> {
  // Check cache first
  if (fileHashCache.has(filePath)) {
    return fileHashCache.get(filePath)!;
  }
  
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    stream.on('error', (error) => {
      reject(error);
    });
    
    stream.on('data', (chunk) => {
      hash.update(chunk);
    });
    
    stream.on('end', () => {
      const fileHash = hash.digest('hex');
      // Store in cache
      fileHashCache.set(filePath, fileHash);
      resolve(fileHash);
    });
  });
}

/**
 * Initialize the content mappings by calculating file hashes
 */
async function initializeContentMappings(): Promise<void> {
  console.log('Initializing content mappings...');
  
  // Make sure the files directory exists
  await fs.ensureDir(path.join(__dirname, 'files'));
  
  // For each content mapping, calculate the file hash if not already provided
  for (const mapping of contentMappings) {
    if (!mapping.fileHash) {
      try {
        // Check if the file exists
        const exists = await fs.pathExists(mapping.filePath);
        if (!exists) {
          console.warn(`Warning: File ${mapping.filePath} does not exist for contentId ${mapping.contentId}`);
          continue;
        }
        
        mapping.fileHash = await calculateFileHash(mapping.filePath);
        console.log(`Calculated hash for ${mapping.contentId}: ${mapping.fileHash}`);
      } catch (error) {
        console.error(`Error calculating hash for ${mapping.contentId}:`, error);
      }
    }
  }
}

/**
 * Implementation of the hostFileCallback
 * This shows how to map contentId to a file path, read chunks, and handle errors
 */
async function hostFileCallback(
  contentId: string, 
  startChunk: number, 
  chunkSize: number, 
  sha256?: string
): Promise<Buffer[] | null> {
  console.log(`Serving contentId: ${contentId}, startChunk: ${startChunk}, using verification hash: ${sha256 || 'none'}`);
  
  // First strategy: Look up by contentId
  let mapping = contentMappings.find(m => m.contentId === contentId);
  
  // Second strategy: If not found by contentId, try looking up by fileHash
  if (!mapping && sha256) {
    mapping = contentMappings.find(m => m.fileHash === sha256);
  }
  
  // If we still haven't found a mapping, return null
  if (!mapping) {
    console.warn(`No mapping found for contentId: ${contentId} or hash: ${sha256}`);
    return null;
  }
  
  try {
    // Check if the file exists
    const exists = await fs.pathExists(mapping.filePath);
    if (!exists) {
      console.warn(`File ${mapping.filePath} does not exist for contentId ${contentId}`);
      return null;
    }
    
    // Get file stats to determine size
    const stats = await fs.stat(mapping.filePath);
    
    // Calculate start and end positions for the chunk
    const startPosition = startChunk * chunkSize;
    
    // If start position is beyond file size, return null
    if (startPosition >= stats.size) {
      return null;
    }
    
    // Calculate end position (limited by file size)
    const endPosition = Math.min(startPosition + chunkSize, stats.size);
    
    // Create a read stream for the specific chunk range
    const fileHandle = await fs.promises.open(mapping.filePath, 'r');
    const buffer = Buffer.alloc(endPosition - startPosition);
    
    await fileHandle.read(buffer, 0, buffer.length, startPosition);
    await fileHandle.close();
    
    console.log(`Read ${buffer.length} bytes from ${mapping.filePath} for contentId ${contentId}`);
    
    // Return the chunk as a single-element array
    return [buffer];
  } catch (error) {
    console.error(`Error reading file for contentId ${contentId}:`, error);
    return null;
  }
}

/**
 * Main function to start the content mapper example
 */
async function main() {
  // Initialize content mappings and calculate file hashes
  await initializeContentMappings();
  
  // Create a host with our custom file callback
  const host = createHost({
    hostFileCallback,
    enableTCP: true,
    enableUDP: true,
    enableWebRTC: true,
    tcpPort: 8080,
    udpPort: 8081
  });
  
  // Start the host
  await host.start();
  console.log(`Host started with ID: ${host.getHostId()}`);
  
  // Announce all content mappings to the network
  for (const mapping of contentMappings) {
    if (mapping.fileHash) {
      // Add the mapping to the host
      host.addContentMapping(mapping.contentId, mapping.fileHash);
      
      // Announce the file
      await announceFile(mapping.contentId, mapping.fileHash, 8080);
      console.log(`Announced content: ${mapping.contentId} with hash: ${mapping.fileHash}`);
    }
  }
  
  console.log('Content mapper example is running. Press Ctrl+C to exit.');
}

// Start the example
main().catch(error => {
  console.error('Error running content mapper example:', error);
  process.exit(1);
}); 
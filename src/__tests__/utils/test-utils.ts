import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import { createHost, createClient } from '../../index';

// Add type declaration for the global variable
declare global {
  namespace NodeJS {
    interface Global {
      TEST_DIR: string;
    }
  }
}

// Define test directories using OS temp directory instead of relying on global
const BASE_TEST_DIR = path.join(os.tmpdir(), 'dig-nat-tools-tests');
export const TEST_DIRS = {
  host: path.join(BASE_TEST_DIR, 'host'),
  client: path.join(BASE_TEST_DIR, 'client')
};

// Create test directories
fs.ensureDirSync(BASE_TEST_DIR);
fs.ensureDirSync(TEST_DIRS.host);
fs.ensureDirSync(TEST_DIRS.client);

/**
 * Generate a random file of the specified size
 * @param filePath Path to save the file
 * @param sizeInBytes Size of the file in bytes
 * @returns Promise resolving to the SHA-256 hash of the file
 */
export async function generateRandomFile(filePath: string, sizeInBytes: number = 1024 * 1024): Promise<string> {
  const buffer = crypto.randomBytes(sizeInBytes);
  await fs.writeFile(filePath, buffer);
  
  // Calculate the hash
  const hash = crypto.createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
}

/**
 * Calculate SHA-256 hash of a file
 * @param filePath Path to the file
 * @returns Promise resolving to the file hash
 */
export async function calculateFileHash(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);
  
  return new Promise<string>((resolve, reject) => {
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Create a host for testing
 * @param options Host options (enableTCP, enableUDP, etc.)
 * @param sourceFilePath Path to the file to serve
 * @returns Promise resolving to the host and the file hash
 */
export async function createTestHost(options: any, sourceFilePath: string) {
  const fileHash = await calculateFileHash(sourceFilePath);
  
  const host = createHost({
    enableTCP: true,
    enableUDP: true,
    enableWebRTC: true,
    tcpPort: 0, // Use random available port
    udpPort: 0, // Use random available port
    stunServers: [
      'stun:stun.l.google.com:19302',
    ],
    ...options,
    hostFileCallback: async (hash: string, startChunk: number, chunkSize: number) => {
      if (hash === fileHash) {
        try {
          const stats = await fs.stat(sourceFilePath);
          const start = startChunk * chunkSize;
          
          if (start >= stats.size) {
            return null;
          }
          
          const buffer = Buffer.alloc(chunkSize);
          const fileHandle = await fs.open(sourceFilePath, 'r');
          const { bytesRead } = await fs.read(fileHandle, buffer, 0, chunkSize, start);
          await fs.close(fileHandle);
          
          if (bytesRead === 0) {
            return null;
          } else {
            return [buffer.slice(0, bytesRead)];
          }
        } catch (err) {
          console.error('Error reading file chunk:', err);
          return null;
        }
      }
      return null;
    }
  });
  
  return { host, fileHash };
}

/**
 * Wait for a specified time
 * @param ms Time to wait in milliseconds
 * @returns Promise resolving after the specified time
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Clean up test files
 * @param paths Array of file paths to clean up
 */
export async function cleanupTestFiles(paths: string[]): Promise<void> {
  for (const filePath of paths) {
    try {
      await fs.remove(filePath);
    } catch (error) {
      console.error(`Error removing ${filePath}:`, error);
    }
  }
} 
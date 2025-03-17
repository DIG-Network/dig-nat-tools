import * as fs from 'fs-extra';
import * as crypto from 'crypto';

/**
 * Generate a random file of the specified size
 * @param filePath Path to save the file
 * @param size Size of the file in bytes
 */
export async function generateRandomFile(filePath: string, size: number): Promise<void> {
  const chunkSize = 64 * 1024;
  const fd = await fs.open(filePath, 'w');
  
  try {
    for (let i = 0; i < Math.ceil(size / chunkSize); i++) {
      const chunkData = Buffer.alloc(Math.min(chunkSize, size - i * chunkSize));
      // Fill with deterministic but "random-like" data
      for (let j = 0; j < chunkData.length; j++) {
        chunkData[j] = (i * 253 + j * 59) % 256;
      }
      
      await fs.write(fd, chunkData, 0, chunkData.length, i * chunkSize);
    }
  } finally {
    await fs.close(fd);
  }
}

/**
 * Clean up test files in the specified directory
 * @param directory Directory containing test files to clean up
 */
export async function cleanupTestFiles(directory: string): Promise<void> {
  try {
    await fs.remove(directory);
  } catch (error) {
    console.error(`Failed to clean up test directory: ${error}`);
  }
}

/**
 * Calculate SHA-256 hash of a file
 * @param filePath Path to the file
 * @returns SHA-256 hash as a hex string
 */
export async function getFileHash(filePath: string): Promise<string> {
  const fileData = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(fileData).digest('hex');
}

/**
 * Wait for the specified number of milliseconds
 * @param ms Milliseconds to wait
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Verify that two files have the same content
 * @param file1 Path to the first file
 * @param file2 Path to the second file
 * @returns True if the files have the same content, false otherwise
 */
export async function compareFiles(file1: string, file2: string): Promise<boolean> {
  const hash1 = await getFileHash(file1);
  const hash2 = await getFileHash(file2);
  return hash1 === hash2;
} 
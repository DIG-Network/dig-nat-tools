/**
 * Client Example
 * 
 * This example demonstrates how to create a client and download files
 * using the dig-nat-tools library. The client supports multiple connection types
 * including TCP, UDP, WebRTC, and Gun relay.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import * as readline from 'readline';
import { createClient, downloadFile } from '../index';

// Create directories for the example
const DOWNLOADS_DIR = path.join(process.cwd(), 'downloads');

/**
 * Calculate the SHA-256 hash of a file
 * @param filePath - Path to the file
 * @returns The file hash as a hex string
 */
async function calculateFileHash(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);
  
  return new Promise<string>((resolve, reject) => {
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Create a readline interface for user input
 */
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Ask a question and get user input
 * @param rl - Readline interface
 * @param question - Question to ask
 * @returns User's answer
 */
function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * Main function that runs the client example
 */
async function main() {
  try {
    // Create necessary directories
    await fs.ensureDir(DOWNLOADS_DIR);
    
    // Create readline interface for user input
    const rl = createInterface();
    
    console.log('=== Dig-NAT-Tools Client Example ===');
    console.log('This example demonstrates how to download files using the dig-nat-tools library.');
    console.log('You will need the host ID and file hash from a running host.\n');
    
    // Get host ID from user
    const hostId = await askQuestion(rl, 'Enter the host ID: ');
    if (!hostId) {
      console.error('Host ID is required.');
      rl.close();
      return;
    }
    
    // Get file hash from user
    const fileHash = await askQuestion(rl, 'Enter the file hash: ');
    if (!fileHash) {
      console.error('File hash is required.');
      rl.close();
      return;
    }
    
    // Get save path
    const defaultSavePath = path.join(DOWNLOADS_DIR, 'downloaded-file.dat');
    const savePath = await askQuestion(rl, `Enter save path (default: ${defaultSavePath}): `) || defaultSavePath;
    
    // Close readline interface
    rl.close();
    
    console.log('\nStarting download...');
    
    // Method 1: Using the downloadFile helper function (simpler approach)
    // This is a convenience function that handles the connection and download process
    await downloadFile(
      fileHash,
      savePath,
      [hostId], // Array of host IDs to try
      {
        // Optional configuration
        chunkSize: 64 * 1024, // 64KB chunks
        stunServers: [
          'stun:stun.l.google.com:19302',
          'stun:stun1.l.google.com:19302'
        ],
        // Progress callback
        progressCallback: (progress: { percent: number, received: number, total: number }) => {
          console.log(`Download progress: ${progress.percent}% (${progress.received}/${progress.total} bytes)`);
        }
      }
    );
    
    console.log(`\nFile downloaded to: ${savePath}`);
    
    // Verify the downloaded file
    console.log('Verifying file integrity...');
    const downloadedHash = await calculateFileHash(savePath);
    console.log(`Downloaded file hash: ${downloadedHash}`);
    
    if (downloadedHash === fileHash) {
      console.log('✅ File integrity verified - hashes match!');
    } else {
      console.error('❌ File integrity check failed - hashes do not match!');
    }
    
    // Method 2: Using the createClient API (more control)
    // This is commented out but shows how to use the lower-level API
    /*
    console.log('\nAlternative method using createClient API:');
    
    // Create a client with custom configuration
    const client = createClient({
      enableWebRTC: true,
      enableNATPMP: true,
      stunServers: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302'
      ],
      requestTimeout: 30000 // 30 seconds
    });
    
    // Initialize the client
    await client.initialize();
    
    // Download the file
    const alternativeSavePath = path.join(DOWNLOADS_DIR, 'downloaded-file-alt.dat');
    await client.downloadFile(fileHash, hostId, {
      savePath: alternativeSavePath,
      onProgress: (receivedBytes, totalBytes) => {
        const percent = Math.round((receivedBytes / totalBytes) * 100);
        console.log(`Download progress: ${percent}% (${receivedBytes}/${totalBytes} bytes)`);
      },
      onError: (error) => {
        console.error('Download error:', error);
      }
    });
    
    console.log(`\nFile downloaded to: ${alternativeSavePath}`);
    
    // Verify the downloaded file
    console.log('Verifying file integrity...');
    const altDownloadedHash = await calculateFileHash(alternativeSavePath);
    console.log(`Downloaded file hash: ${altDownloadedHash}`);
    
    if (altDownloadedHash === fileHash) {
      console.log('✅ File integrity verified - hashes match!');
    } else {
      console.error('❌ File integrity check failed - hashes do not match!');
    }
    
    // Clean up
    await client.shutdown();
    */
    
  } catch (err) {
    console.error('Error in client example:', err);
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
} 
/**
 * Multi-Peer Client Example
 * 
 * This example demonstrates how to download files from multiple hosts simultaneously
 * using the dig-nat-tools library. This approach can provide faster downloads
 * and better resilience against individual peer failures.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import * as readline from 'readline';
import { NetworkManager } from '../index';

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
 * Main function that runs the multi-peer client example
 */
async function main() {
  try {
    // Create necessary directories
    await fs.ensureDir(DOWNLOADS_DIR);
    
    // Create readline interface for user input
    const rl = createInterface();
    
    console.log('=== Dig-NAT-Tools Multi-Peer Client Example ===');
    console.log('This example demonstrates how to download files from multiple hosts simultaneously.');
    console.log('You will need the file hash and multiple host IDs.\n');
    
    // Get file hash from user
    const fileHash = await askQuestion(rl, 'Enter the file hash: ');
    if (!fileHash) {
      console.error('File hash is required.');
      rl.close();
      return;
    }
    
    // Get host IDs from user
    console.log('\nEnter host IDs (one per line). Enter an empty line when done:');
    const hostIds: string[] = [];
    
    while (true) {
      const hostId = await askQuestion(rl, `Host ID ${hostIds.length + 1}: `);
      if (!hostId) break;
      hostIds.push(hostId);
    }
    
    if (hostIds.length === 0) {
      console.error('At least one host ID is required.');
      rl.close();
      return;
    }
    
    console.log(`\nAdded ${hostIds.length} hosts.`);
    
    // Get save path
    const defaultSavePath = path.join(DOWNLOADS_DIR, 'multi-peer-download.dat');
    const savePath = await askQuestion(rl, `Enter save path (default: ${defaultSavePath}): `) || defaultSavePath;
    
    // Close readline interface
    rl.close();
    
    console.log('\nStarting multi-peer download...');
    
    // Create a NetworkManager instance
    // This is the component that handles multi-peer downloads
    const networkManager = new NetworkManager({
      // Optional configuration
      chunkSize: 64 * 1024, // 64KB chunks
      concurrency: 5, // Download up to 5 chunks simultaneously
      stunServers: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302'
      ],
      peerTimeout: 30000 // 30 seconds timeout for peer connections
    });
    
    // Download the file from multiple peers
    const result = await networkManager.downloadFile(
      hostIds,       // First parameter is the array of peers
      fileHash,      // Second parameter is the file hash
      {
        savePath: savePath,
        // Progress callback
        onProgress: (receivedBytes, totalBytes) => {
          const percent = Math.round((receivedBytes / totalBytes) * 100);
          console.log(`Download progress: ${percent}% (${receivedBytes}/${totalBytes} bytes)`);
        },
        // Peer status callback
        onPeerStatus: (peerId, status, bytesFromPeer) => {
          console.log(`Peer ${peerId}: ${status} (${bytesFromPeer} bytes)`);
        }
      }
    );
    
    console.log(`\nFile downloaded to: ${result.path}`);
    
    // Display peer statistics
    console.log('\nPeer Statistics:');
    console.log('-----------------');
    
    Object.entries(result.peerStats).forEach(([peerId, stats]) => {
      console.log(`Peer: ${peerId}`);
      console.log(`  Bytes downloaded: ${stats.bytesDownloaded}`);
      console.log(`  Chunks downloaded: ${stats.chunksDownloaded}`);
      console.log(`  Connection type: ${stats.connectionType}`);
      console.log('-----------------');
    });
    
    // Verify the downloaded file
    console.log('Verifying file integrity...');
    const downloadedHash = await calculateFileHash(savePath);
    console.log(`Downloaded file hash: ${downloadedHash}`);
    
    if (downloadedHash === fileHash) {
      console.log('✅ File integrity verified - hashes match!');
    } else {
      console.error('❌ File integrity check failed - hashes do not match!');
    }
    
  } catch (err) {
    console.error('Error in multi-peer client example:', err);
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
} 
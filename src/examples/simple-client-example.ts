/**
 * Simple Client Example
 * 
 * This example demonstrates how to download a file using the client.
 * It prompts for host ID, file hash, and IP address, downloads the file,
 * and displays its contents.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import * as readline from 'readline';
import { createClient, downloadFile } from '../index';

// Directory for downloaded files
const DOWNLOADS_DIR = path.join(process.cwd(), 'downloads');

/**
 * Calculate the SHA-256 hash of a file
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
 * Ask a question and get user input
 */
function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * Display a text file's contents
 */
async function displayTextFile(filePath: string): Promise<void> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    console.log('\n===== FILE CONTENT =====');
    console.log(content);
    console.log('=======================');
  } catch (err) {
    console.error('Error reading file:', err);
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Create necessary directories
    await fs.ensureDir(DOWNLOADS_DIR);
    
    // Create readline interface for user input
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    console.log('====== Simple Client Example ======');
    console.log('This example downloads a file and displays its contents.\n');
    
    // Get host ID from user
    const hostId = await askQuestion(rl, 'Enter Host ID: ');
    if (!hostId) {
      console.error('Host ID is required');
      rl.close();
      return;
    }
    
    // Get file hash from user
    const fileHash = await askQuestion(rl, 'Enter File Hash: ');
    if (!fileHash) {
      console.error('File hash is required');
      rl.close();
      return;
    }
    
    // Get IP address from user
    const ipAddress = await askQuestion(rl, 'Enter Host IP Address (IPv4 or IPv6): ');
    
    // Default save path
    const savePath = path.join(DOWNLOADS_DIR, 'hello-world.txt');
    
    console.log('\nDownload Configuration:');
    console.log(`- Host ID: ${hostId}`);
    console.log(`- File Hash: ${fileHash}`);
    console.log(`- Host IP: ${ipAddress || 'Not provided (will attempt auto-discovery)'}`);
    console.log(`- Save Path: ${savePath}`);
    
    // Ask for confirmation
    const confirm = await askQuestion(rl, '\nProceed with download? (y/n): ');
    if (confirm.toLowerCase() !== 'y') {
      console.log('Download cancelled');
      rl.close();
      return;
    }
    
    // Close readline interface
    rl.close();
    
    // Configure Gun options with the provided IP if available
    const gunOptions: any = {};
    if (ipAddress) {
      // Determine if IPv4 or IPv6
      const isIPv6 = ipAddress.includes(':');
      const ipFormat = isIPv6 ? `[${ipAddress}]` : ipAddress;
      
      // Set Gun peers
      gunOptions.peers = [`http://${ipFormat}:8765/gun`];
      console.log(`Using Gun peer: ${gunOptions.peers[0]}`);
    }
    
    console.log('\nStarting download...');
    
    // Download the file
    await downloadFile(
      fileHash,
      savePath,
      [hostId],
      {
        gunOptions,
        progressCallback: (received: number, total: number) => {
          const percent = Math.round((received / total) * 100);
          process.stdout.write(`\rDownload progress: ${percent}% (${received}/${total} bytes)`);
        }
      }
    );
    
    console.log('\n\nDownload complete!');
    
    // Verify file integrity
    const downloadedHash = await calculateFileHash(savePath);
    if (downloadedHash === fileHash) {
      console.log('✅ File integrity verified - hashes match!');
    } else {
      console.error('❌ File integrity verification failed!');
      console.log(`Expected: ${fileHash}`);
      console.log(`Actual: ${downloadedHash}`);
    }
    
    // Display file contents
    await displayTextFile(savePath);
    
    console.log(`\nFile saved to: ${savePath}`);
    
  } catch (err) {
    console.error('Error in simple client example:', err);
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
} 
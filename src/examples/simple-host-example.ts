/**
 * Simple Host Example
 * 
 * This example creates a simple file with "Hello World" content and serves it.
 * It shows the most basic way to set up a file host.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os'; // For getting network interfaces
import { createHost } from '../index';
import { discoverPublicIPs } from '../lib/utils';

// File paths
const EXAMPLE_DIR = path.join(process.cwd(), 'example-data');
const HELLO_WORLD_FILE_PATH = path.join(EXAMPLE_DIR, 'hello-world.txt');

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
 * Get local IP addresses
 */
function getLocalIPs(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];
  
  for (const [name, netInterface] of Object.entries(interfaces)) {
    if (!netInterface) continue;
    
    for (const iface of netInterface) {
      // Skip internal interfaces
      if (iface.internal) continue;
      
      // Only include IPv4 and IPv6 addresses
      if (iface.family === 'IPv4' || iface.family === 'IPv6') {
        addresses.push(`${iface.family}: ${iface.address}`);
      }
    }
  }
  
  return addresses;
}

/**
 * Main function
 */
async function main() {
  try {
    // Create necessary directories
    await fs.ensureDir(EXAMPLE_DIR);
    
    // Create a simple "Hello World" text file
    console.log('Creating "Hello World" file...');
    const content = 'Hello World! This file was served using dig-nat-tools.';
    await fs.writeFile(HELLO_WORLD_FILE_PATH, content);
    
    // Calculate the hash of the file
    console.log('Calculating file hash...');
    const fileHash = await calculateFileHash(HELLO_WORLD_FILE_PATH);
    console.log(`File hash: ${fileHash}`);
    
    // Start hosting the file
    console.log('Starting host...');
    
    // Create a host with default configuration
    const host = createHost({
      // This callback serves the requested file chunks
      hostFileCallback: async (hash: string, startChunk: number, chunkSize: number) => {
        console.log(`Received request for file ${hash}, chunk ${startChunk}`);
        
        // Only serve the file if the hash matches our Hello World file
        if (hash === fileHash) {
          try {
            // Read the entire file (since it's small)
            const fileContent = await fs.readFile(HELLO_WORLD_FILE_PATH);
            
            // Calculate start position
            const start = startChunk * chunkSize;
            
            // If we're past the end of the file, return null (EOF)
            if (start >= fileContent.length) {
              return null;
            }
            
            // Create a chunk from the file
            const end = Math.min(start + chunkSize, fileContent.length);
            const chunk = fileContent.slice(start, end);
            
            console.log(`Serving ${chunk.length} bytes`);
            return [chunk];
          } catch (err) {
            console.error('Error reading file:', err);
            return null;
          }
        }
        
        console.log('Hash does not match Hello World file');
        return null;
      }
    });
    
    // Start the host
    await host.start();
    
    // Get and display the host ID
    const hostId = host.getHostId();
    
    // Get local IP addresses
    const localIPs = getLocalIPs();
    
    // Try to discover public IP addresses
    console.log('Discovering public IP addresses...');
    let publicIPs: { ipv4?: string, ipv6?: string } = {};
    try {
      publicIPs = await discoverPublicIPs({
        stunServers: ['stun:stun.l.google.com:19302'],
        timeout: 5000
      });
    } catch (err) {
      console.warn('Could not discover public IP addresses:', err);
    }
    
    // Display connection information
    console.log('\n========== CONNECTION INFORMATION ==========');
    console.log('Share this information with the client:');
    console.log(`Host ID: ${hostId}`);
    console.log(`File Hash: ${fileHash}`);
    
    console.log('\nLocal IP Addresses:');
    localIPs.forEach(ip => console.log(`- ${ip}`));
    
    console.log('\nPublic IP Addresses:');
    if (publicIPs.ipv4) console.log(`- IPv4: ${publicIPs.ipv4}`);
    if (publicIPs.ipv6) console.log(`- IPv6: ${publicIPs.ipv6}`);
    if (!publicIPs.ipv4 && !publicIPs.ipv6) console.log('- No public IPs discovered');
    
    console.log('\nFile Information:');
    console.log(`- Path: ${HELLO_WORLD_FILE_PATH}`);
    console.log(`- Content: "${content}"`);
    console.log('===========================================');
    
    console.log('\nHost is running. Press Ctrl+C to stop...');
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nShutting down host...');
      await host.stop();
      console.log('Host stopped.');
      process.exit(0);
    });
    
  } catch (err) {
    console.error('Error in simple host example:', err);
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
} 
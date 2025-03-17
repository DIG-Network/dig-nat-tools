/**
 * Host Example
 * 
 * This example demonstrates how to create and configure a host to serve files
 * using the dig-nat-tools library. The host supports multiple connection types
 * including TCP, UDP, WebRTC, and Gun relay.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { createHost } from '../index';

// Create directories for the example
const EXAMPLE_DIR = path.join(process.cwd(), 'example-data');
const SAMPLE_FILE_PATH = path.join(EXAMPLE_DIR, 'sample-file.dat');

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
 * Main function that runs the host example
 */
async function main() {
  try {
    // Create necessary directories
    await fs.ensureDir(EXAMPLE_DIR);
    
    // Create a sample file if it doesn't exist
    if (!await fs.pathExists(SAMPLE_FILE_PATH)) {
      console.log('Creating sample file...');
      // Create a 10MB random file
      const buffer = crypto.randomBytes(10 * 1024 * 1024);
      await fs.writeFile(SAMPLE_FILE_PATH, buffer);
    }
    
    // Calculate the hash of the sample file
    console.log('Calculating file hash...');
    const sampleFileHash = await calculateFileHash(SAMPLE_FILE_PATH);
    console.log(`Sample file hash: ${sampleFileHash}`);
    
    // Start hosting the file
    console.log('Starting host...');
    
    // Create a host with various configuration options
    const host = createHost({
      // Enable different connection types
      enableTCP: true,
      enableUDP: true,
      enableWebRTC: true,
      enableNATPMP: true, // Use NAT-PMP/PCP for port mapping
      
      // Specify ports (0 means random available port)
      tcpPort: 12345, // Using a fixed port for this example
      udpPort: 12346, // Using a fixed port for this example
      
      // STUN servers for NAT traversal
      stunServers: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302'
      ],
      
      // Port mapping lifetime in seconds (default: 3600 = 1 hour)
      portMappingLifetime: 3600,
      
      // Add a hostFileCallback function that serves the sample file
      // This is called whenever a client requests a chunk of a file
      hostFileCallback: async (hash: string, startChunk: number, chunkSize: number) => {
        console.log(`Received request for file ${hash}, chunk ${startChunk}, size ${chunkSize}`);
        
        // Only serve the file if the hash matches our sample file
        if (hash === sampleFileHash) {
          try {
            // Check if the file exists
            if (!await fs.pathExists(SAMPLE_FILE_PATH)) {
              console.log('File not found');
              return null;
            }
            
            // Get file stats
            const stats = await fs.stat(SAMPLE_FILE_PATH);
            
            // Calculate start position
            const start = startChunk * chunkSize;
            
            // If we're past the end of the file, return null (EOF)
            if (start >= stats.size) {
              console.log('Request beyond end of file');
              return null;
            }
            
            // Read the chunk
            const buffer = Buffer.alloc(chunkSize);
            const fileHandle = await fs.open(SAMPLE_FILE_PATH, 'r');
            const { bytesRead } = await fs.read(fileHandle, buffer, 0, chunkSize, start);
            await fs.close(fileHandle);
            
            // Return data or EOF
            if (bytesRead === 0) {
              console.log('No bytes read');
              return null;
            } else {
              console.log(`Serving ${bytesRead} bytes`);
              return [buffer.slice(0, bytesRead)];
            }
          } catch (err) {
            console.error('Error reading file chunk:', err);
            return null;
          }
        }
        
        console.log('Hash does not match sample file');
        return null;
      }
    });
    
    // Start the host
    await host.start();
    
    // Get and display the host ID and connection options
    const hostId = host.getHostId();
    console.log(`Host started with ID: ${hostId}`);
    
    // Display connection information that clients would need
    console.log('\nConnection Information:');
    console.log('-----------------------');
    console.log(`Host ID: ${hostId}`);
    console.log(`File Hash: ${sampleFileHash}`);
    console.log('\nShare this information with clients to allow them to connect and download the file.');
    
    // Keep the host running until user terminates the program
    console.log('\nHost is running. Press Ctrl+C to stop...');
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nShutting down host...');
      await host.stop();
      console.log('Host stopped.');
      process.exit(0);
    });
    
  } catch (err) {
    console.error('Error in host example:', err);
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
} 
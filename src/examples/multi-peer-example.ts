/**
 * Multi-peer example demonstrating downloading a file from multiple sources
 * 
 * This example sets up multiple hosts and downloads a file using parts from each host,
 * demonstrating the NAT traversal capabilities and multi-source download feature.
 */

import * as digNatTools from '../index';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';

// Create example directories
const EXAMPLE_DIR = path.join(__dirname, 'example-data');
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');

// Ensure directories exist
fs.ensureDirSync(EXAMPLE_DIR);
fs.ensureDirSync(DOWNLOAD_DIR);

// Create a sample file for testing
const SAMPLE_FILE_PATH = path.join(EXAMPLE_DIR, 'large-sample.txt');
const DOWNLOAD_PATH = path.join(DOWNLOAD_DIR, 'downloaded-large-sample.txt');

// Create large sample file if it doesn't exist (10MB)
async function ensureSampleFileExists(): Promise<void> {
  if (!fs.existsSync(SAMPLE_FILE_PATH)) {
    const SAMPLE_SIZE = 10 * 1024 * 1024; // 10MB
    const BLOCK_SIZE = 1024 * 64; // 64KB blocks for efficient writing
    
    console.log(`Creating a ${SAMPLE_SIZE / (1024 * 1024)}MB sample file...`);
    fs.ensureFileSync(SAMPLE_FILE_PATH);
    
    // Create a write stream
    const writeStream = fs.createWriteStream(SAMPLE_FILE_PATH);
    
    // Create random data and write it in blocks
    let bytesWritten = 0;
    
    function writeNextBlock(): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        if (bytesWritten >= SAMPLE_SIZE) {
          writeStream.end(resolve);
          console.log(`Created sample file at ${SAMPLE_FILE_PATH}`);
          return;
        }
        
        // Generate random data for this block
        const blockSize = Math.min(BLOCK_SIZE, SAMPLE_SIZE - bytesWritten);
        const buffer = Buffer.alloc(blockSize);
        
        // Fill with random data
        for (let i = 0; i < blockSize; i++) {
          buffer[i] = Math.floor(Math.random() * 256);
        }
        
        // Write and continue
        writeStream.write(buffer, (err) => {
          if (err) {
            console.error('Error writing to sample file:', err);
            reject(err);
            return;
          }
          
          bytesWritten += blockSize;
          if (bytesWritten % (1024 * 1024) === 0) {
            console.log(`Written ${bytesWritten / (1024 * 1024)}MB...`);
          }
          
          // Schedule next block (without recursion to avoid stack overflow)
          setImmediate(() => {
            writeNextBlock().then(resolve).catch(reject);
          });
        });
      });
    }
    
    // Start writing blocks
    await writeNextBlock();
    
    // Wait for the write to complete
    await new Promise<void>((resolve, reject) => {
      writeStream.on('close', resolve);
      writeStream.on('error', reject);
    });
  }
}

// Calculate SHA-256 hash of a file
function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    stream.on('error', err => reject(err));
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

// Host file callback function
function createHostFileCallback(filePath: string) {
  return async function(sha256: string, startChunk: number, chunkSize: number): Promise<Buffer[] | null> {
    // Verify the requested file hash matches our file
    const fileHash = await calculateFileHash(filePath);
    if (sha256 !== fileHash) {
      console.log(`Hash mismatch: requested ${sha256}, our file is ${fileHash}`);
      return null;
    }
    
    console.log(`Serving chunk ${startChunk} of file ${filePath}`);
    
    // Calculate offset in the file
    const start = startChunk * chunkSize;
    
    try {
      // Get file stats to check size
      const stats = await fs.stat(filePath);
      
      // If we're past the end of the file, return EOF
      if (start >= stats.size) {
        return null;
      }
      
      // Read the chunk from the file
      const fd = await fs.open(filePath, 'r');
      const buffer = Buffer.alloc(chunkSize);
      const { bytesRead } = await fs.read(fd, buffer, 0, chunkSize, start);
      await fs.close(fd);
      
      // Return data or EOF
      if (bytesRead === 0) {
        return null;
      } else if (bytesRead < chunkSize) {
        // Return partial chunk
        return [buffer.slice(0, bytesRead)];
      } else {
        // Return full chunk
        return [buffer];
      }
    } catch (error) {
      console.error(`Error reading file chunk: ${(error as Error).message}`);
      throw error;
    }
  };
}

// Main function
async function main(): Promise<void> {
  try {
    // Ensure sample file exists
    await ensureSampleFileExists();
    
    // Calculate hash of the sample file
    const fileHash = await calculateFileHash(SAMPLE_FILE_PATH);
    console.log(`Sample file hash: ${fileHash}`);
    
    // Basic configuration shared by all hosts
    const baseConfig = {
      chunkSize: 64 * 1024, // 64KB chunks
      stunServers: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302'
      ],
      enableTCP: true,
      enableUDP: true,
      enableWebRTC: true
    };

    // Create multiple hosts (simulating different machines)
    const numHosts = 3;
    const hosts: digNatTools.FileHost[] = [];
    const hostIds: string[] = [];
    
    console.log(`Starting ${numHosts} hosts with different connection preferences...`);
    
    // Define our own HostConfig interface without extending
    interface HostConfig {
      hostFileCallback: (sha256: string, startChunk: number, chunkSize: number) => Promise<Buffer[] | null>;
      chunkSize?: number;
      stunServers?: string[];
      enableTCP?: boolean;
      enableUDP?: boolean;
      enableWebRTC?: boolean;
      tcpPort?: number;
      udpPort?: number;
      preferredConnectionTypes?: string[];
      gunOptions?: any;
    }
    
    for (let i = 0; i < numHosts; i++) {
      // Each host gets slightly different configuration to simulate different network conditions
      const hostConfig: HostConfig = {
        ...baseConfig,
        hostFileCallback: createHostFileCallback(SAMPLE_FILE_PATH),
        // Use different ports for each host
        tcpPort: 8000 + i,
        udpPort: 9000 + i,
        // Simulate different connection preferences
        preferredConnectionTypes: i === 0 ? ['TCP', 'UDP', 'WEBRTC', 'GUN'] :
                                 i === 1 ? ['UDP', 'TCP', 'WEBRTC', 'GUN'] :
                                           ['WEBRTC', 'TCP', 'UDP', 'GUN']
      };
      
      const host = digNatTools.createHost(hostConfig);
      await host.start();
      
      const hostId = host.getHostId();
      console.log(`Host ${i+1} started with ID: ${hostId}`);
      console.log(`Host ${i+1} preferred connection order: ${hostConfig.preferredConnectionTypes!.join(', ')}`);
      
      hosts.push(host);
      hostIds.push(hostId);
    }
    
    // Wait for hosts to register
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Create a network manager for multi-source downloads
    console.log('\nStarting multi-source download...');
    
    const networkManager = digNatTools.createNetworkManager({
      stunServers: baseConfig.stunServers,
      chunkSize: baseConfig.chunkSize
    });
    
    try {
      // Start the download
      const downloadResult = await networkManager.downloadFile(hostIds, fileHash, {
        savePath: DOWNLOAD_PATH,
        onProgress: (receivedBytes, totalBytes) => {
          if (totalBytes) {
            const percent = Math.round((receivedBytes / totalBytes) * 100);
            console.log(`Download progress: ${percent}% (${receivedBytes / (1024 * 1024)} / ${totalBytes / (1024 * 1024)} MB)`);
          } else {
            console.log(`Downloaded ${receivedBytes / (1024 * 1024)} MB so far`);
          }
        },
        onPeerStatus: (peerId, status, bytesFromPeer) => {
          console.log(`Peer ${peerId} status: ${status}. Bytes downloaded from this peer: ${bytesFromPeer / (1024 * 1024)} MB`);
        }
      });
      
      console.log(`\nFile downloaded successfully to: ${downloadResult.path}`);
      console.log(`Download statistics:`);
      for (const [peerId, stats] of Object.entries(downloadResult.peerStats)) {
        console.log(`- Peer ${peerId}: ${stats.bytesDownloaded / (1024 * 1024)} MB, ${stats.chunksDownloaded} chunks, connection type: ${stats.connectionType}`);
      }
      
      // Verify the downloaded file
      const downloadedHash = await calculateFileHash(DOWNLOAD_PATH);
      console.log(`\nDownloaded file hash: ${downloadedHash}`);
      
      if (downloadedHash === fileHash) {
        console.log('File integrity verified: The hashes match!');
      } else {
        console.error('Integrity check failed: The hashes do not match!');
      }
    } catch (error) {
      console.error('Download failed:', (error as Error).message);
    }
    
    // Stop all hosts
    console.log('\nStopping hosts...');
    for (const host of hosts) {
      await host.stop();
    }
    console.log('All hosts stopped');
    
  } catch (error) {
    console.error('Error:', (error as Error).message);
  }
}

// Run the example
main().catch(error => console.error('Unhandled error:', error)); 
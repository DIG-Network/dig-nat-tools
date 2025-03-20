/**
 * Shard Host Example
 * 
 * This example demonstrates how to create a shard host that randomly selects DHT shard prefixes
 * to balance the load across the network.
 * 
 * Usage:
 * 1. Run this example: npm run example:shard-host
 * 2. The host will select random shard prefixes and only handle info hashes that match those prefixes
 */

import { createHost, NODE_TYPE } from '../index';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as crypto from 'crypto';

// Simple file serving callback
async function hostFileCallback(
  sha256: string, 
  startChunk: number, 
  chunkSize: number
): Promise<Buffer[] | null> {
  // In a real implementation, you would serve actual files
  // This is just a mock implementation that creates dummy data
  
  // Create a deterministic chunk of data based on the hash and chunk index
  const hash = crypto.createHash('sha256');
  hash.update(sha256 + startChunk.toString());
  const data = hash.digest();
  
  // Repeat the data to create a chunk of the requested size
  const repeats = Math.ceil(chunkSize / data.length);
  const buffer = Buffer.concat(Array(repeats).fill(data)).slice(0, chunkSize);
  
  console.log(`Serving chunk ${startChunk} of file ${sha256.substring(0, 8)}...`);
  return [buffer];
}

async function main() {
  try {
    // Create a temporary directory to store persistence data
    const tempDir = path.join(process.cwd(), 'temp-shard-host');
    await fs.ensureDir(tempDir);
    
    console.log('Creating shard host with random DHT shard prefixes...');
    
    // Create a shard host with random shard selection
    const host = createHost({
      hostFileCallback,
      nodeType: NODE_TYPE.STANDARD,
      enablePersistence: true,
      persistenceDir: tempDir,
      
      // Enable shard host mode with random shard selection
      isShardHost: true,
      
      // Configure DHT options
      dhtOptions: {
        // Number of shard prefixes to select (default is 3)
        numShardPrefixes: 4,
        
        // Length of each prefix in hex characters (default is 2)
        shardPrefixLength: 2
        
        // Note: shardPrefixes will be automatically generated
        // If you want to specify them manually:
        // shardPrefixes: ['00', '10', '20', '30']
      }
    });
    
    // Start the host
    await host.start();
    
    // Get the selected shard prefixes
    const shardPrefixes = host.getShardPrefixes();
    
    console.log('----------------------------------');
    console.log(`Host started with ID: ${host.getHostId()}`);
    console.log(`TCP Port: ${host.getTcpPort()}, UDP Port: ${host.getUdpPort()}`);
    console.log(`Selected DHT shard prefixes: ${shardPrefixes.join(', ')}`);
    console.log('----------------------------------');
    console.log('This host will only handle info hashes that start with these prefixes:');
    
    // Display information about what this means
    shardPrefixes.forEach(prefix => {
      const totalSpaceSize = Math.pow(16, prefix.length);
      const coveragePercent = (1 / totalSpaceSize) * 100;
      console.log(` - ${prefix}**: Covers ~${coveragePercent.toFixed(2)}% of the DHT space`);
    });
    
    // Calculate the total coverage
    const totalCoverage = (shardPrefixes.length / Math.pow(16, shardPrefixes[0].length)) * 100;
    console.log(`Total DHT space coverage: ~${totalCoverage.toFixed(2)}%`);
    
    console.log('----------------------------------');
    console.log('Press Ctrl+C to stop the host');
    console.log('----------------------------------');
    
    // Wait for process termination
    process.on('SIGINT', async () => {
      console.log('\nStopping host...');
      await host.stop();
      console.log('Host stopped');
      
      // Clean up temp directory
      await fs.remove(tempDir);
      console.log('Temporary files removed');
      
      process.exit(0);
    });
  } catch (error) {
    console.error('Error in main function:', error);
  }
}

// Run the example
main().catch(console.error); 
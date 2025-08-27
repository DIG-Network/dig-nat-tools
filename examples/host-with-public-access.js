/**
 * Example: FileHost with Public IP and UPnP Support
 * 
 * This example demonstrates how the FileHost now:
 * 1. Detects the public IP address
 * 2. Checks if the port is accessible from the internet
 * 3. Attempts UPnP port mapping if needed
 * 4. Only registers directHttp in Gun.js if publicly accessible
 */

import { FileHost, ConnectionMode } from '../dist/index.js';
import fs from 'fs';
import path from 'path';

async function runExample() {
  console.log('🚀 Starting FileHost with public access checking...\n');

  // Create a FileHost instance
  const host = new FileHost({
    port: 18080, // Try to use port 18080
    connectionMode: ConnectionMode.AUTO,
    ttl: 3600, // UPnP mapping TTL: 1 hour
    gun: {
      peers: ['http://nostalgiagame.go.ro:30876/gun'] // Gun.js peer for registry
    }
  });

  try {
    // Start the host - this will now:
    // 1. Start the HTTP server locally
    // 2. Get the public IP
    // 3. Check if port 18080 is accessible from internet
    // 4. Try UPnP if not accessible
    // 5. Only set directHttp.available=true if publicly accessible
    console.log('Starting FileHost...');
    const capabilities = await host.start();

    console.log('\n📊 Host Capabilities:');
    console.log('- Store ID:', capabilities.storeId);
    
    if (capabilities.directHttp?.available) {
      console.log('✅ Direct HTTP available at:', `${capabilities.directHttp.ip}:${capabilities.directHttp.port}`);
    } else {
      console.log('❌ Direct HTTP not available (port not accessible from internet)');
    }
    
    if (capabilities.webTorrent?.available) {
      console.log('✅ WebTorrent available');
    } else {
      console.log('❌ WebTorrent not available');
    }

    // Create a test file
    const testFilePath = 'test-file.txt';
    const testContent = `Hello from FileHost! Generated at ${new Date().toISOString()}`;
    fs.writeFileSync(testFilePath, testContent);

    console.log('\n📤 Sharing test file...');
    const fileHash = await host.shareFile(testFilePath);
    console.log('File hash:', fileHash);

    // Get the file URL
    const fileUrl = await host.getFileUrl(fileHash);
    console.log('File URL:', fileUrl);

    // If directHttp is available, the URL will use the public IP
    // If not, it will be a magnet URI for WebTorrent

    console.log('\n⏳ Host running for 30 seconds...');
    await new Promise(resolve => setTimeout(resolve, 30000));

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    console.log('\n🛑 Stopping host...');
    await host.stop();
    
    // Clean up test file
    try {
      fs.unlinkSync('test-file.txt');
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

// Run the example
runExample().catch(console.error);

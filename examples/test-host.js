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
    storeId: 'test-host-2',
    gun: {
      peers: ['http://nostalgiagame.go.ro:30878/gun'],
      namespace: 'dig-nat-tools-test'
    },
    
    // Custom WebTorrent trackers (optional) - uncomment to use your own tracker
    trackers: [
      'ws://localhost:8000',              // Your custom WebSocket tracker
      'http://localhost:8000/announce',   // Your custom HTTP tracker
      'wss://tracker.openwebtorrent.com',       // Backup reliable tracker
      'udp://tracker.opentrackr.org:1337'       // Backup reliable tracker
    ]
  });

  // Declare testFiles in function scope so it's accessible everywhere
  let testFiles = [];
  let sharedFiles = [];

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

    // Create 10 different test files
    console.log('\n📝 Creating 10 test files...');
    for (let i = 1; i <= 10; i++) {
      const testFilePath = `test-file-${i}.txt`;
      const testContent = `Hello from FileHost! This is file #${i} generated at ${new Date().toISOString()}.\nFile size: ${Math.random().toString(36).repeat(50 + i * 10)}`;
      fs.writeFileSync(testFilePath, testContent);
      testFiles.push(testFilePath);
      console.log(`✅ Created: ${testFilePath} (${testContent.length} bytes)`);
    }

    console.log('\n📤 Sharing all 10 test files...');
    for (const testFilePath of testFiles) {
      const filename = await host.shareFile(testFilePath);
      const fileUrl = await host.getFileUrl(filename);
      sharedFiles.push({ path: testFilePath, filename, url: fileUrl });
      console.log(`📤 Shared: ${filename} -> ${fileUrl}`);
    }

    console.log(`\n✅ Successfully shared ${sharedFiles.length} files!`);

    // If directHttp is available, the URL will use the public IP
    // If not, it will be a magnet URI for WebTorrent

    console.log('\n⏳ Host running indefinitely... Re-announcing file every 5 seconds');
    console.log('Press Ctrl+C to stop\n');

    // Re-announce all files every 5 seconds
    let announceCount = 0;
    // const announceInterval = setInterval(async () => {
    //   try {
    //     announceCount++;
    //     console.log(`📢 Re-announcing ${sharedFiles.length} files #${announceCount} at ${new Date().toLocaleTimeString()}`);
        
    //     // Re-share all files to trigger re-announcement
    //     for (const fileInfo of sharedFiles) {
    //       await host.shareFile(fileInfo.path);
    //     }
    //     console.log(`✅ All ${sharedFiles.length} files re-announced`);
    //   } catch (error) {
    //     console.error('❌ Error re-announcing files:', error.message);
    //   }
    // }, 5000); // Every 5 seconds

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Received interrupt signal, shutting down...');
      clearInterval(announceInterval);
      await host.stop();
      
      // Clean up all test files
      console.log('🧹 Cleaning up test files...');
      for (const testFilePath of testFiles) {
        try {
          fs.unlinkSync(testFilePath);
          console.log(`🗑️ Deleted: ${testFilePath}`);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      process.exit(0);
    });

    // Keep running until interrupted
    await new Promise(() => {}); // Run forever

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    console.log('\n🛑 Stopping host...');
    await host.stop();
    
    // Clean up all test files
    if (testFiles && testFiles.length > 0) {
      console.log('🧹 Cleaning up test files...');
      for (const testFilePath of testFiles) {
        try {
          fs.unlinkSync(testFilePath);
          console.log(`🗑️ Deleted: ${testFilePath}`);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
  }
}

// Run the example
runExample().catch(console.error);

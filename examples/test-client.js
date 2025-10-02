// test-client.js - Start a file client that discovers hosts via Gun.js
import { FileClient } from '../dist/client.js';
import fs from 'fs';

async function startClient() {
  console.log('🔍 Starting test client...');
  
  // Track downloaded files to avoid re-downloading
  const downloadedFiles = new Set();
  const downloadingFiles = new Set();
  
  // Initialize FileClient with Gun.js configuration
  const client = new FileClient({
    peers: ['http://nostalgiagame.go.ro:30878/gun'], // Connect to deployed relay
    namespace: 'dig-nat-tools-test', // Use same namespace as host
    timeout: 600000, // 10 minute timeout (600 seconds) - increased from 5 minutes
    
    // Custom WebTorrent trackers (optional) - replace unreliable public trackers
    trackers: [
      'ws://nostalgiagame.go.ro:8000',        // Your custom WebSocket tracker
      'http://nostalgiagame.go.ro:8000/announce', // Your custom HTTP tracker
      'wss://tracker.openwebtorrent.com', // Reliable public tracker
      'udp://tracker.opentrackr.org:1337' // Reliable public tracker
    ]
  });

  try {
    console.log('🔗 Connecting to Gun.js relay at http://nostalgiagame.go.ro:30878/gun...');
    console.log('📡 Using namespace: dig-nat-tools-test');
    console.log('🔄 Searching for available peers...');
    
    // Add a longer delay to ensure Gun.js connection is established
    console.log('⏳ Waiting 5 seconds for Gun.js connection...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // Increased from 1 second
    
    console.log('🔄 Starting continuous peer discovery and file monitoring...');
    console.log('Press Ctrl+C to stop\n');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Received interrupt signal, shutting down...');
      await client.destroy();
      console.log('🧹 Client cleaned up');
      process.exit(0);
    });

    // Function to check for peers and download files
    const checkPeersAndDownload = async () => {
      console.log(`🔍 Checking for peers at ${new Date().toLocaleTimeString()}...`);
      
      // Find available peers in the Gun.js registry
      const peers = await client.findAvailablePeers();
      console.log(`📊 Found ${peers.length} peer(s)`);
      
      if (peers.length === 0) {
        console.log('⏳ No peers found, waiting for hosts to come online...');
        return;
      }
      
      // Process each peer
      for (const peer of peers) {
        console.log(`🎯 Checking peer: ${peer.storeId}`);
        console.log(`   - Direct HTTP: ${peer.directHttp?.available ? '✅' : '❌'}`);
        console.log(`   - WebTorrent: ${peer.webTorrent?.available ? '✅' : '❌'}`);
        console.log(`   - Last seen: ${peer.lastSeen ? new Date(peer.lastSeen).toLocaleTimeString() : 'unknown'}`);

        // Check peer capabilities for new files
        const capabilities = await client.checkPeerCapabilities(peer.storeId);
        if (!capabilities) {
          console.log(`❌ Could not get capabilities for peer: ${peer.storeId}`);
          continue;
        }

        // Try to download files if the peer has any available
        if (capabilities.directHttp?.available) {
          console.log(`🌐 Direct HTTP available at ${capabilities.directHttp.ip}:${capabilities.directHttp.port}`);
        } else {
          console.log(`❌ Direct HTTP not available for peer: ${peer.storeId}`);
        }

        // Check if there are any magnet URIs to extract filenames from
        if (capabilities.webTorrent?.magnetUris && capabilities.webTorrent.magnetUris.length > 0) {
          for (const magnetUri of capabilities.webTorrent.magnetUris) {
            console.log('🧲 Found magnet URI:', magnetUri);
            
            // Extract filename from the magnet URI filename (dn parameter)
            const dnMatch = magnetUri.match(/dn=([^&]+)/);
            if (dnMatch) {
              const filename = decodeURIComponent(dnMatch[1]);
              
              // Check if we've already downloaded or are currently downloading this file
              if (downloadedFiles.has(filename)) {
                console.log(`⏭️ Skipping file ${filename}... (already downloaded)`);
                continue;
              }
              
              if (downloadingFiles.has(filename)) {
                console.log(`⏭️ Skipping file ${filename}... (currently downloading)`);
                continue;
              }
              
              console.log(`📥 Attempting to download file: ${filename}...`);
              
              // Mark as downloading to prevent concurrent downloads
              downloadingFiles.add(filename);
              
              try {
                // Use the client's downloadFile method
                const fileData = await client.downloadFile(capabilities.storeId, filename);
                console.log(`✅ Successfully downloaded file! Size: ${fileData.length} bytes`);
                
                // Save the file locally
                const outputPath = `downloaded-${filename}`;
                fs.writeFileSync(outputPath, fileData);
                console.log(`💾 File saved as: ${outputPath}`);
                
                // Mark as completed
                downloadedFiles.add(filename);
                downloadingFiles.delete(filename);
                
                // If it appears to be text, show a preview
                const fileContent = fileData.toString('utf8');
                if (fileData.length < 1000 && /^[\x20-\x7E\s]*$/.test(fileContent)) {
                  console.log('📄 File content preview:');
                  console.log('─'.repeat(50));
                  console.log(fileContent);
                  console.log('─'.repeat(50));
                } else {
                  console.log('📄 File appears to be binary data');
                }
                
              } catch (error) {
                console.error(`❌ Failed to download file: ${error.message}`);
                // Remove from downloading set on failure
                downloadingFiles.delete(filename);
              }
            } else {
              console.log('⚠️ Could not extract filename from magnet URI');
            }
          }
        } else {
          console.log('📭 No files available for download from this peer');
        }
      }
      
      // Show status after each check
      console.log(`📊 Status: ${downloadedFiles.size} files completed, ${downloadingFiles.size} files in progress\n`);
    };

    // Run initial check
    await checkPeersAndDownload();

    // Check for peers and new files every 10 seconds
    const checkInterval = setInterval(async () => {
      try {
        await checkPeersAndDownload();
      } catch (error) {
        console.error('❌ Error during peer check:', error.message);
      }
    }, 10000); // Every 10 seconds

    // Keep running until interrupted
    await new Promise(() => {}); // Run forever
    
  } catch (error) {
    console.error('❌ Error in client:', error);
  } finally {
    // Clean up
    await client.destroy();
    console.log('🧹 Client cleaned up');
  }
}

startClient().catch(console.error);

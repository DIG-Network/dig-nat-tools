// test-client.js - Start a file client that discovers hosts via Gun.js
import { FileClient } from '../dist/client.js';
import fs from 'fs';

async function startClient() {
  console.log('🔍 Starting test client...');
  
  // Initialize FileClient with Gun.js configuration
  const client = new FileClient({
    peers: ['http://nostalgiagame.go.ro:30876/gun'], // Connect to deployed relay
    namespace: 'dig-nat-tools-test', // Use same namespace as host
    timeout: 30000 // 30 second timeout
  });

  try {
    console.log('🔗 Connecting to Gun.js relay at http://nostalgiagame.go.ro:30876/gun...');
    console.log('📡 Using namespace: dig-nat-tools-test');
    console.log('🔄 Searching for available peers...');
    
    // Add a small delay to ensure Gun.js connection is established
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Find available peers in the Gun.js registry
    const peers = await client.findAvailablePeers();
    console.log(`� Search completed. Found ${peers.length} peer(s)`);
    
    if (peers.length > 0) {
      console.log('🎯 Peer details:', peers.map(p => ({
        storeId: p.storeId,
        directHttp: p.directHttp?.available || false,
        webTorrent: p.webTorrent?.available || false,
        lastSeen: p.lastSeen ? new Date(p.lastSeen).toLocaleTimeString() : 'unknown'
      })));
    }
    
    if (peers.length === 0) {
      console.log('❌ No peers found. Possible issues:');
      console.log('   1. Host is not running');
      console.log('   2. Host failed to register with Gun.js relay');
      console.log('   3. Gun.js relay is not accessible');
      console.log('   4. Namespace mismatch between host and client');
      console.log('   5. Timing issue - try waiting longer after starting host');
      return;
    }
    
    // Try to connect to the first peer
    const targetPeer = peers[0];
    console.log(`🎯 Connecting to peer: ${targetPeer.storeId}`);
    
    // Check peer capabilities
    const capabilities = await client.checkPeerCapabilities(targetPeer.storeId);
    if (capabilities) {
      console.log('✅ Peer capabilities:', {
        storeId: capabilities.storeId,
        directHttp: capabilities.directHttp?.available || false,
        webTorrent: capabilities.webTorrent?.available || false
      });
      
      // Try to download a file if the peer has any available
      if (capabilities.directHttp?.available) {
        console.log(`🌐 Direct HTTP available at ${capabilities.directHttp.ip}:${capabilities.directHttp.port}`);
        
        // Check if there are any magnet URIs to extract file hashes from
        if (capabilities.webTorrent?.magnetUris && capabilities.webTorrent.magnetUris.length > 0) {
          const magnetUri = capabilities.webTorrent.magnetUris[0];
          console.log('🧲 Found magnet URI:', magnetUri);
          
          // Extract file hash from the magnet URI filename (dn parameter)
          const dnMatch = magnetUri.match(/dn=([^&]+)/);
          if (dnMatch) {
            const fileHash = decodeURIComponent(dnMatch[1]);
            console.log(`📥 Attempting to download file with hash: ${fileHash}`);
            
            try {
              // Use the client's downloadFile method which will prefer direct HTTP
              const fileData = await client.downloadFile(capabilities.storeId, fileHash);
              console.log(`✅ Successfully downloaded file! Size: ${fileData.length} bytes`);
              
              // Save the file locally
              const outputPath = `downloaded-${fileHash.substring(0, 8)}.bin`;
              fs.writeFileSync(outputPath, fileData);
              console.log(`💾 File saved as: ${outputPath}`);
              
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
            }
          } else {
            console.log('⚠️ Could not extract file hash from magnet URI');
          }
        } else {
          console.log('📭 No files available for download');
        }
      } else {
        console.log(`❌ Direct HTTP not available`);
        // Check if there are any magnet URIs to extract file hashes from
        if (capabilities.webTorrent?.magnetUris && capabilities.webTorrent.magnetUris.length > 0) {
          const magnetUri = capabilities.webTorrent.magnetUris[0];
          console.log('🧲 Found magnet URI:', magnetUri);
          
          // Extract file hash from the magnet URI filename (dn parameter)
          const dnMatch = magnetUri.match(/dn=([^&]+)/);
          if (dnMatch) {
            const fileHash = decodeURIComponent(dnMatch[1]);
            console.log(`📥 Attempting to download file with hash: ${fileHash}`);
            
            try {
              // Use the client's downloadFile method which will prefer direct HTTP
              const fileData = await client.downloadFile(capabilities.storeId, fileHash);
              console.log(`✅ Successfully downloaded file! Size: ${fileData.length} bytes`);
              
              // Save the file locally
              const outputPath = `downloaded-${fileHash.substring(0, 8)}.bin`;
              fs.writeFileSync(outputPath, fileData);
              console.log(`💾 File saved as: ${outputPath}`);
              
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
            }
          } else {
            console.log('⚠️ Could not extract file hash from magnet URI');
          }
        } else {
          console.log('📭 No files available for download');
        }
      }
      
      console.log('✅ Successfully connected to peer via Gun.js!');
      console.log('🎉 Gun.js connectivity test passed!');
      
    } else {
      console.log('❌ Could not get peer capabilities');
    }
    
  } catch (error) {
    console.error('❌ Error in client:', error);
  } finally {
    // Clean up
    await client.destroy();
    console.log('🧹 Client cleaned up');
  }
}

startClient().catch(console.error);

// test-download.js - Test downloading a file from a host
import { FileClient } from '../dist/client.js';
import fs from 'fs';

async function testDownload() {
  console.log('📥 Starting download test...');
  
  const client = new FileClient({
    peers: ['http://localhost:8765/gun'],
    namespace: 'dig-nat-tools-test',
    timeout: 30000
  });

  try {
    // Find available peers
    console.log('🔍 Looking for peers with shared files...');
    const peers = await client.findAvailablePeers();
    
    if (peers.length === 0) {
      console.log('❌ No peers found. Make sure the host is running!');
      return;
    }

    const peer = peers[0];
    console.log(`🎯 Found peer: ${peer.storeId}`);
    
    // For this test, we need to manually specify a file hash
    // In practice, you'd get this from the peer's shared files list
    console.log('💡 Note: In a real scenario, you would get the file hash from the peer.');
    console.log('💡 For this test, check the host output for the file hash and use it here.');
    
    // Example of how you would download a file if you had the hash:
    // const fileHash = 'YOUR_FILE_HASH_HERE';
    // const fileBuffer = await client.downloadFile(peer.storeId, fileHash);
    // fs.writeFileSync('downloaded-file.txt', fileBuffer);
    // console.log('✅ File downloaded successfully!');
    
    console.log('✅ Download test setup complete. Update this script with a real file hash to test downloading.');
    
  } catch (error) {
    console.error('❌ Error in download test:', error);
  } finally {
    await client.destroy();
  }
}

testDownload().catch(console.error);

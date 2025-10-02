// test-with-custom-tracker.js - Example showing how to use custom tracker
import { FileHost, ConnectionMode } from '../dist/index.js';
import { FileClient } from '../dist/client.js';

// Configuration - update these with your tracker server details
const CUSTOM_TRACKER_HOST = 'localhost'; // Change to your server IP
const CUSTOM_TRACKER_PORT = '8000';

const customTrackers = [
  `ws://${CUSTOM_TRACKER_HOST}:${CUSTOM_TRACKER_PORT}`,        // WebSocket tracker
  `http://${CUSTOM_TRACKER_HOST}:${CUSTOM_TRACKER_PORT}/announce`, // HTTP tracker
];

console.log('🧪 Testing with custom WebTorrent tracker...');
console.log('📍 Custom trackers:', customTrackers);
console.log('');

async function testCustomTracker() {
  // Test 1: Create host with custom tracker
  console.log('🚀 Step 1: Creating host with custom tracker...');
  const host = new FileHost({
    connectionMode: ConnectionMode.WEBTORRENT_ONLY,
    storeId: 'custom-tracker-test-host',
    gun: {
      peers: ['http://nostalgiagame.go.ro:30878/gun'],
      namespace: 'custom-tracker-test'
    },
    trackers: customTrackers // Use custom tracker
  });

  try {
    await host.start();
    console.log('✅ Host started with custom tracker');

    // Create a simple test file
    import('fs').then(async (fs) => {
      const testFile = 'custom-tracker-test-file.txt';
      const testContent = `Hello from custom tracker test! Generated at ${new Date().toISOString()}`;
      
      fs.writeFileSync(testFile, testContent);
      console.log(`📝 Created test file: ${testFile}`);

      // Share the file (should use custom tracker)
      const filename = await host.shareFile(testFile);
      const fileUrl = await host.getFileUrl(filename);
      console.log(`📤 Shared file: ${filename}`);
      console.log(`🧲 Magnet URI: ${fileUrl}`);
      console.log('');
      console.log('🔍 Check your tracker server logs to see the activity!');
      console.log('💡 The tracker should show peer registration and torrent info');
      console.log('');

      // Test 2: Create client with same custom tracker
      console.log('🚀 Step 2: Creating client with custom tracker...');
      const client = new FileClient({
        peers: ['http://nostalgiagame.go.ro:30878/gun'],
        namespace: 'custom-tracker-test',
        trackers: customTrackers // Use same custom tracker
      });

      // Wait a moment for the host to register
      setTimeout(async () => {
        try {
          console.log('🔍 Looking for peers...');
          const peers = await client.findAvailablePeers();
          console.log(`📊 Found ${peers.length} peer(s)`);

          if (peers.length > 0) {
            const peer = peers[0];
            console.log(`🎯 Found peer: ${peer.storeId}`);
            
            if (peer.webTorrent?.magnetUris?.length) {
              console.log(`📥 Attempting download via custom tracker...`);
              const fileData = await client.downloadFile(peer.storeId, filename);
              console.log(`✅ Downloaded ${fileData.length} bytes via custom tracker!`);
              console.log(`📄 Content: ${fileData.toString()}`);
            }
          }
        } catch (error) {
          console.error('❌ Client test failed:', error.message);
        } finally {
          await client.destroy();
          console.log('🧹 Client cleaned up');
        }
      }, 3000);

      // Cleanup after 10 seconds
      setTimeout(async () => {
        console.log('\n🛑 Test complete, cleaning up...');
        await host.stop();
        try {
          fs.unlinkSync(testFile);
          console.log(`🗑️ Deleted test file: ${testFile}`);
        } catch (e) {
          // Ignore cleanup errors
        }
        console.log('✅ Test finished');
        process.exit(0);
      }, 10000);

    });

  } catch (error) {
    console.error('❌ Host failed to start:', error.message);
    console.log('');
    console.log('💡 Make sure your custom tracker is running:');
    console.log(`   node examples/tracker-server.js`);
    console.log('');
    console.log('🔧 Or test without custom tracker by commenting out the trackers option');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Test interrupted');
  process.exit(0);
});

testCustomTracker().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
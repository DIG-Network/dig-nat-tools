// test-host.js - Start a file host that registers with Gun.js
import { FileHost } from '../dist/host.js';
import fs from 'fs';
import path from 'path';

async function startHost() {
  console.log('🚀 Starting test host...');
  
  // Create a test file to share
  const testFilePath = 'test-shared-file.txt';
  const testContent = 'Hello from the file host! This is a test file being shared via the dig-nat-tools library.';
  
  if (!fs.existsSync(testFilePath)) {
    fs.writeFileSync(testFilePath, testContent);
    console.log(`📄 Created test file: ${testFilePath}`);
  }

  // Initialize FileHost with Gun.js configuration
  const host = new FileHost({
    port: 3001, // Use a specific port for testing
    connectionMode: 'auto', // Try both HTTP and WebTorrent
    storeId: 'test-host-1', // Give it a unique ID
    gun: {
      peers: ['http://nostalgiagame.go.ro:30876/gun'], // Connect to deployed relay
      namespace: 'dig-nat-tools-test' // Use test namespace
    }
  });

  try {
    // Start the host
    console.log('🔗 Attempting to connect to Gun.js relay...');
    const capabilities = await host.start();
    console.log('✅ Host started with capabilities:', JSON.stringify(capabilities, null, 2));

    // Share the test file (this will also handle WebTorrent seeding and registry updates)
    console.log('📤 Sharing test file...');
    const fileHash = await host.shareFile(testFilePath);
    console.log(`🔑 File shared with hash: ${fileHash}`);
    
    // Get the URL for downloading the file
    const fileUrl = await host.getFileUrl(fileHash);
    console.log(`🌐 File URL: ${fileUrl}`);
    
    console.log('\n📋 Host Summary:');
    console.log(`Store ID: ${capabilities.storeId}`);
    console.log(`Direct HTTP: ${capabilities.directHttp?.available ? `✅ ${capabilities.directHttp.ip}:${capabilities.directHttp.port}` : '❌'}`);
    console.log(`WebTorrent: ${capabilities.webTorrent?.available ? '✅' : '❌'}`);
    console.log(`Shared files: ${host.getSharedFiles().length}`);
    console.log(`Magnet URIs: ${host.getMagnetUris().length}`);
    
    console.log('\n🔄 Host is running with full WebTorrent initialization...');
    console.log('💡 WebTorrent is now properly initialized and registered with Gun.js');
    console.log('🔍 Testing registration status...');
    
    // Test if we can find ourselves in the registry (self-test)
    setTimeout(async () => {
      try {
        console.log('🧪 Self-test: Checking if host can find itself in Gun.js registry...');
        // We'll use a simple Gun.js check here
        const Gun = (await import('gun')).default;
        const testGun = Gun(['http://nostalgiagame.go.ro:30876/gun']);
        
        // Try to read our own registration
        testGun.get('dig-nat-tools-test').get('hosts').get('test-host-1').once((data) => {
          if (data && data.storeId) {
            console.log('✅ SUCCESS: Host found itself in Gun.js registry!', data);
            console.log('🎉 Registration is working - client should be able to discover this host');
            console.log(`🧲 Magnet URIs in registry: ${data.webTorrent_magnetUris || 'none yet'}`);
          } else {
            console.log('❌ WARNING: Host could not find itself in Gun.js registry');
            console.log('🔧 This might indicate a registration problem');
          }
        });
      } catch (error) {
        console.error('❌ Self-test failed:', error);
      }
    }, 2000); // Wait 2 seconds for WebTorrent seeding to complete
    
    console.log('Press Ctrl+C to stop');
    
    // Keep the process alive
    process.on('SIGINT', async () => {
      console.log('\n🛑 Stopping host...');
      await host.stop();
      // Clean up test file
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
        console.log('🗑️ Cleaned up test file');
      }
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Error starting host:', error);
    process.exit(1);
  }
}

startHost().catch(console.error);

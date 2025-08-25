// test-client.js - Start a file client that discovers hosts via Gun.js
import { FileClient } from '../dist/client.js';
import fs from 'fs';

async function startClient() {
  console.log('🔍 Starting test client...');
  
  // Initialize FileClient with Gun.js configuration
  const client = new FileClient({
    peers: ['http://localhost:8765/gun'], // Connect to our local relay
    namespace: 'dig-nat-tools-test', // Use same namespace as host
    timeout: 30000 // 30 second timeout
  });

  try {
    console.log('� Connecting to Gun.js relay at http://localhost:8765/gun...');
    console.log('📡 Using namespace: dig-nat-tools-test');
    console.log('�🔄 Searching for available peers...');
    
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
    } else {
      console.log('🔍 Detailed debugging - manually checking Gun.js registry...');
      
      // Manual check using Gun.js directly
      const Gun = (await import('gun')).default;
      const debugGun = Gun(['http://localhost:8765/gun']);
      
      console.log('🧪 Direct Gun.js registry check...');
      debugGun.get('dig-nat-tools-test').get('hosts').once((data) => {
        console.log('📋 Raw registry data:', data);
        if (data) {
          const hosts = Object.keys(data).filter(key => key !== '_');
          console.log(`🔢 Found ${hosts.length} entries in registry:`, hosts);
          hosts.forEach(hostKey => {
            console.log(`   - ${hostKey}:`, data[hostKey]);
          });
        } else {
          console.log('❌ No data found in Gun.js registry at dig-nat-tools-test/hosts');
        }
      });
      
      // Wait a bit for the debug check
      await new Promise(resolve => setTimeout(resolve, 2000));
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
      
      // If the peer has shared files, try to download one
      // Note: In a real scenario, you'd get the file hash from the peer somehow
      // For this test, we'll just demonstrate the client connecting
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

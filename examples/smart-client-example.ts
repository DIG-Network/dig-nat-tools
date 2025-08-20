/**
 * Smart FileClient Example - Demonstrates intelligent connection method selection
 */

import { FileClient, FileHost, ConnectionMode } from '../src/index';
import * as fs from 'fs';
import * as path from 'path';

async function main(): Promise<void> {
  console.log('=== Smart FileClient Example ===\n');

  // Initialize Gun.js registry options
  const gunOptions = {
    peers: ['http://localhost:8765/gun'],
    namespace: 'smart-client-demo'
  };

  // Create a smart client that can auto-discover and connect to peers
  const client = new FileClient({
    peers: gunOptions.peers,
    namespace: gunOptions.namespace,
    timeout: 30000
  });

  // Set up a WebRTC host for demonstration
  const webrtcHost = new FileHost({
    port: 3001,
    connectionMode: ConnectionMode.WEBRTC,
    storeId: 'demo-webrtc-host',
    gun: gunOptions
  });

  try {
    console.log('Starting WebRTC host...');
    const capabilities = await webrtcHost.start();
    console.log('Host started with capabilities:', capabilities);

    // Share a file
    const testFile = path.join(__dirname, '..', 'README.md');
    if (fs.existsSync(testFile)) {
      const fileHash = await webrtcHost.shareFile(testFile);
      console.log(`\nShared file with hash: ${fileHash}`);

      // Wait a moment for registration to propagate
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log('\n=== Testing Smart Client Connection Methods ===');

      // Method 1: Auto-discovery by storeId (recommended)
      try {
        console.log('\n1. Testing auto-discovery download by storeId...');
        const buffer = await client.downloadFile('demo-webrtc-host', fileHash);
        console.log(`✅ Downloaded ${buffer.length} bytes via auto-discovery`);
      } catch (error) {
        console.log(`❌ Auto-discovery failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Method 2: WebRTC URL download (traditional)
      try {
        console.log('\n2. Testing WebRTC URL download...');
        const webrtcUrl = `webrtc://demo-webrtc-host/files/${fileHash}`;
        const buffer = await client.downloadAsBuffer(webrtcUrl);
        console.log(`✅ Downloaded ${buffer.length} bytes via WebRTC URL`);
      } catch (error) {
        console.log(`❌ WebRTC URL download failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Method 3: Check peer capabilities
      console.log('\n3. Checking peer capabilities...');
      const peerCaps = await client.checkPeerCapabilities('demo-webrtc-host');
      if (peerCaps) {
        console.log('Peer capabilities:', JSON.stringify(peerCaps, null, 2));
      } else {
        console.log('Peer not found in registry');
      }

      // Method 4: List all available peers
      console.log('\n4. Finding all available peers...');
      const peers = await client.findAvailablePeers();
      console.log(`Found ${peers.length} peers:`, peers.map(p => p.storeId));

    } else {
      console.log('README.md not found, skipping file sharing demo');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    console.log('\nStopping host...');
    await webrtcHost.stop();
    console.log('Example completed!');
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  process.exit(0);
});

if (require.main === module) {
  main().catch(console.error);
}

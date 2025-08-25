// Example showing both connection modes
import { FileHost, ConnectionMode } from '../src/index';

async function demonstrateConnectionModes(): Promise<void> {
  console.log('🔌 Connection Mode Examples\n');

  // Example 1: Auto Mode (Default)
  console.log('1️⃣ Auto Mode (Default)');
  const autoHost = new FileHost({ 
    port: 3001,
    connectionMode: ConnectionMode.AUTO // or omit for default
  });
  
  console.log('   ✓ Tries HTTP first, then WebTorrent');
  console.log('   ✓ Best compatibility across networks');
  console.log('   ✓ Recommended for general use\n');

  // Example 2: HTTP Only Mode
  console.log('2️⃣ HTTP Only Mode (Manual Port Forwarding Required)');
  const httpHost = new FileHost({ 
    port: 3002,
    connectionMode: ConnectionMode.HTTP_ONLY
  });
  
  console.log('   ✓ HTTP server only - fastest for local network');
  console.log('   ✓ Uses local IP address directly');
  console.log('   ✓ Requires manual port forwarding for external access\n');

  // Example 3: WebTorrent Only Mode
  console.log('3️⃣ WebTorrent Only Mode (P2P Only)');
  const webTorrentHost = new FileHost({ 
    connectionMode: ConnectionMode.WEBTORRENT_ONLY,
    gun: {
      peers: ['http://localhost:8765/gun'],
      namespace: 'dig-nat-tools'
    }
  });
  
  console.log('   ✓ Pure P2P file sharing via WebTorrent');
  console.log('   ✓ Works across NATs without port forwarding');
  console.log('   ✓ Best for maximum privacy and decentralization\n');

  // Demonstrate usage
  console.log('🚀 Starting servers...\n');

  try {
    // Start Auto server
    console.log('Starting Auto server...');
    const autoResult = await autoHost.start();
    console.log(`Auto server capabilities:`, autoResult);

    // Start HTTP-only server
    console.log('Starting HTTP-only server...');
    const httpResult = await httpHost.start();
    console.log(`HTTP server capabilities:`, httpResult);

    console.log('\n✅ Servers started successfully!');
    console.log('🔗 Use the returned capabilities to connect from clients');
    
    // Stop the servers
    await autoHost.stop();
    await httpHost.stop();
    console.log('🛑 Servers stopped');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the demonstration
if (require.main === module) {
  demonstrateConnectionModes().catch(console.error);
}

export { demonstrateConnectionModes };

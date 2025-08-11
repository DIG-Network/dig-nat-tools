// Example showing all three connection modes
import { FileHost, ConnectionMode } from '../src/index';

async function demonstrateConnectionModes(): Promise<void> {
  console.log('🔌 Connection Mode Examples\n');

  // Example 1: UPnP Mode (Default)
  console.log('1️⃣ UPnP Mode (Default)');
  const upnpHost = new FileHost({ 
    port: 3001,
    connectionMode: ConnectionMode.UPNP // or omit for default
  });
  
  console.log('   ✓ Uses UPnP for automatic port forwarding');
  console.log('   ✓ Works with most home routers');
  console.log('   ✓ Best for general use\n');

  // Example 2: NAT-PMP Mode
  console.log('2️⃣ NAT-PMP Mode');
  const natPmpHost = new FileHost({ 
    port: 3002,
    connectionMode: ConnectionMode.NAT_PMP
  });
  
  console.log('   ✓ Uses NAT-PMP protocol (Apple routers)');
  console.log('   ✓ Faster than UPnP, lighter weight');
  console.log('   ✓ Automatically falls back to UPnP if NAT-PMP fails\n');

  // Example 3: Plain Mode
  console.log('3️⃣ Plain Mode (Local Network Only)');
  const plainHost = new FileHost({ 
    port: 3003,
    connectionMode: ConnectionMode.PLAIN
  });
  
  console.log('   ✓ No NAT traversal - fastest startup');
  console.log('   ✓ Uses local IP address directly');
  console.log('   ✓ Requires manual port forwarding for external access\n');

  // Demonstrate usage
  console.log('🚀 Starting servers...\n');

  try {
    // Start UPnP server
    console.log('Starting UPnP server...');
    // const upnpResult = await upnpHost.start();
    // console.log(`UPnP server: ${upnpResult.externalIp}:${upnpResult.port}`);

    // Start NAT-PMP server  
    console.log('Starting NAT-PMP server...');
    // const natPmpResult = await natPmpHost.start();
    // console.log(`NAT-PMP server: ${natPmpResult.externalIp}:${natPmpResult.port}`);

    // Start Plain server
    console.log('Starting Plain server...');
    const plainResult = await plainHost.start();
    console.log(`Plain server: ${plainResult.externalIp}:${plainResult.port}`);

    console.log('\n✅ Plain server started successfully!');
    console.log('🔗 This server is accessible within your local network only');
    
    // Stop the server
    await plainHost.stop();
    console.log('🛑 Server stopped');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the demonstration
if (require.main === module) {
  demonstrateConnectionModes().catch(console.error);
}

export { demonstrateConnectionModes };

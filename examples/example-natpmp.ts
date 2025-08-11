// example-natpmp.ts
import { FileHost } from '../src/host';

async function demonstrateNatPmp(): Promise<void> {
  console.log('=== NAT-PMP File Host Example ===\n');

  // Create a FileHost instance with NAT-PMP enabled
  const fileHost = new FileHost({
    port: 3000,
    ttl: 3600,        // 1 hour port mapping
    useNatPmp: true   // Enable NAT-PMP instead of UPnP
  });

  try {
    console.log('Starting file host with NAT-PMP...');
    const result = await fileHost.start();
    
    console.log(`\n✅ Server started successfully!`);
    console.log(`📡 External IP: ${result.externalIp}`);
    console.log(`🚪 Port: ${result.port}`);
    console.log(`🌐 Base URL: http://${result.externalIp}:${result.port}`);
    
    // Share a test file (if it exists)
    try {
      const fileId = fileHost.shareFile('./README.md');
      const fileUrl = await fileHost.getFileUrl(fileId);
      
      console.log(`\n📄 Shared file: README.md`);
      console.log(`🔗 Download URL: ${fileUrl}`);
      console.log(`🆔 File ID: ${fileId}`);
    } catch {
      console.log('\n📄 No README.md found to share');
    }
    
    // Show server status
    const sharedFiles = fileHost.getSharedFiles();
    console.log(`\n📊 Status: ${sharedFiles.length} file(s) shared`);
    
    // Stop the server after 10 seconds
    setTimeout(async () => {
      console.log('\n🛑 Stopping server...');
      await fileHost.stop();
      console.log('✅ Server stopped successfully');
    }, 10000);
    
  } catch (error: unknown) {
    const err = error as Error;
    console.error('❌ Error:', err.message);
    
    if (err.message.includes('Cascading network topology detected')) {
      console.log('\n💡 Tip: This error occurs when your device is behind multiple routers/access points.');
      console.log('   Try connecting directly to your main router or disable cascaded networking.');
    } else if (err.message.includes('NAT-PMP')) {
      console.log('\n💡 Tip: NAT-PMP might not be supported by your router.');
      console.log('   Try using UPnP instead by setting useNatPmp: false');
    }
  }
}

// Demonstrate fallback from NAT-PMP to UPnP
async function demonstrateFallback(): Promise<void> {
  console.log('\n=== NAT-PMP with UPnP Fallback Example ===\n');

  const fileHost = new FileHost({
    port: 3001,
    useNatPmp: true  // Will fallback to UPnP if NAT-PMP fails
  });

  try {
    console.log('Starting with NAT-PMP (will fallback to UPnP if needed)...');
    const result = await fileHost.start();
    
    console.log(`✅ Server started on ${result.externalIp}:${result.port}`);
    
    setTimeout(async () => {
      await fileHost.stop();
      console.log('✅ Fallback demo completed');
    }, 5000);
    
  } catch (error: unknown) {
    const err = error as Error;
    console.error('❌ Fallback demo error:', err.message);
  }
}

// Run the examples
if (require.main === module) {
  demonstrateNatPmp()
    .then(() => demonstrateFallback())
    .catch(console.error);
}

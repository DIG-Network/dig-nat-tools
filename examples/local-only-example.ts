// Example of using plain connection mode for local network only
import { FileHost, ConnectionMode } from '../src/index';
import * as path from 'path';

async function startLocalOnlyHost(): Promise<void> {
  console.log('Starting local-only file host...');
  
  // Create host with plain connection mode
  // This skips all UPnP/NAT-PMP port forwarding and uses local IP only
  const host = new FileHost({ 
    port: 3000,
    connectionMode: ConnectionMode.PLAIN 
  });

  try {
    // Start the server - this will be much faster since it skips NAT protocols
    const { externalIp, port } = await host.start();
    console.log(`✅ Server running locally at: http://${externalIp}:${port}`);
    console.log('⚠️  Note: This server is only accessible within your local network');
    console.log('   Make sure to manually forward port 3000 if external access is needed');

    // Share some example files
    const testFilePath = path.join(__dirname, '../README.md');
    const fileHash = await host.shareFile(testFilePath);
    
    console.log(`📁 Shared file: ${testFilePath}`);
    const fileUrl = await host.getFileUrl(fileHash);
    console.log(`🔗 Access URL: ${fileUrl}`);

    // List all shared files
    const sharedFiles = host.getSharedFiles();
    console.log('📋 All shared files:', sharedFiles);

    // Keep the server running for demonstration
    console.log('\n💡 Use cases for plain connection mode:');
    console.log('   • Local network file sharing');
    console.log('   • When ports are already manually forwarded');
    console.log('   • Development and testing');
    console.log('   • When NAT traversal is problematic');
    
    console.log('\nPress Ctrl+C to stop the server...');
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down server...');
      await host.stop();
      console.log('✅ Server stopped successfully');
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Run the example
if (require.main === module) {
  startLocalOnlyHost().catch(console.error);
}

export { startLocalOnlyHost };

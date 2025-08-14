import { FileHost, FileClient } from '../src';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// This example demonstrates a simple file sharing scenario

async function main(): Promise<void> {
  // Create a temporary file to share
  const tempFilePath = path.join(__dirname, 'temp-file.txt');
  fs.writeFileSync(tempFilePath, 'This is a test file for P2P file sharing!');
  console.log(`Created test file at: ${tempFilePath}`);

  // Create a host instance
  const host = new FileHost({ port: 30780 });
  console.log('Created file host');

  try {
    // Start the host
    const { externalIp, port } = await host.start();
    console.log(`Host started with external access at: http://${externalIp}:${port}`);

    // Share the test file
    const fileHash = await host.shareFile(tempFilePath);
    console.log(`File shared with SHA256 hash: ${fileHash}`);

    // Get the public URL for the file (this would be shared with remote peers)
    const fileUrl = await host.getFileUrl(fileHash);
    console.log(`File available externally at: ${fileUrl}`);

    // For local testing, construct a local IP URL to simulate local network access
    // In a real scenario, local clients would connect directly via local IP for better performance
    const interfaces = os.networkInterfaces();
    let localIp = 'localhost';
    
    // Find the local IP address
    for (const name of Object.keys(interfaces)) {
      if (name.toLowerCase().includes('wi-fi') || name.toLowerCase().includes('ethernet')) {
        for (const iface of interfaces[name]!) {
          if (iface.family === 'IPv4' && !iface.internal) {
            localIp = iface.address;
            break;
          }
        }
      }
    }
    
    const localFileUrl = `http://${localIp}:${port}/files/${fileHash}`;
    console.log(`File available locally at: ${localFileUrl}`);

    // Download the file using the local URL (simulating a local peer connection)
    console.log('Downloading the shared file via local network...');
    const buffer = await FileClient.downloadAsBufferStatic(localFileUrl, {
      onProgress: (downloaded: number, total: number) => {
        const percent = Math.round((downloaded / total) * 100);
        console.log(`Download progress: ${percent}%`);
      }
    });

    // Verify the download
    console.log(`Downloaded ${buffer.length} bytes`);
    console.log(`File content: ${buffer.toString()}`);

    console.log('\n--- Summary ---');
    console.log(`External URL (for remote peers): ${fileUrl}`);
    console.log(`Local URL (for local network): ${localFileUrl}`);
    console.log('Local download completed successfully!');

    // Wait for user input before cleanup
    console.log('\n--- Server is running ---');
    console.log('You can now test the URLs above in a browser or with another client.');
    console.log('Press Enter to stop the server and clean up...');
    
    // Wait for keyboard input
    await new Promise<void>((resolve) => {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.once('data', () => {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        resolve();
      });
    });

    // Cleanup
    console.log('\nStopping server...');
    await host.stop();
    console.log('Server stopped');

    // Delete the temporary file
    fs.unlinkSync(tempFilePath);
    console.log('Temporary file deleted');
    
    console.log('Example completed successfully!');
    
    // Force exit to prevent hanging
    process.exit(0);
    
  } catch (error) {
    console.error('Error:', error);
    
    // Cleanup on error
    try {
      await host.stop();
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError);
    }
    
    // Force exit on error
    process.exit(1);
  }
}

main().catch(console.error);

import { FileHost, FileClient } from '../src';
import * as fs from 'fs';
import * as path from 'path';

// This example demonstrates a simple file sharing scenario

async function main() {
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
    const fileId = host.shareFile(tempFilePath);
    console.log(`File shared with ID: ${fileId}`);

    // Get the public URL for the file
    const fileUrl = await host.getFileUrl(fileId);
    console.log(`File available at: ${fileUrl}`);

    // Download the file from the URL (simulating another peer)
    console.log('Downloading the shared file...');
    const buffer = await FileClient.downloadAsBuffer(fileUrl, {
      onProgress: (downloaded, total) => {
        const percent = Math.round((downloaded / total) * 100);
        console.log(`Download progress: ${percent}%`);
      }
    });

    // Verify the download
    console.log(`Downloaded ${buffer.length} bytes`);
    console.log(`File content: ${buffer.toString()}`);

    // Cleanup
    console.log('Stopping server...');
    await host.stop();
    console.log('Server stopped');

    // Delete the temporary file
    fs.unlinkSync(tempFilePath);
    console.log('Temporary file deleted');
    
    console.log('Example completed successfully!');
  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error);

# P2P File Share

A TypeScript package that provides peer-to-peer file sharing capabilities using UPnP (Universal Plug and Play) for NAT traversal.

## Features

- Share files directly from one peer to another
- Automatic UPnP port mapping for NAT traversal
- Intelligent IP address detection (handles local network access)
- Simple API for hosting and downloading files
- Support for streaming downloads
- Secure and efficient file transfer
- Robust error handling and fallback mechanisms
- Real-time download progress tracking

## Installation

```bash
npm install dig-nat-tools
```

## Running the Example

To test the package with the included example:

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the project:**
   ```bash
   npm run build
   ```

3. **Run the example using ts-node:**
   ```bash
   npx ts-node examples/simple-example.ts
   ```

   Or add the example script to your package.json:
   ```json
   {
     "scripts": {
       "example": "ts-node examples/simple-example.ts"
     }
   }
   ```
   
   Then run:
   ```bash
   npm run example
   ```

The example will:
- Create a temporary test file
- Start a file host server
- Share the file and generate a download URL
- Download the file from the URL (simulating peer-to-peer transfer)
- Clean up and stop the server

## Usage

### Hosting Files

```typescript
import { FileHost } from 'dig-nat-tools';

// Create a file host instance
const host = new FileHost({ 
  port: 30780,  // Optional: specific port to use
  ttl: 3600    // Optional: time to live for UPnP mapping (in seconds)
});

// Start the server
async function startServer() {
  try {
    // Start the host and get external access info
    const { externalIp, port } = await host.start();
    console.log(`Server running at http://${externalIp}:${port}`);
    
    // Share a file
    const fileId = host.shareFile('/path/to/your/file.pdf');
    
    // Get the public URL for the file
    const fileUrl = await host.getFileUrl(fileId);
    console.log(`File available at: ${fileUrl}`);
    
    // You can share this URL with others who want to download your file
    return fileUrl;
  } catch (error) {
    console.error('Failed to start server:', error);
  }
}

// Stop sharing when done
async function stopSharing() {
  await host.stop();
  console.log('Server stopped');
}
```

### Downloading Files

```typescript
import { FileClient } from 'dig-nat-tools';
import * as fs from 'fs';

// Download a file as a buffer
async function downloadFile(url: string) {
  try {
    const buffer = await FileClient.downloadAsBuffer(url, {
      timeout: 30000,  // Optional: timeout in milliseconds
      onProgress: (downloaded, total) => {
        // Optional: track download progress
        const percent = Math.round((downloaded / total) * 100);
        console.log(`Downloaded: ${percent}%`);
      }
    });
    
    // Use the buffer as needed
    console.log(`Downloaded ${buffer.length} bytes`);
    
    // For example, save it to disk
    fs.writeFileSync('downloaded-file.pdf', buffer);
  } catch (error) {
    console.error('Download failed:', error);
  }
}

// Download as a stream (for larger files)
async function downloadAsStream(url: string) {
  try {
    const stream = await FileClient.downloadAsStream(url);
    
    // Pipe the stream to a file or process it as needed
    const fileStream = fs.createWriteStream('downloaded-file.pdf');
    stream.pipe(fileStream);
    
    return new Promise((resolve, reject) => {
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
    });
  } catch (error) {
    console.error('Stream download failed:', error);
  }
}

// Check if a server is online
async function checkServer(baseUrl: string) {
  const isOnline = await FileClient.isServerOnline(baseUrl);
  console.log(`Server is ${isOnline ? 'online' : 'offline'}`);
  return isOnline;
}
```

## API Documentation

### FileHost

#### Constructor

```typescript
new FileHost(options?: {
  port?: number;     // Port to use (default: random available port)
  ttl?: number;      // Time to live for UPnP mapping in seconds (default: 3600)
})
```

#### Methods

- `start(): Promise<{ externalIp: string, port: number }>` - Starts the file hosting server
- `stop(): Promise<void>` - Stops the file hosting server
- `shareFile(filePath: string): string` - Shares a file and returns its unique ID
- `unshareFile(id: string): boolean` - Removes a shared file
- `getSharedFiles(): { id: string, path: string }[]` - Gets a list of shared files
- `getFileUrl(id: string): Promise<string>` - Gets the public URL for a shared file

### FileClient

#### Methods (Static)

- `downloadAsBuffer(url: string, options?: DownloadOptions): Promise<Buffer>` - Downloads a file as a buffer
- `downloadAsStream(url: string, options?: DownloadOptions): Promise<Readable>` - Downloads a file as a readable stream
- `isServerOnline(baseUrl: string): Promise<boolean>` - Checks if a server is online

#### Download Options

```typescript
interface DownloadOptions {
  timeout?: number;  // Timeout in milliseconds (default: 30000)
  onProgress?: (downloaded: number, total: number) => void;  // Progress callback
}
```


## Troubleshooting

### Network Issues

- **Connection Refused**: Make sure your firewall allows Node.js to accept incoming connections
- **UPnP Issues**: Ensure UPnP is enabled on your router. The package will fall back to local IP detection if UPnP fails
- **IP Detection**: The package automatically detects your correct local IP address and handles UPnP inconsistencies

### Common Solutions

1. **Firewall**: Allow Node.js through Windows Firewall when prompted
2. **Router UPnP**: Check router settings to enable UPnP/IGD
3. **Port Conflicts**: Use a different port if the default port is in use

## Requirements

- Node.js 14 or newer
- UPnP-enabled router for NAT traversal

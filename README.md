# P2P File Share

A TypeScript package that provides peer-to-peer file sharing capabilities using UPnP (Universal Plug and Play) and NAT-PMP for NAT traversal.

## Features

- Share files directly from one peer to another
- **SHA256-based file identification**: Files are identified by their content hash, ensuring security and deduplication
- **Content-addressable URLs**: File URLs use SHA256 hashes as paths (`/files/{sha256-hash}`)
- Automatic port mapping for NAT traversal using UPnP or NAT-PMP
- Intelligent fallback from NAT-PMP to UPnP when needed
- Intelligent IP address detection (handles local network access)
- Simple API for hosting and downloading files
- Support for streaming downloads
- Secure and efficient file transfer
- Robust error handling and fallback mechanisms
- Real-time download progress tracking
- Cascading network topology detection and error reporting

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
    
    // Share a file and get its SHA256 hash
    const fileHash = await host.shareFile('/path/to/your/file.pdf');
    console.log(`File hash: ${fileHash}`); // 64-character hexadecimal string
    
    // Get the public URL for the file
    // URL format: http://{host}:{port}/files/{sha256-hash}
    const fileUrl = await host.getFileUrl(fileHash);
    console.log(`File available at: ${fileUrl}`);
    // Example URL: http://203.0.113.1:30780/files/a1b2c3d4e5f6...
    
    // You can share this URL with others who want to download your file
    // The file path in the URL is the SHA256 hash of the file content
    return fileUrl;
  } catch (error) {
    console.error('Failed to start server:', error);
  }
}

// Stop sharing when done
async function stopSharing() {
  // Remove files from sharing (but keep hash-named files)
  const sharedFiles = host.getSharedFiles();
  sharedFiles.forEach(hash => {
    host.unshareFile(hash); // Only removes from tracking
  });
  
  // Or remove files and delete hash-named files
  sharedFiles.forEach(hash => {
    host.unshareFile(hash, true); // Removes from tracking AND deletes the hash-named file
  });
  
  await host.stop();
  console.log('Server stopped');
}
```

### File Identification with SHA256 Hashes

This package uses SHA256 hashes as file identifiers, which provides several benefits:

- **Content-based identification**: Files are identified by their content, not arbitrary IDs
- **Deduplication**: Identical files will have the same hash, preventing duplicates
- **Security**: SHA256 hashes are cryptographically secure and tamper-evident
- **URL structure**: File URLs use the format `http://{host}:{port}/files/{sha256-hash}`
- **Hash-based storage**: Files are copied and stored with their SHA256 hash as the filename

#### File Storage Model

When you share a file, the package:
1. Calculates the SHA256 hash of the file content
2. Copies the file to a new location named by its hash (e.g., `a1b2c3d4e5f6...`)
3. Serves the file directly from the hash-named location
4. No separate file mapping is maintained - the filesystem itself stores files by hash

Example SHA256 hash: `a1b2c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789ab`

```typescript
// When you share a file, it gets copied to a hash-named file
const fileHash = await host.shareFile('./document.pdf');
console.log(fileHash); // "a1b2c3d4e5f6789abc..."

// The file is now stored as: ./a1b2c3d4e5f6789abc...
// And served at: http://{host}:{port}/files/a1b2c3d4e5f6789abc...

// The hash becomes part of the download URL
const url = await host.getFileUrl(fileHash);
console.log(url); // "http://192.168.1.100:30780/files/a1b2c3d4e5f6789abc..."

// Anyone with this URL can download the file
// The file path component is the SHA256 hash
```

### Using NAT-PMP

```typescript
import { FileHost, ConnectionMode } from 'dig-nat-tools';

async function startWithNatPmp() {
  // Start server with NAT-PMP (with automatic UPnP fallback)
  const host = new FileHost({ port: 3000, connectionMode: ConnectionMode.NAT_PMP });
  
  try {
    const { externalIp, port } = await host.start();
    console.log(`Server running on ${externalIp}:${port}`);
    
    // Share files - returns SHA256 hash
    const fileHash = await host.shareFile('./my-document.pdf');
    const fileUrl = await host.getFileUrl(fileHash);
    console.log(`File available at: ${fileUrl}`);
    // URL will be: http://{host}:{port}/files/{sha256-hash}
    
    // ... rest of your application
    
  } catch (error) {
    console.error('Failed to start server:', error);
  } finally {
    await host.stop();
  }
}
```

### Plain Connection (Local Network Only)

```typescript
import { FileHost, ConnectionMode } from 'dig-nat-tools';

async function startLocalOnly() {
  // Start server without any NAT traversal (assumes ports are already open)
  const host = new FileHost({ port: 3000, connectionMode: ConnectionMode.PLAIN });
  
  try {
    const { externalIp, port } = await host.start();
    console.log(`Server running locally on ${externalIp}:${port}`);
    
    // Share files - returns SHA256 hash
    const fileHash = await host.shareFile('./my-document.pdf');
    const fileUrl = await host.getFileUrl(fileHash);
    console.log(`File available at: ${fileUrl}`);
    // URL path contains the SHA256 hash: /files/{sha256-hash}
    
    // ... rest of your application
    
  } catch (error) {
    console.error('Failed to start server:', error);
  } finally {
    await host.stop();
  }
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
import { FileHost, ConnectionMode } from 'dig-nat-tools';

new FileHost(options?: {
  port?: number;                    // Port to use (default: random available port)
  ttl?: number;                     // Time to live for port mapping in seconds (default: 3600)
  connectionMode?: ConnectionMode;  // Connection mode for NAT traversal (default: ConnectionMode.UPNP)
})

enum ConnectionMode {
  UPNP = 'upnp',      // Use UPnP for port forwarding
  NAT_PMP = 'natpmp', // Use NAT-PMP for port forwarding  
  PLAIN = 'plain'     // Skip NAT traversal, use local IP only
}
```

#### Methods

- `start(): Promise<{ externalIp: string, port: number }>` - Starts the file hosting server
- `stop(): Promise<void>` - Stops the file hosting server
- `shareFile(filePath: string): Promise<string>` - Shares a file and returns its SHA256 hash (64-character hex string)
- `unshareFile(hash: string, deleteFile?: boolean): boolean` - Removes a shared file from tracking, optionally deletes the hash-named file
- `getSharedFiles(): string[]` - Gets a list of shared file hashes
- `getFileUrl(hash: string): Promise<string>` - Gets the public URL for a shared file using its SHA256 hash

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

## NAT Traversal Protocols

This package supports two protocols for NAT traversal:

### UPnP (Universal Plug and Play) - Default
- **Widely Supported**: Works with most consumer routers
- **Automatic Discovery**: Finds compatible devices automatically
- **Mature Protocol**: Well-established standard

### NAT-PMP (Network Address Translation Port Mapping Protocol)
- **Apple Standard**: Developed by Apple, commonly found on Apple routers
- **Lightweight**: Simpler protocol with less overhead
- **Fast Setup**: Quicker port mapping establishment

### Local Network Only (Skip NAT Traversal)
- **Manual Setup**: For when ports are already manually forwarded
- **Local Networks**: For use within the same network/LAN only
- **Fastest Start**: No protocol negotiation, immediate server start
- **Pre-configured**: When you've already set up port forwarding manually

### Protocol Selection

```typescript
import { FileHost, ConnectionMode } from 'dig-nat-tools';

// Use UPnP (default)
const host = new FileHost({ port: 3000 });
// or explicitly:
const host = new FileHost({ port: 3000, connectionMode: ConnectionMode.UPNP });

// Use NAT-PMP
const host = new FileHost({ port: 3000, connectionMode: ConnectionMode.NAT_PMP });

// Plain connection (local network only)
const host = new FileHost({ port: 3000, connectionMode: ConnectionMode.PLAIN });
```

### Automatic Fallback

When using NAT-PMP, the package automatically falls back to UPnP if NAT-PMP fails:

1. **NAT-PMP Attempt**: First tries to map port using NAT-PMP
2. **UPnP Fallback**: If NAT-PMP fails, automatically attempts UPnP
3. **Local IP**: If both fail, falls back to local IP detection

## Troubleshooting

### Network Issues

- **Connection Refused**: Make sure your firewall allows Node.js to accept incoming connections
- **NAT-PMP Issues**: Ensure your router supports NAT-PMP (common on Apple routers). The package will automatically fall back to UPnP if NAT-PMP fails
- **UPnP Issues**: Ensure UPnP is enabled on your router. The package will fall back to local IP detection if UPnP also fails
- **IP Detection**: The package automatically detects your correct local IP address and handles NAT traversal inconsistencies

### Common Solutions

1. **Firewall**: Allow Node.js through Windows Firewall when prompted
2. **Router NAT-PMP**: Check if your router supports NAT-PMP (common on Apple routers)
3. **Router UPnP**: Check router settings to enable UPnP/IGD
4. **Port Conflicts**: Use a different port if the default port is in use

## Requirements

- Node.js 14 or newer
- Router with NAT-PMP and/or UPnP support for NAT traversal
  - NAT-PMP: Common on Apple routers
  - UPnP: Widely supported on consumer routers

# P2P File Share

A TypeScript package that provides peer-to-peer file sharing capabilities using UPnP (Universal Plug and Play) for NAT traversal.

## Features

- Share files directly from one peer to another
- **SHA256-based file identification**: Files are identified by their content hash, ensuring security and deduplication
- **Content-addressable URLs**: File URLs use SHA256 hashes as paths (`/files/{sha256-hash}`)
- Automatic port mapping for NAT traversal using UPnP
- Intelligent IP address detection (handles local network access)
- Simple API for hosting and downloading files
- Support for streaming downloads
- Secure and efficient file transfer
- Robust error handling and fallback mechanisms
- Real-time download progress tracking
- Cascading network topology detection and error reporting
 - Host your own Gun.js relay for decentralized P2P
 - WebTorrent support for browser-based P2P file sharing

## Installation

```bash
npm install dig-nat-tools
```

## Quick Start: Simplified NAT Tools

The simplified `NatTools` interface provides an easy way to share and discover files using WebTorrent and Gun.js registry:

### Basic Usage

```typescript
import { NatTools } from 'dig-nat-tools';

// Create and initialize NAT tools
const natTools = new NatTools({
  peers: ['http://dig-relay-prod.eba-2cmanxbe.us-east-1.elasticbeanstalk.com/gun'],
  namespace: 'my-app'
});

await natTools.initialize();

// Seed a file and share its magnet URI
const result = await natTools.seedFile('/path/to/file.txt');
console.log('Magnet URI:', result.magnetUri);
console.log('Info Hash:', result.infoHash);

// Discover magnet URIs from other peers (from last 1 minute)
const magnetUris = await natTools.discoverMagnetUris(60000);
console.log('Found', magnetUris.length, 'files');

// Download a file from a magnet URI
const buffer = await natTools.downloadFromMagnet(magnetUris[0]);
console.log('Downloaded', buffer.length, 'bytes');

// Cleanup
await natTools.destroy();
```

### Running the NAT Tools Example

The package includes a complete example that automatically shares and discovers files:

1. **Build the project:**
   ```bash
   npm install
   npm run build
   ```

2. **Run the NAT tools example:**
   ```bash
   node examples/nat-tools-example.js
   ```

The example will:
- Seed all `*.dig` files from `~/.dig` directory
- Share their magnet URIs via Gun.js registry
- **Every 30 seconds:**
  - Rebroadcast all seeded magnet URIs (to keep them fresh in the registry)
  - Discover magnet URIs from other peers
  - Download files that you don't already have
- Automatically seed downloaded files

You can create test files:
```bash
# On Windows
mkdir %USERPROFILE%\.dig
echo "Test content" > %USERPROFILE%\.dig\test.dig

# On Linux/Mac
mkdir -p ~/.dig
echo "Test content" > ~/.dig/test.dig
```

## Installation

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

### Hosting Files with Gun.js Registry

```typescript
import { FileHost, ConnectionMode } from 'dig-nat-tools';

// Create a file host with Gun.js peer discovery
const host = new FileHost({ 
  port: 30780,
  connectionMode: ConnectionMode.AUTO, // Try HTTP first, then WebTorrent
  storeId: 'my-unique-host-id',
  gun: {
    peers: ['http://dig-relay-prod.eba-2cmanxbe.us-east-1.elasticbeanstalk.com/gun'], // Your Gun.js relay
    namespace: 'my-app-namespace'
  }
});

// Start the server
async function startServer() {
  try {
    // Start the host and register with Gun.js
    const capabilities = await host.start();
    console.log('Host capabilities:', capabilities);
    
    // Share a file and get its filename
    const filename = await host.shareFile('/path/to/your/file.pdf');
    console.log(`File name: ${filename}`);
    
    // Get URLs (HTTP and/or WebTorrent magnet URI)
    const fileUrl = await host.getFileUrl(filename);
    console.log(`File available at: ${fileUrl}`);
    
    return fileUrl;
  } catch (error) {
    console.error('Failed to start server:', error);
  }
}
```

### Discovering and Downloading from Peers

```typescript
import { FileClient } from 'dig-nat-tools';

// Create a client that discovers hosts via Gun.js
const client = new FileClient({
  peers: ['http://dig-relay-prod.eba-2cmanxbe.us-east-1.elasticbeanstalk.com/gun'], // Same Gun.js relay
  namespace: 'my-app-namespace',
  timeout: 30000
});

async function discoverAndDownload() {
  try {
    // Find available peers in the Gun.js registry
    const peers = await client.findAvailablePeers();
    console.log(`Found ${peers.length} peers`);
    
    // Download from a specific peer by store ID and filename
    const storeId = 'my-unique-host-id';
    const filename = 'file.pdf';
    
    const fileBuffer = await client.downloadFile(storeId, filename);
    console.log(`Downloaded ${fileBuffer.length} bytes`);
    
    // Client automatically chooses best connection method:
    // 1. Direct HTTP (fastest)
    // 2. WebTorrent (P2P fallback)
    
    // Download with file size limit (for WebTorrent downloads)
    const limitedBuffer = await client.downloadFile(storeId, filename, {
      maxFileSizeBytes: 10 * 1024 * 1024 // Limit to 10MB
    });
    
  } catch (error) {
    console.error('Download failed:', error);
  } finally {
    await client.destroy(); // Clean up WebTorrent resources
  }
}
```

### Connection Modes

```typescript
import { ConnectionMode } from 'dig-nat-tools';

// AUTO: Try Direct HTTP first, then WebTorrent (recommended)
const autoHost = new FileHost({ 
  connectionMode: ConnectionMode.AUTO,
  gun: { peers: ['http://dig-relay-prod.eba-2cmanxbe.us-east-1.elasticbeanstalk.com/gun'] }
});

// HTTP_ONLY: Direct HTTP connections only
const httpHost = new FileHost({ 
  connectionMode: ConnectionMode.HTTP_ONLY,
  gun: { peers: ['http://dig-relay-prod.eba-2cmanxbe.us-east-1.elasticbeanstalk.com/gun'] }
});

// WEBTORRENT_ONLY: WebTorrent P2P only
const p2pHost = new FileHost({ 
  connectionMode: ConnectionMode.WEBTORRENT_ONLY,
  gun: { peers: ['http://dig-relay-prod.eba-2cmanxbe.us-east-1.elasticbeanstalk.com/gun'] }
});
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

### NatTools (Simplified Interface)

The simplified interface for magnet URI sharing and WebTorrent operations.

#### Constructor

```typescript
import { NatTools } from 'dig-nat-tools';

new NatTools(options?: {
  peers?: string[];        // Gun.js peer URLs (default: ['http://dig-relay-prod.eba-2cmanxbe.us-east-1.elasticbeanstalk.com/gun'])
  namespace?: string;      // Registry namespace (default: 'dig-nat-tools')
  logger?: Logger;         // Custom logger
  webrtc?: {
    iceServers?: Array<{ urls: string | string[] }>;
  };
})
```

#### Methods

- `initialize(): Promise<void>` - Initialize WebTorrent and Gun.js registry
- `seedFile(filePath: string, nodeId?: string): Promise<SeedResult>` - Seed a file and share its magnet URI
- `unseedFile(filePath: string): Promise<boolean>` - Stop seeding a file and remove from registry
- `downloadFromMagnet(magnetUri: string, maxFileSizeBytes?: number): Promise<Buffer>` - Download a file from magnet URI
- `discoverMagnetUris(maxAgeMs?: number): Promise<string[]>` - Discover magnet URIs (default: 60000ms = 1 minute)
- `getSeededFiles(): Map<string, string>` - Get map of file paths to magnet URIs
- `getActiveTorrentsCount(): number` - Get count of active torrents
- `isWebTorrentAvailable(): boolean` - Check if WebTorrent is available
- `isRegistryAvailable(): boolean` - Check if Gun.js registry is available
- `destroy(): Promise<void>` - Clean up resources

#### Return Types

```typescript
interface SeedResult {
  filePath: string;      // Path to the seeded file
  magnetUri: string;     // Magnet URI for the file
  infoHash: string;      // Info hash extracted from magnet URI
}
```

#### Example Usage

```typescript
import { NatTools } from 'dig-nat-tools';
import * as fs from 'fs';

async function example() {
  // Create instance
  const natTools = new NatTools({
    peers: ['http://dig-relay-prod.eba-2cmanxbe.us-east-1.elasticbeanstalk.com/gun'],
    namespace: 'my-app'
  });

  // Initialize
  await natTools.initialize();

  // Seed a file
  const result = await natTools.seedFile('./myfile.txt');
  console.log('Seeded:', result.infoHash);

  // Discover files from other peers
  const magnetUris = await natTools.discoverMagnetUris(60000);
  console.log('Discovered', magnetUris.length, 'files');

  // Download a discovered file
  if (magnetUris.length > 0) {
    const buffer = await natTools.downloadFromMagnet(magnetUris[0]);
    fs.writeFileSync('./downloaded.txt', buffer);
  }

  // Get seeded files
  const seededFiles = natTools.getSeededFiles();
  console.log('Seeding', seededFiles.size, 'files');

  // Cleanup
  await natTools.destroy();
}
```

---

### Gun Relay

You can run a Gun.js relay server using the included `relay.ts` file. This enables decentralized, real-time data sync for your P2P applications.

#### Local Development

```bash
npx ts-node src/relay.ts
```

Your Gun.js clients can connect to `http://localhost:8765/gun` for local development.

**Production Relay**: A public relay is available at `http://dig-relay-prod.eba-2cmanxbe.us-east-1.elasticbeanstalk.com/gun` for testing and development.

#### Docker Deployment

The relay includes UPnP support for automatic port forwarding and can be deployed as a Docker container.

**Build Docker Image:**
```bash
# Build the project first
npm run build

# Build Docker image
docker build -f Dockerfile.relay -t your-registry/gun-relay:latest .

# Push to registry
docker push your-registry/gun-relay:latest
```

**Environment Variables:**
- `PORT`: Server port (default: 8765)
- `UPNP_ENABLED`: Enable UPnP port forwarding (default: true)
- `UPNP_TTL`: UPnP mapping TTL in seconds (default: 7200)
- `NODE_ENV`: Node environment (default: production)

**Docker Run Example:**
```bash
docker run -d \
  --name gun-relay \
  -p 8765:8765 \
  -e UPNP_ENABLED=true \
  -e UPNP_TTL=7200 \
  your-registry/gun-relay:latest
```

The relay automatically:
- ✅ Maps the specified port via UPnP when starting
- ✅ Removes the port mapping on graceful shutdown  
- ✅ Handles SIGTERM, SIGINT signals properly
- ✅ Provides health check endpoints at `/health`

**Features:**
- **UPnP Port Forwarding**: Automatically opens/closes ports on router
- **Graceful Shutdown**: Properly cleans up UPnP mappings
- **Health Checks**: Built-in health endpoints for monitoring
- **Security**: Runs as non-root user in container
- **Persistent Storage**: Gun.js data persisted in `/app/gun-data`

---

### WebTorrent

WebTorrent is supported for browser-based and Node.js P2P file sharing. See usage examples above.

### FileHost

#### Constructor

```typescript
import { FileHost, ConnectionMode } from 'dig-nat-tools';

new FileHost(options?: {
  port?: number;                    // Port to use (default: random available port)
  ttl?: number;                     // Time to live for port mapping in seconds (default: 3600)
  connectionMode?: ConnectionMode;  // Connection mode (default: ConnectionMode.AUTO)
  storeId?: string;                 // Unique identifier for Gun.js registry
  gun?: {
    peers: string[];                // Gun.js peer URLs (e.g., ['http://dig-relay-prod.eba-2cmanxbe.us-east-1.elasticbeanstalk.com/gun'])
    namespace?: string;             // Registry namespace (default: 'dig-nat-tools')
  };
})

enum ConnectionMode {
  AUTO = 'auto',                    // Try HTTP first, then WebTorrent
  HTTP_ONLY = 'http',              // Only HTTP (manual port forwarding required)
  WEBTORRENT_ONLY = 'webtorrent'   // Only WebTorrent P2P
}
```

#### Methods

- `start(): Promise<HostCapabilities>` - Starts the file hosting server and registers with Gun.js
- `stop(): Promise<void>` - Stops the file hosting server and unregisters from Gun.js
- `shareFile(filePath: string): Promise<string>` - Shares a file and returns its filename (extracted from filePath)
- `unshareFile(filename: string, deleteFile?: boolean): boolean` - Removes a shared file from tracking, optionally deletes the original file
- `getSharedFiles(): string[]` - Gets a list of shared filenames
- `getFileUrl(filename: string): Promise<string>` - Gets the public URL for a shared file using its filename
- `getMagnetUris(): string[]` - Gets WebTorrent magnet URIs for shared files

### FileClient

#### Constructor

```typescript
import { FileClient } from 'dig-nat-tools';

new FileClient(options?: {
  peers?: string[];        // Gun.js peer URLs (default: ['http://dig-relay-prod.eba-2cmanxbe.us-east-1.elasticbeanstalk.com/gun'])
  namespace?: string;      // Gun.js namespace (default: 'dig-nat-tools')
  timeout?: number;        // Download timeout (default: 30000)
})
```

#### Methods

- `downloadFile(storeId: string, filename: string, options?: DownloadOptions): Promise<Buffer>` - Download from a specific peer
- `downloadAsBuffer(url: string, options?: DownloadOptions): Promise<Buffer>` - Downloads a file as a buffer
- `downloadAsStream(url: string, options?: DownloadOptions): Promise<Readable>` - Downloads a file as a readable stream
- `isServerOnline(baseUrl: string): Promise<boolean>` - Checks if a server is online
- `findAvailablePeers(): Promise<HostCapabilities[]>` - Find all available peers in Gun.js registry
- `checkPeerCapabilities(storeId: string): Promise<HostCapabilities | null>` - Check capabilities of a specific peer
- `destroy(): Promise<void>` - Clean up WebTorrent resources

#### Static Methods

- `downloadAsBufferStatic(url: string, options?: DownloadOptions): Promise<Buffer>` - Downloads a file as a buffer (static)
- `downloadAsStreamStatic(url: string, options?: DownloadOptions): Promise<Readable>` - Downloads a file as a readable stream (static)
- `isServerOnlineStatic(baseUrl: string): Promise<boolean>` - Checks if a server is online (static)

#### Download Options

```typescript
interface DownloadOptions {
  timeout?: number;  // Timeout in milliseconds (default: 30000)
  onProgress?: (downloaded: number, total: number) => void;  // Progress callback
  maxFileSizeBytes?: number;  // Maximum allowed file size for WebTorrent downloads (in bytes)
}

interface HostCapabilities {
  storeId: string;
  directHttp?: {
    available: boolean;
    ip: string;
    port: number;
  };
  webTorrent?: {
    available: boolean;
    magnetUris?: string[];  // Magnet URIs for shared files
  };
  externalIp?: string;      // Legacy field
  port?: number;            // Legacy field
  lastSeen?: number;        // Timestamp when last seen in registry
}
```

## Connection Methods

This package supports multiple connection methods for peer-to-peer file sharing:

### AUTO Mode (Recommended)
- **Intelligent Fallback**: Tries Direct HTTP first, then WebTorrent
- **Best Performance**: Direct HTTP provides fastest transfers
- **P2P Backup**: WebTorrent ensures connectivity when direct connections fail
- **UPnP Support**: Automatically handles port forwarding when possible

### HTTP_ONLY Mode
- **Direct Connections**: HTTP-only file transfers
- **Manual Setup**: Requires manual port forwarding or same network
- **Fastest Speed**: No P2P overhead
- **Simple Protocol**: Standard HTTP file serving

### WEBTORRENT_ONLY Mode
- **Pure P2P**: WebTorrent-based file sharing
- **NAT Traversal**: Works through firewalls and NATs
- **Browser Compatible**: Can connect to web-based clients
- **Distributed**: No central server required

### Connection Method Selection

```typescript
import { FileHost, ConnectionMode } from 'dig-nat-tools';

// AUTO: Try HTTP first, then WebTorrent (recommended)
const host = new FileHost({ 
  connectionMode: ConnectionMode.AUTO,
  gun: { peers: ['http://dig-relay-prod.eba-2cmanxbe.us-east-1.elasticbeanstalk.com/gun'] }
});

// HTTP only: Direct connections
const httpHost = new FileHost({ 
  connectionMode: ConnectionMode.HTTP_ONLY 
});

// WebTorrent only: Pure P2P
const p2pHost = new FileHost({ 
  connectionMode: ConnectionMode.WEBTORRENT_ONLY 
});
```

### UPnP (Universal Plug and Play)
- **Automatic Port Forwarding**: Works with most consumer routers
- **Relay Server Support**: Gun.js relay includes UPnP for Docker/Kubernetes deployment
- **Graceful Cleanup**: Automatically removes port mappings on shutdown

## Troubleshooting

### Network Issues

- **Connection Refused**: Make sure your firewall allows Node.js to accept incoming connections
- **UPnP Issues**: Ensure UPnP is enabled on your router. The package will fall back to local IP detection if UPnP fails
- **IP Detection**: The package automatically detects your correct local IP address and handles NAT traversal inconsistencies

### Common Solutions

1. **Firewall**: Allow Node.js through Windows Firewall when prompted
2. **Router UPnP**: Check router settings to enable UPnP/IGD
3. **Port Conflicts**: Use a different port if the default port is in use

## Running the Client

### Test Client Example

The package includes a test client that demonstrates peer discovery and file downloading:

#### 1. Build the Project

```bash
npm install
npm run build
```

#### 2. Run the Test Client

```bash
node .\examples\test-client.js
```

**What the test client does:**
- Connects to the Gun.js relay for peer discovery
- Searches for available peers in the registry
- Displays peer capabilities (HTTP, WebTorrent)
- Attempts to download files from discovered peers
- Shows detailed logging of the discovery process

**Example Output:**
```
🔍 Starting test client...
🔗 Connecting to Gun.js relay at http://dig-relay-prod.eba-2cmanxbe.us-east-1.elasticbeanstalk.com/gun...
📡 Using namespace: dig-nat-tools-test
🔄 Searching for available peers...
📊 Search completed. Found 2 peer(s)
🎯 Peer details: [
  {
    storeId: 'test-host-1',
    directHttp: true,
    webTorrent: true,
    lastSeen: '3:45:22 PM'
  }
]
✅ Successfully connected to peer via Gun.js!
```

#### 3. Configuration Options

You can modify the test client configuration:

```javascript
// In examples/test-client.js
const client = new FileClient({
  peers: ['http://dig-relay-prod.eba-2cmanxbe.us-east-1.elasticbeanstalk.com/gun'], // Gun.js relay URL
  namespace: 'dig-nat-tools-test',                 // Registry namespace
  timeout: 30000                                   // 30 second timeout
});
```

**Custom relay:** Replace with your own Gun.js relay URL
**Namespace:** Use different namespaces to separate different applications
**Timeout:** Adjust based on network conditions

### Custom Client Implementation

#### Basic Peer Discovery

```javascript
const { FileClient } = require('dig-nat-tools');

async function discoverPeers() {
  const client = new FileClient({
    peers: ['http://dig-relay-prod.eba-2cmanxbe.us-east-1.elasticbeanstalk.com/gun'],
    namespace: 'my-app',
    timeout: 30000
  });

  try {
    // Find all available peers
    const peers = await client.findAvailablePeers();
    console.log(`Found ${peers.length} peers:`);
    
    peers.forEach(peer => {
      console.log(`- ${peer.storeId}`);
      console.log(`  HTTP: ${peer.directHttp?.available || false}`);
      console.log(`  WebTorrent: ${peer.webTorrent?.available || false}`);
      console.log(`  Last seen: ${new Date(peer.lastSeen).toLocaleString()}`);
    });
    
    return peers;
  } catch (error) {
    console.error('Discovery failed:', error);
    return [];
  } finally {
    await client.destroy();
  }
}

discoverPeers();
```

#### Download Files from Specific Peer

```javascript
const { FileClient } = require('dig-nat-tools');
const fs = require('fs');

async function downloadFromPeer() {
  const client = new FileClient({
    peers: ['http://dig-relay-prod.eba-2cmanxbe.us-east-1.elasticbeanstalk.com/gun'],
    namespace: 'my-app'
  });

  try {
    // Check specific peer capabilities
    const storeId = 'target-host-id';
    const capabilities = await client.checkPeerCapabilities(storeId);
    
    if (capabilities) {
      console.log('Peer found:', capabilities);
      
      // Download a specific file by its SHA256 hash
      const fileHash = 'a1b2c3d4e5f6...'; // SHA256 hash of the file
      const fileBuffer = await client.downloadFile(storeId, fileHash, {
        timeout: 60000,
        onProgress: (downloaded, total) => {
          const percent = Math.round((downloaded / total) * 100);
          console.log(`Download progress: ${percent}%`);
        }
      });
      
      // Save the downloaded file
      fs.writeFileSync(`downloaded-${fileHash.substring(0, 8)}.bin`, fileBuffer);
      console.log(`Downloaded ${fileBuffer.length} bytes`);
      
    } else {
      console.log('Peer not found or offline');
    }
    
  } catch (error) {
    console.error('Download failed:', error);
  } finally {
    await client.destroy();
  }
}

downloadFromPeer();
```

#### Monitor Peer Registry in Real-time

```javascript
const { FileClient } = require('dig-nat-tools');

async function monitorPeers() {
  const client = new FileClient({
    peers: ['http://dig-relay-prod.eba-2cmanxbe.us-east-1.elasticbeanstalk.com/gun'],
    namespace: 'my-app'
  });

  // Check for peers every 30 seconds
  setInterval(async () => {
    try {
      const peers = await client.findAvailablePeers();
      console.log(`\n[${new Date().toLocaleTimeString()}] Active peers: ${peers.length}`);
      
      peers.forEach(peer => {
        const lastSeen = new Date(peer.lastSeen).toLocaleTimeString();
        console.log(`  📡 ${peer.storeId} (last seen: ${lastSeen})`);
      });
      
    } catch (error) {
      console.error('Monitoring error:', error);
    }
  }, 30000);

  // Keep the process running
  console.log('🔍 Monitoring peers... Press Ctrl+C to stop');
  process.on('SIGINT', async () => {
    console.log('\n🛑 Stopping monitor...');
    await client.destroy();
    process.exit(0);
  });
}

monitorPeers();
```

### TypeScript Client Example

```typescript
import { FileClient, HostCapabilities } from 'dig-nat-tools';
import * as fs from 'fs';

class P2PFileManager {
  private client: FileClient;

  constructor(relayUrl: string, namespace: string) {
    this.client = new FileClient({
      peers: [relayUrl],
      namespace: namespace,
      timeout: 45000
    });
  }

  async searchAndDownload(targetStoreId: string, fileHash: string): Promise<boolean> {
    try {
      // First, check if the specific peer is available
      const peer = await this.client.checkPeerCapabilities(targetStoreId);
      
      if (!peer) {
        console.log(`❌ Peer ${targetStoreId} not found`);
        return false;
      }

      console.log(`✅ Found peer ${targetStoreId}`);
      console.log(`   HTTP available: ${peer.directHttp?.available || false}`);
      console.log(`   WebTorrent available: ${peer.webTorrent?.available || false}`);

      // Download the file
      const fileData = await this.client.downloadFile(targetStoreId, fileHash, {
        onProgress: (downloaded, total) => {
          const percent = Math.round((downloaded / total) * 100);
          process.stdout.write(`\r📥 Downloading: ${percent}%`);
        }
      });

      console.log(`\n✅ Download complete: ${fileData.length} bytes`);

      // Save to disk
      const filename = `downloaded-${fileHash.substring(0, 12)}.bin`;
      fs.writeFileSync(filename, fileData);
      console.log(`💾 Saved as: ${filename}`);

      return true;

    } catch (error) {
      console.error('❌ Download failed:', error);
      return false;
    }
  }

  async listAllPeers(): Promise<HostCapabilities[]> {
    try {
      const peers = await this.client.findAvailablePeers();
      
      console.log(`\n📋 Found ${peers.length} active peers:`);
      peers.forEach((peer, index) => {
        console.log(`\n${index + 1}. Store ID: ${peer.storeId}`);
        console.log(`   Last seen: ${new Date(peer.lastSeen || 0).toLocaleString()}`);
        console.log(`   Capabilities:`);
        console.log(`     - Direct HTTP: ${peer.directHttp?.available || false}`);
        if (peer.directHttp?.available) {
          console.log(`       IP: ${peer.directHttp.ip}:${peer.directHttp.port}`);
        }
        console.log(`     - WebTorrent: ${peer.webTorrent?.available || false}`);
        if (peer.webTorrent?.available && peer.webTorrent.magnetUris?.length) {
          console.log(`       Files: ${peer.webTorrent.magnetUris.length} available`);
        }
      });

      return peers;

    } catch (error) {
      console.error('❌ Failed to list peers:', error);
      return [];
    }
  }

  async cleanup(): Promise<void> {
    await this.client.destroy();
  }
}

// Usage example
async function main() {
  const manager = new P2PFileManager(
    'http://dig-relay-prod.eba-2cmanxbe.us-east-1.elasticbeanstalk.com/gun',
    'my-application'
  );

  try {
    // List all available peers
    await manager.listAllPeers();

    // Download a specific file
    const success = await manager.searchAndDownload(
      'target-peer-id',
      'sha256-hash-of-file'
    );

    if (success) {
      console.log('🎉 File downloaded successfully!');
    }

  } finally {
    await manager.cleanup();
  }
}

main().catch(console.error);
```

### Client Troubleshooting

#### Common Issues

**No peers found:**
```bash
❌ No peers found. Possible issues:
   1. Host is not running
   2. Host failed to register with Gun.js relay
   3. Gun.js relay is not accessible
   4. Namespace mismatch between host and client
   5. Timing issue - try waiting longer after starting host
```

**Solutions:**
1. **Check relay connectivity:** Verify the Gun.js relay URL is accessible
2. **Verify namespace:** Ensure client and host use the same namespace
3. **Wait for registration:** Hosts may take a few seconds to appear in the registry
4. **Check network:** Ensure firewall/proxy isn't blocking connections

**Timeout issues:**
```javascript
// Increase timeouts for slow networks
const client = new FileClient({
  peers: ['http://your-relay.com/gun'],
  namespace: 'your-app',
  timeout: 60000  // 60 seconds instead of default 30
});
```

**Connection method selection:**
```javascript
// If direct HTTP fails, the client automatically tries WebTorrent
// You can check which method was used in the logs
const fileData = await client.downloadFile(storeId, fileHash);
// Look for logs like:
// "🌐 Attempting direct HTTP download..."
// "🧲 Falling back to WebTorrent download..."
```

### Debug Mode

Enable verbose logging by setting the DEBUG environment variable:

```bash
# Windows
set DEBUG=dig-nat-tools:*
node .\examples\test-client.js

# Linux/Mac
DEBUG=dig-nat-tools:* node ./examples/test-client.js
```

This will show detailed information about:
- Gun.js connection status
- Peer discovery process
- Download attempts and fallbacks
- Network timeouts and retries

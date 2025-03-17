# Dig NAT Tools

A TypeScript library for decentralized peer-to-peer file transfers with advanced NAT traversal techniques.

## Features

- **NAT Traversal**: Automatically traverse NAT and firewalls using multiple techniques
- **Multiple Connection Methods**: TCP, UDP, WebRTC, and Gun relay fallback
- **Distributed File Sharing**: Download from multiple peers simultaneously
- **Resume Support**: Resume downloads from where they left off
- **Verification**: SHA-256 verification of downloaded files
- **Progress Tracking**: Track download progress with callbacks
- **TypeScript Support**: Written in TypeScript with full type definitions

## Installation

```bash
npm install dig-nat-tools
```

## Usage

### Basic Example

```typescript
import { createHost, createClient, downloadFile } from 'dig-nat-tools';

// Host a file
const host = createHost({
  enableTCP: true,
  enableUDP: true,
  enableWebRTC: true,
});

// Provide a callback to serve files based on their hash
host.start((fileHash) => {
  if (fileHash === 'abc123...') {
    return '/path/to/my/file.mp4';
  }
  return null;
});

// Get the host ID for sharing
const hostId = host.hostId;
console.log(`Share this host ID: ${hostId}`);

// Download a file from a host
await downloadFile(
  'abc123...', // file hash
  './downloads/myfile.mp4', // save path
  [hostId], // array of host IDs
  {
    progressCallback: (progress) => {
      console.log(`${progress.percent}% complete`);
    }
  }
);
```

### Examples

The library includes several example applications to demonstrate its functionality:

#### Host Example

Shows how to create and configure a host to serve files:

```bash
npm run example:host
```

This example:
- Creates a sample file to serve
- Configures a host with TCP, UDP, WebRTC, and NAT-PMP/PCP support
- Implements a file serving callback
- Displays connection information for clients

#### Client Example

Demonstrates how to download files from a host:

```bash
npm run example:client
```

This example:
- Prompts for host ID and file hash
- Downloads the file using the simple downloadFile API
- Verifies file integrity
- Includes commented code showing the lower-level client API

#### Multi-Peer Client Example

Shows how to download files from multiple hosts simultaneously:

```bash
npm run example:multi-peer
```

This example:
- Prompts for file hash and multiple host IDs
- Uses the NetworkManager to download from multiple peers
- Displays download progress and per-peer statistics
- Verifies file integrity

#### IP Discovery Example

Demonstrates how to discover your public IP addresses:

```bash
npm run example:ip-discovery
```

This example:
- Uses the discoverPublicIPs function to find IPv4 and IPv6 addresses
- Provides context about the results and their implications for connectivity

### Advanced Usage

#### Multi-peer Downloads

Use NetworkManager for downloading from multiple peers:

```typescript
import { NetworkManager } from 'dig-nat-tools';

const manager = new NetworkManager({
  concurrency: 5, // Download from 5 peers simultaneously
  stunServers: ['stun:stun.l.google.com:19302']
});

await manager.downloadFile(
  'abc123...', // file hash
  './downloads/myfile.mp4', // save path
  ['peer1:1234', 'peer2:5678', 'peer3:9012'] // multiple peers
);
```

#### Custom STUN Servers

Provide your own STUN servers for better NAT traversal:

```typescript
import { createHost, createClient } from 'dig-nat-tools';

const host = createHost({
  stunServers: [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302'
  ]
});
```

## IP Discovery

The library provides functionality to discover your public IP addresses, which is essential for NAT traversal and peer-to-peer connections:

```typescript
import { discoverPublicIPs } from 'dig-nat-tools';

// Discover public IPv4 and IPv6 addresses
const { ipv4, ipv6 } = await discoverPublicIPs();

console.log(`Public IPv4: ${ipv4}`);
console.log(`Public IPv6: ${ipv6}`);
```

You can customize the discovery process:

```typescript
// Custom configuration
const result = await discoverPublicIPs({
  // Custom STUN servers
  stunServers: [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302'
  ],
  // Timeout in milliseconds
  timeout: 5000,
  // Whether to use external IP lookup services as fallback
  useExternalServices: true
});
```

The function uses multiple methods to discover your public IPs:
1. STUN servers (for NAT traversal)
2. Public IP lookup services (as fallback)

This is particularly useful when:
- You need to advertise your public IP to peers
- You want to check if you're behind NAT
- You need to determine if you have IPv6 connectivity

## API Reference

### Classes

- `FileHost` - For hosting/serving files to peers
- `FileClient` - For downloading files from peers
- `NetworkManager` - For managing multi-peer downloads

### Factory Functions

- `createHost(options)` - Create a FileHost instance
- `createClient(options)` - Create a FileClient instance
- `createNetworkManager(options)` - Create a NetworkManager instance
- `downloadFile(hash, path, peers, options)` - Quick download helper

### Connection Types

- `TCP` - Direct TCP connection
- `UDP` - Direct UDP connection
- `WEBRTC` - WebRTC DataChannel connection
- `GUN` - Gun relay (fallback)

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run example
npm run example
```

## License

MIT 
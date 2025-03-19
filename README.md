# DIG NAT Tools

Decentralized P2P file transfer with comprehensive NAT traversal capabilities.

## Features

- **Multiple NAT Traversal Methods**: Direct TCP/UDP, UPnP, NAT-PMP, TCP/UDP Hole Punching, ICE Protocol, TURN Relay
- **P2P Protocol Support**: TCP, UDP, WebRTC, and Gun.js relay
- **Connection Registry**: Tracks successful connection methods for faster reconnection
- **Multi-peer Downloads**: Download files from multiple peers simultaneously
- **Adaptive Performance**: Adjusts connection parameters based on network conditions
- **File Integrity Verification**: SHA-256 verification of downloaded files
- **Progress Tracking**: Real-time progress monitoring for file transfers

## Installation

```bash
npm install @dignetwork/dig-nat-tools
```

## Quick Start

### Setting up a File Host

```typescript
import { createHost } from '@dignetwork/dig-nat-tools';

// Create a host that serves files
const host = createHost({
  hostFileCallback: async (fileHash, chunkIndex, chunkSize) => {
    // Implement your file serving logic here
    // Return a Buffer array with the requested chunk data
    return [Buffer.from('file data')];
  }
});

// Start the host
await host.start();
console.log(`Host ID: ${host.getId()}`);
```

### Downloading a File from a Peer

```typescript
import { createClient, downloadFile } from '@dignetwork/dig-nat-tools';

// Method 1: Using the FileClient class
const client = createClient();
const filePath = await client.downloadFile(
  'hostId', 
  'fileHash', 
  { savePath: './downloaded-file.dat' }
);

// Method 2: Using the convenience function
await downloadFile(
  'fileHash',
  './downloaded-file.dat',
  ['hostId1', 'hostId2'], // Multiple peers for redundancy
  { progressCallback: (received, total) => console.log(`${received}/${total} bytes`) }
);
```

### Using the Network Manager for Advanced Downloads

```typescript
import { NetworkManager } from '@dignetwork/dig-nat-tools';

const networkManager = new NetworkManager({
  // Basic configuration
  chunkSize: 64 * 1024, // 64KB chunks
  concurrency: 5,       // 5 concurrent downloads
  stunServers: ['stun:stun.l.google.com:19302'],
  
  // NAT traversal configuration
  localId: 'my-client-id', // Optional, random ID generated if not provided
  turnServer: 'turn:your-turn-server.com',
  turnUsername: 'username',
  turnPassword: 'password'
});

// Download a file from multiple peers
const result = await networkManager.downloadFile(
  ['peer1', 'peer2', 'peer3'],
  'file-sha256-hash',
  {
    savePath: './downloaded-file.dat',
    onProgress: (receivedBytes, totalBytes) => {
      console.log(`Downloaded ${receivedBytes}/${totalBytes} bytes`);
    },
    onPeerStatus: (peerId, status, bytesFromPeer) => {
      console.log(`Peer ${peerId}: ${status} (${bytesFromPeer} bytes)`);
    }
  }
);

console.log(`Download completed: ${result.path}`);
console.log(`Average speed: ${(result.averageSpeed / (1024 * 1024)).toFixed(2)} MB/s`);
```

### Complete "Hello World" File Transfer Example

This library includes a pair of simple examples that demonstrate a complete file transfer workflow:

1. **Simple Host Example**: Creates a text file containing "Hello World", calculates its hash, and serves it.
2. **Simple Client Example**: Prompts for the host ID, file hash, and IP address, downloads the file, and displays its contents.

To try it yourself:

1. In one terminal, run the host:
   ```bash
   npm run example:simple-host
   ```
   The host will display its ID, the file hash, and IP addresses.

2. In another terminal, run the client:
   ```bash
   npm run example:simple-client
   ```
   Enter the host ID, file hash, and IP address when prompted.

This pair of examples provides a complete demonstration of file sharing with NAT traversal between two peers.

## NAT Traversal Methods

The library implements multiple NAT traversal methods in order of reliability:

### 1. Direct TCP/UDP Connection

**Description:** Attempts a direct connection to the peer's publicly accessible IP and port.

**Requirements:** At least one peer must have a public IP or properly port-forwarded router.

**Example:**
```typescript
import { connectToPeer } from '@dignetwork/dig-nat-tools';

const connection = await connectToPeer('localId', 'remoteId', gunInstance);
// Connection will first try direct TCP/UDP if possible
```

### 2. UPnP (Universal Plug and Play)

**Description:** Automatically configures port forwarding on compatible routers.

**Requirements:** 
- Router must support UPnP and have it enabled
- No external infrastructure needed

**Example:**
```typescript
import { createUPnPMapping, getExternalAddressUPnP } from '@dignetwork/dig-nat-tools';

// Get external IP address
const externalIP = await getExternalAddressUPnP();
console.log(`External IP: ${externalIP}`);

// Create port mapping
const mapping = await createUPnPMapping({
  internalPort: 12345,
  externalPort: 12345,
  protocol: 'TCP',
  description: 'My P2P App',
  ttl: 7200 // seconds
});
```

### 3. NAT-PMP/PCP (NAT Port Mapping Protocol)

**Description:** Similar to UPnP but newer and more secure, automatically configures port forwarding.

**Requirements:**
- Router must support NAT-PMP or PCP
- No external infrastructure needed

### 4. TCP/UDP Hole Punching

**Description:** Uses a signaling server (Gun.js) to coordinate simultaneous connection attempts between peers.

**Requirements:**
- Gun.js instance for signaling
- Moderately permissive NATs that allow outbound connections to establish return paths

**Example:**
```typescript
import { performUDPHolePunch, performTCPHolePunch } from '@dignetwork/dig-nat-tools';

// UDP hole punching
const udpResult = await performUDPHolePunch({
  localId: 'your-local-id',
  remoteId: 'remote-peer-id',
  gun: gunInstance,
  localPort: 12345
});

// TCP hole punching
const tcpResult = await performTCPHolePunch({
  localId: 'your-local-id',
  remoteId: 'remote-peer-id',
  gun: gunInstance,
  localPorts: [12345, 12346, 12347]
});
```

### 5. ICE (Interactive Connectivity Establishment)

**Description:** Systematically tries multiple connection methods following the ICE protocol (RFC 8445).

**Requirements:**
- STUN servers for reflexive candidate discovery
- TURN servers for relay candidates (optional, but recommended)
- Gun.js for signaling

**Example:**
```typescript
import { connectWithICE } from '@dignetwork/dig-nat-tools';

const iceResult = await connectWithICE({
  localId: 'your-local-id',
  remoteId: 'remote-peer-id',
  signaling: gunInstance,
  stunServers: ['stun:stun.l.google.com:19302'],
  turnServer: 'turn:your-turn-server.com',
  turnUsername: 'username',
  turnPassword: 'password'
});
```

### 6. TURN Relay

**Description:** Last resort when direct connectivity fails. Routes all traffic through a relay server.

**Requirements:**
- TURN server (Traversal Using Relays around NAT)
- TURN server credentials

**Example:**
```typescript
import { createTURNAllocation, connectViaTURN } from '@dignetwork/dig-nat-tools';

// Create TURN allocation
const allocation = await createTURNAllocation({
  turnServer: 'turn:your-turn-server.com',
  turnUsername: 'username',
  turnPassword: 'password',
  protocol: 'TCP'
});

// Connect to peer through TURN
const socket = await connectViaTURN({
  turnServer: 'turn:your-turn-server.com',
  turnUsername: 'username',
  turnPassword: 'password',
  protocol: 'TCP',
  remotePeerAddress: 'peer-relayed-address',
  remotePeerPort: peerRelayedPort
});
```

### 7. Gun.js Relay

**Description:** Absolute fallback. Uses Gun.js to relay all file data when direct connectivity is impossible.

**Requirements:**
- Gun.js instance with peers configured
- Slowest method, but works in the most restrictive network environments

## External Infrastructure Requirements

To fully utilize all NAT traversal capabilities, you'll need:

### 1. Gun.js Server (Required for signaling)

Used for peer discovery and signaling for connection establishment.

**Setup Example:**
```javascript
// Server-side
const Gun = require('gun');
const server = require('http').createServer().listen(8765);
const gun = Gun({ web: server });
console.log('Gun server running on port 8765');

// Client-side
const gunOptions = {
  peers: ['http://your-gun-server.com:8765/gun']
};
```

### 2. STUN Servers (Highly recommended)

Used for discovering public IP addresses and ports. Public STUN servers are available, but for production use, consider running your own.

**Free Public Options:**
- stun:stun.l.google.com:19302
- stun:stun1.l.google.com:19302
- stun:stun.stunprotocol.org:3478

### 3. TURN Servers (Recommended for reliable connections)

Required for relaying traffic when direct connection is impossible. Unlike STUN servers, TURN servers consume significant bandwidth, so you'll likely need to run your own or pay for a service.

**Options:**
- Run your own using [coturn](https://github.com/coturn/coturn)
- Use a commercial TURN service

**Configuration Example:**
```typescript
const natOptions = {
  turnServer: 'turn:your-turn-server.com:3478',
  turnUsername: 'username',
  turnPassword: 'password'
};
```

## Development

### Setup

```bash
npm install
```

### Building

```bash
npm run build
```

### Examples

Run the included examples to see the library in action:

```bash
# Simple file transfer example
npm run example

# File hosting example
npm run example:host

# Client downloading example
npm run example:client

# Multi-peer download example
npm run example:multi-peer

# IP discovery example
npm run example:ip-discovery

# Simple "Hello World" host example
npm run example:simple-host

# Simple "Hello World" client example with IP prompting
npm run example:simple-client
```

## License

MIT 
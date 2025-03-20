# Dig NAT Tools

A JavaScript/TypeScript library for NAT traversal and peer-to-peer file sharing, with enhanced peer discovery and content availability management.

## Features

- **NAT Traversal**: Enable direct connections between peers, even when behind firewalls or NATs
- **Peer-to-Peer File Sharing**: Transfer files directly between peers
- **Multi-Protocol Peer Discovery**:
  - DHT-based peer discovery
  - PEX (Peer Exchange) discovery
  - Gun.js-based peer discovery for challenging NAT environments
- **Content Availability Management**: Track and verify which peers have which content
- **Content ID Mapping**: Associate human-readable names with content hashes
- **Persistent Storage**: Store peer and content information between sessions

## Installation

```bash
npm install @dignetwork/dig-nat-tools
```

## Basic Usage

### File Hosting

```typescript
import { createFileHost } from '@dignetwork/dig-nat-tools';

const host = createFileHost({
  port: 8080,
  directory: './shared-files',
  dhtEnabled: true
});

await host.start();

// Wait for connections
```

### File Client

```typescript
import { createFileClient } from '@dignetwork/dig-nat-tools';

const client = createFileClient();
await client.start();

// Find peers that have a specific file
const peers = await client.findPeers('file-hash');

// Download a file
await client.downloadFile('file-hash', './downloads/my-file.mp4', {
  progressCallback: (progress) => {
    console.log(`Download progress: ${Math.round(progress * 100)}%`);
  }
});

client.disconnect();
```

## Enhanced Peer Discovery with Gun.js

Gun.js integration provides powerful peer discovery capabilities, especially in challenging NAT environments.

```typescript
import { createGunDiscovery } from '@dignetwork/dig-nat-tools';
import Gun from 'gun';

// Create a Gun instance
const gun = Gun({
  peers: ['https://gun-server.example.com/gun'],
  localStorage: false,
  radisk: true
});

// Create a GunDiscovery instance
const gunDiscovery = createGunDiscovery({
  gun,
  nodeId: 'your-unique-node-id',
  persistenceEnabled: true
});

// Start the discovery service
await gunDiscovery.start();

// Announce yourself as a peer for a specific content hash
gunDiscovery.announce('content-hash', {
  port: 8080,
  contentId: 'my-video' // Optional human-readable ID
});

// Find peers for a specific content hash
const peers = await gunDiscovery.findPeers('content-hash');

// Map a content ID to a hash
gunDiscovery.mapContentIdToHash('my-video', 'content-hash');

// Find content hash by ID
const hash = await gunDiscovery.findHashByContentId('my-video');
```

## Content Availability Management

The content availability management system tracks which peers have which content and manages the announcement and verification process.

```typescript
import { 
  createContentAvailabilityManager,
  createDiscoveryContentIntegration
} from '@dignetwork/dig-nat-tools';

// Create a content availability manager
const contentManager = createContentAvailabilityManager({
  nodeId: 'your-node-id',
  gun: gunInstance,              // Optional Gun.js instance
  contentTTL: 3600000,           // Optional, default: 1 hour
  reannounceInterval: 1800000,   // Optional, default: 30 minutes
  enableVerification: true       // Optional, default: true
});

// Start the manager
await contentManager.start();

// Announce content availability
contentManager.announceContentAvailable('content-hash', {
  port: 8080,
  contentId: 'my-video'
});

// When you stop hosting content
contentManager.announceContentUnavailable('content-hash', 'my-video');

// Report unavailable content when a peer doesn't have what they claim
contentManager.reportContentUnavailable('peer-id', 'content-hash');

// Integration with discovery mechanisms
const integration = createDiscoveryContentIntegration({
  nodeId: 'your-node-id',
  gun: gunInstance
});

// Register discovery components
integration.registerDHTClient(dhtClient);
integration.registerPEXManager(pexManager);
integration.registerGunDiscovery(gunDiscovery);

// Filter out peers that don't have content
const validPeers = integration.filterPeersByContentStatus(allPeers, 'content-hash');
```

## Network Manager

For complete control over networking, you can use the NetworkManager directly:

```typescript
import { createNetworkManager } from '@dignetwork/dig-nat-tools';

const networkManager = createNetworkManager({
  port: 8080,
  dhtEnabled: true,
  pexEnabled: true,
  gunEnabled: true
});

await networkManager.start();

// Connect to a peer
const connection = await networkManager.connect({
  host: '192.168.1.100',
  port: 8080
});

// Send data
connection.send('Hello, peer!');

// Close the connection
connection.close();
```

## Documentation

For more detailed documentation, see the `/docs` directory:

- [API Reference](./docs/api.md)
- [Gun.js Integration](./docs/gun-integration.md)
- [Content Availability Management](./docs/content-availability-management.md)
- [Examples](./examples)

## License

MIT

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
  - [Setting up a File Host](#setting-up-a-file-host)
  - [Downloading a File](#downloading-a-file-from-a-peer)
  - ["Hello World" Example](#complete-hello-world-file-transfer-example)
- [System Architecture](#system-architecture)
  - [Host Creation Flow](#host-creation-and-file-announcement)
  - [Client Request Flow](#client-creation-and-file-request)
  - [Network Diagrams](#network-overview-diagram)
- [Core Components](#core-exported-methods)
- [NAT Traversal Methods](#nat-traversal-methods)
- [Peer Discovery](#peer-discovery-methods)
- [DHT Sharding](#dht-sharding)
- [Advanced Usage](#scalability-enhancements)
- [Infrastructure Requirements](#external-infrastructure-requirements)
- [API Reference](#api-reference)
- [License](#license)

## Features

- **NAT Traversal**: Automatically detect and traverse NAT devices using a combination of techniques:
  - UPnP for automatic port forwarding
  - NAT-PMP/PCP for port mapping on compatible routers
  - STUN for NAT type detection
  - Relay through intermediary servers when direct connection is not possible
  - WebRTC for browser-to-browser and peer-to-peer connectivity
- **Dual-stack IPv4/IPv6 Support**: Enable native IPv6 connectivity alongside IPv4
  - Seamless dual-stack operation with automatic address selection
  - Support for both IPv4-only and IPv6-only environments
  - Built-in fallback mechanisms to ensure connectivity
- **Efficient peer discovery**: Find peers that have the file you're looking for through:
  - Distributed Hash Table (DHT) network
  - Local network discovery using multicast DNS
  - Peer Exchange (PEX) 
  - DHT sharding for improved scalability
- **P2P Protocol Support**: TCP, UDP, WebRTC, and Gun.js relay
- **Connection Registry**: Tracks successful connection methods for faster reconnection
- **Multi-peer Downloads**: Download files from multiple peers simultaneously
- **BitTorrent-like Mechanisms**: Piece selection, endgame mode, bandwidth management, and peer incentives
- **Adaptive Performance**: Adjusts connection parameters based on network conditions
- **File Integrity Verification**: SHA-256 verification of downloaded files
- **Progress Tracking**: Real-time progress monitoring for file transfers
- **Peer Discovery**: DHT, PEX (Peer Exchange), and Local Network Discovery
- **Directory Watching**: Automatically announce files in a directory, with real-time monitoring for changes
- **DHT Sharding**: Hosts can handle specific portions of the DHT space, with support for random shard selection

## Installation

```bash
npm install @dignetwork/dig-nat-tools
```

## Quick Start

### Setting up a File Host

```typescript
import { createFileHost } from '@dignetwork/dig-nat-tools';

async function setupHost() {
  // Initialize the file host
  const host = await createFileHost({
    // Directory to share files from
    directory: './shared-files',
    
    // TCP port to listen on (0 = random available port)
    port: 0,
    
    // Options
    options: {
      // Enable various NAT traversal methods
      enableUPnP: true,
      enableNatPmp: true,
      
      // Enable IPv6 support (new feature)
      enableIPv6: true,
      
      // Enable file watching to automatically announce new files
      enableWatcher: true
    }
  });

  // The host is now running and will announce files
  console.log(`Host started on port ${host.port}`);
  
  // To stop the host when no longer needed
  // await host.stop();
}

setupHost().catch(console.error);
```

### Downloading a File from a Peer

```typescript
import { downloadFile } from '@dignetwork/dig-nat-tools';

async function downloadExample() {
  try {
    // Download a file by its hash
    const result = await downloadFile({
      // SHA-256 hash of the file to download
      fileHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      
      // Directory to save the downloaded file
      outputDir: './downloads',
      
      // Options
      options: {
        // Enable NAT traversal
        enableNatTraversal: true,
        
        // Enable IPv6 support for faster, dual-stack connectivity
        enableIPv6: true,
        
        // Maximum number of peers to download from simultaneously
        maxPeers: 5,
        
        // Progress callback (optional)
        onProgress: (progress) => {
          console.log(`Download progress: ${Math.round(progress * 100)}%`);
        }
      }
    });
    
    console.log(`File downloaded successfully to: ${result.filePath}`);
  } catch (error) {
    console.error('Download failed:', error);
  }
}

downloadExample();
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

## What Happens During a File Download

When you call `downloadFile()`, a sophisticated series of operations takes place:

### 1. Connection Establishment
- Creates a `NetworkManager` instance to handle the download
- Attempts to connect to the provided peers in parallel
- Uses NAT traversal techniques as needed (direct, UPnP, hole punching, etc.)
- Establishes and maintains a connection pool

### 2. File Metadata Retrieval
- Requests metadata about the file (total size, chunk count)
- Verifies consistency across multiple peers
- Prepares local storage for the download

### 3. BitTorrent-like Download Process
- **Piece Selection**: Implements "rarest first" strategy to prioritize rare chunks
- **Bandwidth Management**: Dynamically adjusts concurrent downloads based on network conditions
- **Peer Selection**: Evaluates and selects the best-performing peers
- **Endgame Mode**: When download is nearly complete (95%), requests remaining pieces from multiple peers simultaneously to avoid the "last piece problem"

### 4. Chunk Download and Verification
- Downloads chunks from peers in parallel
- Writes chunks to temporary storage
- Tracks progress and reports via callbacks
- Evaluates peer performance continuously
- Deprioritizes or drops underperforming peers

### 5. File Finalization
- Combines all chunks into the final file
- Calculates SHA-256 hash of the complete file
- Verifies the hash matches the requested file hash
- Cleans up temporary files and connections
- Returns detailed download statistics

### 6. Peer Incentive Mechanisms
- Tracks peer contributions
- Implements a "tit-for-tat" like mechanism that prioritizes peers that contribute more
- Manages "choking" and "unchoking" of peers to ensure fairness

## Core Exported Methods

| Method | Description |
|--------|-------------|
| `createHost()` | Creates a file hosting server that can share files with peers |
| `createClient()` | Creates a client for downloading files from peers |
| `createNetworkManager()` | Creates a manager for multi-peer downloads with advanced options |
| `downloadFile()` | Convenience function for downloading a file from multiple peers |
| `connectToPeer()` | Establishes a connection to a remote peer using the best available method |
| `findPeers()` | Discovers peers with specific content using DHT, PEX, and local discovery |
| `announceFile()` | Announces that you have a file available for other peers to discover |
| `calculateSHA256()` | Calculates the SHA-256 hash of data (Buffer, string, or file) |
| `discoverPublicIPs()` | Discovers the public IP addresses of the current machine |

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
import { TURNClient, createTURNAllocation } from '@dignetwork/dig-nat-tools';

// Create TURN client
const turnClient = new TURNClient();

// Request allocation
const allocation = await turnClient.requestAllocation({
  turnServer: 'turn:your-turn-server.com',
  turnUsername: 'username',
  turnPassword: 'password',
  protocol: 'TCP'
});

console.log(`TURN relayed address: ${allocation.relayedAddress}:${allocation.relayedPort}`);
```

## Peer Discovery Methods

The library includes multiple mechanisms to discover peers sharing specific content. These methods work together to maximize your chances of finding relevant peers in any network environment.

### How Peer Discovery Works

The peer discovery system uses a multi-layered approach with four complementary mechanisms:

#### 1. DHT (Distributed Hash Table)
- **How it works**: Implements a Kademlia-based DHT similar to BitTorrent's, where peers and content are mapped to IDs in the same address space.
- **Discovery process**: 
  - A peer calculates the "info hash" of a file (SHA-256 hash)
  - It queries the DHT network for peers that have announced they have this hash
  - The query is routed through the DHT network, hopping from node to node
  - Each hop brings it closer to nodes that have announced they have the content
- **Scope**: Global - can discover peers anywhere on the internet
- **Reliability**: Medium - depends on DHT network health and whether peers have announced themselves

#### 2. PEX (Peer Exchange)
- **How it works**: Once connected to at least one peer, that peer shares information about other peers it knows.
- **Discovery process**:
  - After connecting to an initial peer, you request its list of known peers
  - These peers are added to your peer list
  - As you connect to more peers, your knowledge of the network expands exponentially
- **Scope**: Network-local - limited to the connected swarm of peers
- **Reliability**: High within a connected swarm - if peers are actively sharing

#### 3. Local Network Discovery
- **How it works**: Uses UDP multicast on the local network to discover nearby peers.
- **Discovery process**:
  - Sends announcement/query messages to a multicast address
  - Peers on the same network respond with their info
  - Specifically announces the info hashes of files being shared
- **Scope**: Local network only
- **Reliability**: Very high within local networks, useless across the internet

#### 4. Gun.js Discovery
- **How it works**: Uses Gun.js, a decentralized real-time graph database, to announce and discover peers.
- **Discovery process**:
  - Peers announce their content hashes to a Gun.js network
  - Other peers query the Gun.js network for these announcements
  - Gun.js provides real-time updates when new peers join
  - Persistent storage keeps information between sessions
- **Scope**: Global - can discover peers anywhere with access to the Gun.js network
- **Reliability**: High - works across NATs and firewalls using relay servers when needed
- **Additional benefits**:
  - Content mapping (map human-readable content IDs to file hashes)
  - Persistence of peer information between sessions
  - Real-time notification of new peers
  - Cross-NAT discovery even in challenging network environments

#### 5. Integrated Discovery Manager
- Combines all four mechanisms through the `PeerDiscoveryManager` class
- Prioritizes peers based on source reliability and reachability
- Deduplicates peers discovered through multiple mechanisms

### Will All Hosts Eventually Be Discovered?

**Yes, with some conditions:**

1. **For DHT-announced peers**: If a host has announced itself to the DHT with the correct info hash, it will eventually be discovered if:
   - The DHT network has sufficient active nodes
   - There is at least one common bootstrap node between the searching peer and the host
   - Neither peer is behind a NAT that blocks UDP (DHT uses UDP)

2. **For swarm-connected peers**: Any peer connected to the swarm will eventually be discovered through PEX if:
   - There's at least one peer in common between the searcher and the host
   - The network has enough peers sharing PEX information
   - Peers remain connected long enough for PEX information to propagate

3. **For local network peers**: All peers on the same local network will be discovered almost immediately if:
   - UDP multicast is not blocked on the network
   - Peers are actively sending/listening for announcements
   
4. **For Gun.js announced peers**: Peers that have announced themselves via Gun.js will be discovered if:
   - Both peers are connected to common Gun.js relay servers
   - Gun.js relay servers are accessible
   - Even peers behind restrictive NATs can be discovered

### Discovery Timeline

The discovery timeline varies by mechanism:

- **Local Discovery**: Nearly instant (milliseconds to seconds)
- **Gun.js Discovery**: Fast (seconds) with real-time updates
- **DHT Discovery**: Moderate speed (seconds to minutes)
- **PEX Discovery**: Progressive (starts fast with close peers, expands over time)

### Using Gun.js for Peer Discovery

Gun.js provides a powerful addition to our peer discovery capabilities, especially valuable in challenging NAT environments or when you need human-readable content IDs.

```typescript
import { NetworkManager } from '@dignetwork/dig-nat-tools';
import Gun from 'gun';

// Create a Gun.js instance
const gun = Gun({
  peers: ['https://gun-relay.example.com/gun'], // Gun relay servers
  file: './.gun-data' // Local persistence
});

// Initialize NetworkManager with Gun.js
const network = new NetworkManager({
  gunOptions: {
    gun: gun // Pass your Gun instance
  }
});

// Start the network
await network.start();

// Share a file with a human-readable content ID
await network.addContentMapping('my-awesome-video', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

// Later, find peers for this content using the readable ID
const peers = await network.findPeers('my-awesome-video');

// Or use the GunDiscovery class directly for more control
import { GunDiscovery } from '@dignetwork/dig-nat-tools';

const gunDiscovery = new GunDiscovery({
  gun: gun,
  nodeId: 'your-unique-node-id',
  announceInterval: 60000, // Announce every minute
  peerTTL: 3600000 // Keep peers for 1 hour
});

await gunDiscovery.start();
gunDiscovery.addInfoHash('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
gunDiscovery.addContentMapping('my-awesome-video', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

// Find peers with this content
const discoveredPeers = await gunDiscovery.findPeers('my-awesome-video');
```

For more information about using Gun.js for peer discovery, see the [Gun Peer Discovery documentation](docs/gun-peer-discovery.md).

## External Infrastructure Requirements

Depending on your use case, the following external infrastructure may be required:

### Required for Basic Functionality
- **Node.js Runtime**: v14.x or higher
- **Gun.js Instance**: For signaling between peers (required for NAT traversal)
  - Can be self-hosted or use a public instance

### Required for Advanced NAT Traversal
- **STUN Servers**: For discovering public IP/port mappings
  - Default: Google's public STUN servers (stun.l.google.com:19302)
  - Recommendation: Set up your own STUN server for production use
  
- **TURN Servers**: For relay when direct connections fail
  - Not included by default, must be provided
  - Recommended software: Coturn, restund
  - Requires the most resources of all infrastructure components
  - Critical for reliable connectivity in challenging network environments

### Optional for Enhanced Discovery
- **DHT Bootstrap Nodes**: For bootstrapping into the DHT network
  - Default nodes are provided, but may want to run your own
  - Recommendation: Set up dedicated bootstrap nodes for private DHT networks

### Bandwidth and Resource Considerations
- **TURN Server Bandwidth**: Plan for 2x the bandwidth of your peak traffic (data passes through the server twice)
- **Gun.js Storage**: Signaling data is typically small but can accumulate over time
- **DHT Bootstrap Nodes**: Moderate traffic, scales with network size

## Scalability Enhancements

The library now includes significant scalability improvements to better handle large networks:

### Node Types

Configure your usage based on the available resources:

```typescript
import { createHost, NODE_TYPE } from '@dignetwork/dig-nat-tools';

// Create a light node (less resource usage)
const lightHost = createHost({
  nodeType: NODE_TYPE.LIGHT,
  // other options...
});

// Create a standard node (default)
const standardHost = createHost({
  nodeType: NODE_TYPE.STANDARD,
  // other options...
});

// Create a super node (high resource availability)
const superHost = createHost({
  nodeType: NODE_TYPE.SUPER,
  // other options...
});
```

| Node Type | Description | Recommended For |
|-----------|-------------|-----------------|
| `LIGHT` | Minimal resource usage with restricted caching and limited peers | Mobile devices, IoT, resource-constrained environments |
| `STANDARD` | Balanced resource usage (default) | Desktop applications, regular usage |
| `SUPER` | High resource usage with extensive caching and peer tracking | Servers, high-bandwidth nodes, hub nodes |

### Memory Management Features

The library implements several memory-efficient strategies:

- **LRU Caching**: Automatically manages cache size based on node type
- **Persistent Storage**: Optionally persist routing tables and peer information between sessions
- **DHT Sharding**: Nodes can be responsible for specific hash prefixes to distribute load
- **Priority Announcement**: Three levels of announcement priority (HIGH, MEDIUM, LOW)

Example with persistent storage:

```typescript
import { announceFile, NODE_TYPE, AnnouncePriority } from '@dignetwork/dig-nat-tools';

// Announce a file with persistence
const discoveryManager = await announceFile(
  'fileHash', 
  8000, 
  {
    nodeType: NODE_TYPE.STANDARD,
    enablePersistence: true,
    persistenceDir: './persistence',
    priority: AnnouncePriority.HIGH // High priority keeps in memory
  }
);
```

Example of DHT sharding:

```typescript
import { createHost, NODE_TYPE } from '@dignetwork/dig-nat-tools';

// Create a host that only handles a portion of the DHT space
const shardedHost = createHost({
  nodeType: NODE_TYPE.STANDARD,
  dhtOptions: {
    shardPrefixes: ['00', '01', '02'] // Only handle hashes starting with these prefixes
  }
});
```

## API Reference

For a complete API reference, see the [API Documentation](https://dignetwork.github.io/dig-nat-tools/).

## License

MIT 

## System Architecture

To better understand how the entire system functions, this section provides a detailed explanation of the architecture and flow of operations when creating hosts, creating clients, and requesting files.

### Host Creation and File Announcement

When you create a host and announce files, the following happens:

```
                          ┌────────────────────────────────┐
                          │            createHost()         │
                          └────────────────┬───────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Host Creation                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Generate unique host ID (UUID)                                           │
│ 2. Set up file serving callback                                             │
│ 3. Initialize NAT traversal components (TCP, UDP, WebRTC)                   │
│ 4. Configure discovery options                                              │
│ 5. Set up Gun.js instance for signaling                                     │
└───────────────────────────────────────┬─────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                               host.start()                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Start TCP/UDP servers                                                    │
│ 2. Apply port mappings (UPnP/NAT-PMP if enabled)                            │
│ 3. Register with Gun.js network                                             │
│ 4. Initialize directory watcher (if configured)                             │
│ 5. Set up DHT node (if enabled)                                             │
└───────────────────────────────────────┬─────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              announceFile()                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Calculate SHA-256 hash of file (if not provided)                         │
│ 2. Create PeerDiscoveryManager                                              │
│ 3. Announce file to DHT network                                             │
│ 4. Set up local network announcements                                       │
│ 5. Enable PEX for this file                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

After this process, the host:
- Has open TCP/UDP ports (either via direct binding or port forwarding)
- Is registered in the Gun.js network for signaling
- Has announced file(s) to the DHT, local network, and for PEX
- Is ready to serve file chunks upon request
- Can be discovered by other peers

### Client Creation and File Request

When a client is created and requests a file, the following sequence occurs:

```
                          ┌────────────────────────────────┐
                          │           createClient()        │
                          └────────────────┬───────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Client Creation                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Generate unique client ID (UUID)                                         │
│ 2. Set up Gun.js instance for signaling                                     │
│ 3. Initialize NAT traversal components                                      │
│ 4. Configure discovery options                                              │
└───────────────────────────────────────┬─────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         client.downloadFile() / downloadFile()              │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Create NetworkManager for multi-peer coordination                        │
│ 2. If given specific peers, connect directly                                │
│ 3. If not, use findPeers() to discover hosts with the file                  │
└───────────────────────────────────────┬─────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Peer Connection                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ Attempt connections in the following order:                                 │
│ 1. Direct TCP/UDP connection (if public IP/port available)                  │
│ 2. UPnP/NAT-PMP port forwarding                                            │
│ 3. TCP/UDP hole punching via Gun.js signaling                               │
│ 4. WebRTC connection with ICE/STUN                                          │
│ 5. TURN relay (last resort)                                                 │
└───────────────────────────────────────┬─────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              File Download                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Request file metadata from connected peers                               │
│ 2. Create download strategy (rarest-first piece selection)                  │
│ 3. Request chunks in parallel from multiple peers                           │
│ 4. Apply incentive mechanisms (choking/unchoking)                           │
│ 5. Write chunks to temporary storage                                        │
│ 6. Switch to endgame mode when download is nearly complete                  │
│ 7. Verify complete file hash                                                │
│ 8. Finalize download and clean up connections                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Network Overview Diagram

This diagram shows the complete system architecture with all its components:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DIG NAT Tools Network Architecture                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐                                              ┌──────────┐     │
│  │          │◄────────── Direct TCP/UDP ─────────────────►│          │     │
│  │          │                                              │          │     │
│  │          │◄─────────── WebRTC/ICE ──────────────────►  │          │     │
│  │   Host   │                                              │  Client  │     │
│  │          │◄──────── Gun.js Signaling ────────────────► │          │     │
│  │          │                                              │          │     │
│  │          │◄─────────── TURN Relay ──────────────────►  │          │     │
│  └──────┬───┘                                              └────┬─────┘     │
│         │                                                       │           │
│         │                  ┌─────────────┐                      │           │
│         │                  │ STUN Server │                      │           │
│         │                  └──────┬──────┘                      │           │
│         │                         │                             │           │
│         ▼                         ▼                             ▼           │
│  ┌──────────┐              ┌────────────┐               ┌──────────┐       │
│  │          │              │            │               │          │       │
│  │   DHT    │◄────────────►│  Gun.js    │◄─────────────►│   DHT    │       │
│  │ Network  │              │  Network   │               │ Network  │       │
│  │          │              │            │               │          │       │
│  └──────────┘              └────────────┘               └──────────┘       │
│         ▲                         ▲                             ▲           │
│         │                         │                             │           │
│         │                  ┌──────┴──────┐                      │           │
│         │                  │ TURN Server │                      │           │
│         │                  └─────────────┘                      │           │
│         │                                                       │           │
│  ┌──────┴───┐                                              ┌────┴─────┐     │
│  │          │◄─── Local Network Discovery (UDP Multicast)──►│          │     │
│  │  Other   │                                              │  Other   │     │
│  │  Hosts   │◄────────────── Peer Exchange ──────────────► │ Clients  │     │
│  └──────────┘                                              └──────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### File Chunk Flow Diagram

When downloading a file from multiple peers, chunks are requested and assembled as follows:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           File Chunk Flow                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────┐     ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐     ┌──────────────┐      │
│   │ Host 1   │───►   Chunks: 1, 4, 7, 10...     │     │              │      │
│   └──────────┘     └ ─ ─ ─ ─ ─ ─ ─ ─┬─ ─ ─ ─ ─ ─┘     │              │      │
│                                     │                  │              │      │
│   ┌──────────┐     ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐      │  Network     │      │
│   │ Host 2   │───►   Chunks: 2, 5, 8, 11...     │─────►│  Manager    │      │
│   └──────────┘     └ ─ ─ ─ ─ ─ ─ ─ ─┬─ ─ ─ ─ ─ ─┘      │              │      │
│                                     │                  │ (Assembles   │      │
│   ┌──────────┐     ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐      │  Complete    │      │
│   │ Host 3   │───►   Chunks: 3, 6, 9, 12...     │─────►│  File)      │      │
│   └──────────┘     └ ─ ─ ─ ─ ─ ─ ─ ─┬─ ─ ─ ─ ─ ─┘      │              │      │
│                                     │                  │              │      │
│                                     │                  └──────┬───────┘      │
│                                     │                         │              │
│                                     ▼                         ▼              │
│                    ┌───────────────────────────────┐  ┌───────────────────┐ │
│                    │ - Rarest first piece selection │  │ SHA-256 verified  │ │
│                    │ - Dynamic peer evaluation      │  │ complete file     │ │
│                    │ - Parallel download streams    │  └───────────────────┘ │
│                    │ - Endgame mode near completion │                        │
│                    └───────────────────────────────┘                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### DHT Sharding Visualization

The DHT sharding feature distributes the load across the network:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DHT Sharding                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│       File Hashes (SHA-256)                  Responsible Hosts              │
│  ┌───────────────────────────────┐      ┌───────────────────────────┐      │
│  │                               │      │                           │      │
│  │   00xxxxxxxxxxxxxxxxxxxxxxxx  │─────►│  Host 1 (Prefixes: 00,01) │      │
│  │   01xxxxxxxxxxxxxxxxxxxxxxxx  │─────►│                           │      │
│  │                               │      └───────────────────────────┘      │
│  │   02xxxxxxxxxxxxxxxxxxxxxxxx  │─────►┌───────────────────────────┐      │
│  │   03xxxxxxxxxxxxxxxxxxxxxxxx  │─────►│  Host 2 (Prefixes: 02,03) │      │
│  │                               │      └───────────────────────────┘      │
│  │   04xxxxxxxxxxxxxxxxxxxxxxxx  │─────►┌───────────────────────────┐      │
│  │   05xxxxxxxxxxxxxxxxxxxxxxxx  │─────►│  Host 3 (Prefixes: 04-07) │      │
│  │   06xxxxxxxxxxxxxxxxxxxxxxxx  │─────►│                           │      │
│  │   07xxxxxxxxxxxxxxxxxxxxxxxx  │─────►└───────────────────────────┘      │
│  │                               │                                         │
│  │                  ...          │                  ...                     │
│  │                               │                                         │
│  │   F8xxxxxxxxxxxxxxxxxxxxxxxx  │─────►┌───────────────────────────┐      │
│  │   F9xxxxxxxxxxxxxxxxxxxxxxxx  │─────►│  Host N (Prefixes: F8-FF) │      │
│  │   FAxxxxxxxxxxxxxxxxxxxxxxxx  │─────►│                           │      │
│  │   FFxxxxxxxxxxxxxxxxxxxxxxxx  │─────►└───────────────────────────┘      │
│  └───────────────────────────────┘                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

These diagrams visualize the key aspects of the system's architecture and provide a comprehensive understanding of how the library functions when creating hosts, creating clients, and requesting files. The multi-layered approach to peer discovery and the BitTorrent-like download mechanism ensure robust, scalable, and efficient file sharing across various network environments. 

## Advanced Usage

### IPv6 Support

DIG NAT Tools provides native dual-stack IPv4/IPv6 support. When enabled, the library can:

- Listen for connections on both IPv4 and IPv6 interfaces
- Discover peers on both IPv4 and IPv6 networks
- Connect to both IPv4 and IPv6 peers

To enable IPv6 support:

```typescript
// When creating a file host
const host = await createFileHost({
  directory: './shared-files',
  port: 0,
  options: {
    enableIPv6: true
  }
});

// When setting up peer discovery
const discoveryManager = new PeerDiscoveryManager({
  enableIPv6: true,
  enableDHT: true
});

// When downloading files
await downloadFile({
  fileHash: 'your-file-hash',
  outputDir: './downloads',
  options: {
    enableIPv6: true
  }
});
```

IPv6 support is disabled by default for backward compatibility. When enabled, the system will create dual-stack sockets that can handle both IPv4 and IPv6 traffic. This allows for seamless connectivity in mixed network environments.

### Network Manager

### New Features

#### Continuous Peer Discovery During Downloads

The library now supports continuous peer discovery during the download process. When enabled (which it is by default), the file downloads will automatically:

1. Keep searching for additional peers who have the file while downloading
2. Connect to newly discovered peers automatically
3. Add these peers to the download process to increase download speeds and redundancy

This ensures your downloads are as fast and reliable as possible, dynamically adapting to network conditions and peer availability.

##### Usage

This feature is enabled by default, but can be configured:

```javascript
// Create a network manager with continuous discovery enabled
const networkManager = new NetworkManager({
  enableContinuousDiscovery: true, // default is true
  maxPeers: 15 // maximum number of peers to connect to (default: 10)
});

// Toggle it on/off at runtime
networkManager.setEnableContinuousDiscovery(false); // disable
networkManager.setEnableContinuousDiscovery(true);  // enable
```

##### Benefits

- **Resilience to peer failures**: Automatically adds new peers when others become unavailable
- **Better download speeds**: Dynamically adds faster peers when discovered
- **Improved success rate**: Less likely to fail due to insufficient peers
- **Optimization for large files**: Particularly valuable for large file transfers where peers may come and go
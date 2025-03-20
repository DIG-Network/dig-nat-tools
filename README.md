# DIG NAT Tools

Decentralized P2P file transfer with comprehensive NAT traversal capabilities.

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

The peer discovery system uses a multi-layered approach with three complementary mechanisms:

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

#### 4. Integrated Discovery Manager
- Combines all three mechanisms through the `PeerDiscoveryManager` class
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

### Discovery Timeline

The discovery timeline varies by mechanism:

- **Local Discovery**: Nearly instant (milliseconds to seconds)
- **DHT Discovery**: Moderate speed (seconds to minutes)
- **PEX Discovery**: Progressive (starts fast with close peers, expands over time)

### Announcing Files You Have Available

For your files to be discoverable by other peers, you must **explicitly announce** them:

```typescript
import { announceFile, calculateSHA256 } from '@dignetwork/dig-nat-tools';

// 1. Calculate the SHA-256 hash of your file
const fileHash = await calculateSHA256('/path/to/your/file.dat');

// 2. Announce that you have this file (using your host's listening port)
const discoveryManager = await announceFile(fileHash, 12345, {
  // Optional: Configure which discovery mechanisms to use
  enableDHT: true,     // Announce to the global DHT network
  enablePEX: true,     // Share with peers you connect to
  enableLocal: true    // Announce on your local network
});

// 3. Keep the discovery manager running as long as you're sharing the file
// When you're done sharing, call:
await discoveryManager.stop();
```

This announcement makes your file discoverable through all available mechanisms:
- It's registered in the DHT, allowing global discovery
- It's shared with peers via PEX as you connect to them
- It's broadcast on your local network for fast local discovery

**Note:** Without explicitly announcing your files, they won't be discoverable by peers using the `findPeers()` function. Each file you want to share must be individually announced.

### Peer Discovery Implementation Examples

#### 1. DHT (Distributed Hash Table)

**Requirements:**
- Bootstrap nodes (default or custom)
- Open UDP ports for DHT traffic

**Example:**
```typescript
import { DHTClient } from '@dignetwork/dig-nat-tools';

const dht = new DHTClient({
  bootstrapNodes: [
    { address: 'router.bittorrent.com', port: 6881 }
  ]
});

await dht.start();
const peers = await dht.findPeers('info-hash-of-content');
console.log(`Found ${peers.length} peers with the content`);
```

#### 2. PEX (Peer Exchange)

**Requirements:**
- At least one initial peer connection
- No external infrastructure needed

**Example:**
```typescript
import { PexManager } from '@dignetwork/dig-nat-tools';

const pex = new PexManager({
  maxPeers: 100,
  peerExpiration: 30 * 60 * 1000 // 30 minutes
});

pex.start();
pex.on('peer:discovered', (peer) => {
  console.log(`Discovered new peer: ${peer.address}:${peer.port}`);
});
```

#### 3. Local Network Discovery

**Requirements:**
- Local network access
- UDP multicast support
- No external infrastructure needed

**Example:**
```typescript
import { LocalDiscovery } from '@dignetwork/dig-nat-tools';

const discovery = new LocalDiscovery();
await discovery.start(12345); // Local TCP port you're listening on

discovery.on('peer:discovered', (peer) => {
  console.log(`Discovered local peer: ${peer.address}:${peer.port}`);
});

// Announce a specific info hash (content identifier)
discovery.addInfoHash('info-hash-of-content');
```

#### 4. Integrated Peer Discovery

**Example with more control:**
```typescript
import { PeerDiscoveryManager } from '@dignetwork/dig-nat-tools';

// Create discovery manager with all methods enabled
const discoveryManager = new PeerDiscoveryManager({
  enableDHT: true,       // Use the DHT
  enablePEX: true,       // Use peer exchange
  enableLocal: true,     // Use local network discovery
  announcePort: 12345    // The port we're listening on
});

// Start discovery
await discoveryManager.start();

// Add the info hash of the file we're looking for
await discoveryManager.addInfoHash('info-hash-of-file');

// Find peers with this file
const discoveredPeers = await discoveryManager.findPeers('info-hash-of-file');

// Listen for newly discovered peers over time
discoveryManager.on('peer:discovered', (peer) => {
  console.log(`New peer found: ${peer.address}:${peer.port}`);
});
```

**Simple interface:**
```typescript
import { findPeers } from '@dignetwork/dig-nat-tools';

// Find peers with specific content using all available methods
const peers = await findPeers('info-hash-of-content', 12345, {
  enableDHT: true,
  enablePEX: true,
  enableLocal: true
});

console.log(`Found ${peers.length} peers with the content`);
```

#### 5. Manually Adding Peers

If you know a peer's details in advance or want to connect to specific peers without discovery, you can manually add them:

```typescript
import { addManualPeer } from '@dignetwork/dig-nat-tools';

// Add a known peer manually
const discoveryManager = await addManualPeer(
  'peer-id-123',           // Unique ID of the peer
  '192.168.1.100',         // IP address
  8000,                    // Port
  {
    infoHash: 'file-hash', // Optional: associate with a specific file
    enablePEX: true        // Optional: enable PEX for subsequent discoveries
  }
);

// The peer is now available in the discovery manager
// You can use it with the network manager for downloads
const networkManager = new NetworkManager();
await networkManager.downloadFile(
  ['peer-id-123'],         // The manually added peer ID
  'file-hash',             // The file to download
  { savePath: './downloaded-file.dat' }
);
```

This approach is useful when:
- You have a known list of peers from an external source
- You're building a private network with predefined peers
- You want to connect to specific peers without waiting for discovery

### Maximizing Discovery Success

To ensure the best chance of discovering all available hosts:

1. **Announce your content**: Make sure hosts announce their files to the DHT
2. **Stay connected**: Maintain connections to discovered peers to benefit from PEX
3. **Use multiple bootstrap nodes**: Configure with several DHT bootstrap nodes
4. **Combine all methods**: Always use all three discovery mechanisms together
5. **Allow sufficient time**: Some peers may take longer to discover, especially in sparse networks

The beauty of this multi-layered approach is that it's resilient - even if one mechanism fails, the others can still function, ensuring that in most network conditions, peers will eventually find each other.

### Example of DHT Sharding

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

### Shard Hosts with Random DHT Sharding

For better load distribution in large networks, hosts can be configured to randomly select which portions of the DHT space they will handle:

```typescript
import { createHost, NODE_TYPE } from '@dignetwork/dig-nat-tools';

// Create a shard host with random shard selection
const shardHost = createHost({
  hostFileCallback: myFileCallback,
  nodeType: NODE_TYPE.STANDARD,
  
  // Enable shard host mode with random shard selection
  isShardHost: true,
  
  // Configure DHT options (all are optional)
  dhtOptions: {
    // Number of shard prefixes to select (default: 3)
    numShardPrefixes: 4,
    
    // Length of each prefix in hex characters (default: 2)
    shardPrefixLength: 2
  }
});

// Start the host
await shardHost.start();

// Get the randomly selected shard prefixes
const shardPrefixes = shardHost.getShardPrefixes();
console.log(`Host is handling these DHT prefixes: ${shardPrefixes.join(', ')}`);
```

With random sharding, each host takes responsibility for a subset of the DHT space, helping to distribute load more evenly. When many hosts use this feature, the entire DHT space is covered while preventing any single host from becoming overloaded.

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

// ... existing content continues ... 
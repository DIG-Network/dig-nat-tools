# Dig NAT Tools: Technical Whitepaper

## Executive Summary

Dig NAT Tools is a comprehensive JavaScript/TypeScript library designed to facilitate decentralized peer-to-peer file sharing across challenging network environments. The library implements multiple NAT traversal techniques, peer discovery mechanisms, and content availability management systems to ensure reliable file transfers between peers, even when they are behind restrictive firewalls or NAT configurations.

This whitepaper provides an in-depth technical explanation of the Dig NAT Tools architecture, components, and operational flows, with particular focus on file hosting and downloading processes. It details how the system overcomes common networking challenges in peer-to-peer applications and introduces novel approaches like Gun.js integration and content availability consensus mechanisms.

---

## 1. Introduction

### 1.1 Background and Motivation

Peer-to-peer (P2P) file sharing continues to be a foundational technology for distributed applications, but faces persistent challenges in modern network environments:

- Network Address Translation (NAT) devices prevent direct connections between peers
- Symmetric NATs and corporate firewalls block traditional hole-punching techniques
- Dynamic IP addresses and port mappings complicate peer discovery
- Content availability cannot be guaranteed as peers join and leave the network
- False announcements and malicious peers can disrupt network reliability

Dig NAT Tools addresses these challenges with a multi-layered approach that combines established P2P technologies with novel solutions for NAT traversal and content management.

### 1.2 Key Components

The Dig NAT Tools system consists of the following major components:

- **Network Manager**: Coordinates all network interactions and connection strategies
- **NAT Traversal Subsystem**: Implements multiple connection techniques
- **Peer Discovery System**: Finds peers across multiple discovery mechanisms
- **Content Availability Manager**: Tracks and verifies content availability
- **File Transfer Protocol**: Handles chunked file transfers with verification
- **Host and Client Interfaces**: Simplified APIs for file hosting and downloading

```

+-------------------+       +---------------------+
|  Application      |       |                     |
|  -------------    |       |                     |
|  FileHost         |<----->|  NetworkManager     |
|  FileClient       |       |                     |
+-------------------+       +----------+----------+
                                       |
                                       v
+-----------------------+   +------------------------+
|                       |   |                        |
| NAT Traversal         |<->| Peer Discovery         |
| ---------------       |   | -----------------      |
| UPnP/NAT-PMP          |   | PEX                    |
| TCP/UDP Hole Punching |   | Local Network          |
| ICE Protocol          |   | Gun.js                 |
| TURN Relay            |   |                        |
+-----------------------+   +------------------------+
          |                              |
          v                              v
+----------------------------+   +------------------------+
|                            |   |                        |
| Cryptographic Identity     |<->| Content Availability   |
| ---------------------      |   | -----------------      |
| CryptoIdentity             |   | AnnouncementSystem     |
| AuthenticatedFileHost      |   | ReportingSystem        |
| Trust & Reputation         |   | VerificationSystem     |
+----------------------------+   +------------------------+
                  |
                  v
+----------------------------------------+
|           Transport Layer              |
|           --------------               |
| ChunkedFileTransfer  ContentVerification |
+----------------------------------------+
```

---

## 2. System Architecture

### 2.1 Core Architecture

Dig NAT Tools adopts a modular architecture where components can work together or independently. The system is built around the following conceptual layers:

1. **Application Layer**: Host and Client interfaces for high-level operations
2. **Management Layer**: Network Manager and Content Availability coordination
3. **Discovery Layer**: Peer discovery mechanisms (DHT, PEX, Local, Gun.js)
4. **Connection Layer**: NAT traversal and connection establishment
5. **Transport Layer**: Chunked file transfer and verification

Each component follows event-driven design patterns to enable asynchronous operations and efficient resource utilization.

### 2.2 Key Interfaces

The primary interfaces for application developers are:

- `FileHost`: For sharing files with other peers
- `FileClient`: For downloading files from peers
- `NetworkManager`: For direct control of networking capabilities
- `ContentAvailabilityManager`: For managing content availability information
- `DiscoveryContentIntegration`: For integrating peer discovery with content management

[DIAGRAM 2: Interface relationships and dependencies]

```
+-------------------------+      +-------------------------+
|                         |      |                         |
|       FileHost          |<---->|       FileClient        |
|                         |      |                         |
+-----------+-------------+      +-----------+-------------+
            |                                |
            |       +---------------------+  |
            |       |                     |  |
            +------>|   NetworkManager    |<-+
            |       |                     |
            |       +----------+----------+
            |                  |
            v                  v
+-----------+-------------+    |    +-------------------------+
|                         |    |    |                         |
| ContentAvailabilityManager <-+--->|  Peer Discovery System  |
|                         |         |                         |
+-----------+-------------+         +-------------+-----------+
            |                                     |
            |                                     |
            v                                     v
+-------------------------+         +-------------------------+
|                         |         |                         |
| DiscoveryContentIntegration <---> |   NAT Traversal System  |
|                         |         |                         |
+-------------------------+         +-------------------------+
```

Main interface dependencies:
- FileHost and FileClient rely on NetworkManager for connectivity
- NetworkManager coordinates with Peer Discovery and NAT Traversal
- ContentAvailabilityManager tracks which peers have what content
- DiscoveryContentIntegration connects discovery with content management

---

## 3. NAT Traversal Methods

Network Address Translation (NAT) devices map private IP addresses to public ones, which presents a core challenge for P2P applications. Dig NAT Tools implements multiple NAT traversal strategies to establish direct connections between peers.

### 3.1 UPnP and NAT-PMP

Universal Plug and Play (UPnP) and NAT Port Mapping Protocol (NAT-PMP) attempt to automatically configure port forwarding on compatible routers:

```typescript
// Attempting UPnP port mapping
const success = await createUPnPMapping(internalPort, externalPort, 'TCP', 'Dig NAT Tools');
if (success) {
  console.log(`Successfully created UPnP mapping from external port ${externalPort} to internal port ${internalPort}`);
}
```

**Process Flow:**
1. Discover UPnP gateway on the local network
2. Request port mapping from internal to external port
3. If successful, provide the external IP:port for connection

### 3.2 TCP Hole Punching

For NATs that allow the reuse of port mappings, TCP hole punching creates a pathway:

```typescript
// Perform TCP hole punch
const connection = await performTCPHolePunch({
  localEndpoint: { host: localIP, port: localPort },
  remoteEndpoint: { host: remotePublicIP, port: remotePublicPort },
  timeout: 5000
});
```

**Process Flow:**
1. Both peers initiate outbound connections to each other
2. NAT devices create mappings for outbound connections
3. Inbound connections reuse these mappings
4. Connection attempts are synchronized using a signaling mechanism (Gun.js)

### 3.3 UDP Hole Punching

Similar to TCP but with UDP's connectionless nature:

```typescript
// Perform UDP hole punch
const udpSocket = await performUDPHolePunch({
  localEndpoint: { host: localIP, port: localPort },
  remoteEndpoint: { host: remotePublicIP, port: remotePublicPort },
  timeout: 5000
});
```

### 3.4 TCP Simultaneous Open

When TCP hole punching fails, simultaneous open attempts connections from both peers at exactly the same time:

```typescript
// Perform TCP simultaneous open
const connection = await performTCPSimultaneousOpen({
  localEndpoint: { host: localIP, port: localPort },
  remoteEndpoint: { host: remotePublicIP, port: remotePublicPort },
  signaling: gunInstance,
  timeout: 5000
});
```

### 3.5 Interactive Connectivity Establishment (ICE)

ICE combines multiple techniques, including STUN and TURN protocols:

```typescript
// Connect using ICE
const connection = await connectWithICE({
  localId: 'peer1',
  remoteId: 'peer2',
  stunServers: ['stun:stun.l.google.com:19302'],
  turnServers: [{
    urls: 'turn:turn.example.com:3478',
    username: 'user',
    credential: 'pass'
  }]
});
```

**Process Flow:**
1. Gather ICE candidates using STUN/TURN servers
2. Exchange candidates via signaling (Gun.js)
3. Attempt connections in order of preference
4. Fall back to TURN relay if direct connection fails

### 3.6 NAT Traversal Manager

The `NATTraversalManager` orchestrates all these techniques in the optimal order:

```typescript
// Automatic NAT traversal
const connection = await connectWithNATTraversal({
  localId: 'peer1',
  remoteId: 'peer2',
  gun: gunInstance,
  preferredMethods: [
    'upnp',
    'tcp-hole-punch',
    'udp-hole-punch',
    'ice',
    'turn'
  ]
});
```

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        NAT Traversal Decision Flow                       │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Detect NAT Environment                            │
│                                                                         │
│  ┌────────────────┐ ┌─────────────────┐ ┌──────────────────┐            │
│  │ Determine NAT  │ │ Discover Public │ │ Check for UPnP/   │            │
│  │ Type           │ │ IP & Port       │ │ NAT-PMP Support  │            │
│  └────────────────┘ └─────────────────┘ └──────────────────┘            │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Are peers on same LAN?                         │
└───────────┬───────────────────────────────────────────────┬─────────────┘
            │                                               │
         YES│                                            NO │
            ▼                                               ▼
┌───────────────────────────┐              ┌──────────────────────────────┐
│   Direct Local Connection  │              │   Does Router Support UPnP?   │
│                           │              └──────────────┬───────────────┘
└───────────────────────────┘                             │
                                                       YES│    ┌─NO─┐
                                                          ▼     │   │
                                           ┌──────────────────────┐ │
                                           │  Create UPnP Mapping  │ │
                                           └──────────┬────────────┘ │
                                                      │              │
                                                Success│     Failure │
                                                      │              │
                                                      ▼              ▼
                                           ┌──────────────────────────────┐
                                           │  Try TCP Hole Punching       │
                                           └──────────────┬───────────────┘
                                                          │
                                                      Success│     Failure
                                                          │              │
                                                          ▼              ▼
                                           ┌──────────────────────────────┐
                                           │  Try UDP Hole Punching       │
                                           └──────────────┬───────────────┘
                                                          │
                                                      Success│     Failure
                                                          │              │
                                                          ▼              ▼
                                           ┌──────────────────────────────┐
                                           │  Try TCP Simultaneous Open   │
                                           └──────────────┬───────────────┘
                                                          │
                                                      Success│     Failure
                                                          │              │
                                                          ▼              ▼
                                           ┌──────────────────────────────┐
                                           │  Try ICE Protocol (STUN)     │
                                           └──────────────┬───────────────┘
                                                          │
                                                      Success│     Failure
                                                          │              │
                                                          ▼              ▼
                                           ┌──────────────────────────────┐
                                           │  Use TURN Relay              │
                                           └──────────────┬───────────────┘
                                                          │
                                                          ▼
                                           ┌──────────────────────────────┐
                                           │  Connection Established      │
                                           └──────────────────────────────┘
```

The diagram illustrates the decision process when establishing peer connections:

1. First, the system detects the NAT environment
2. If peers are on the same local network, direct connection is used
3. Otherwise, it tries UPnP/NAT-PMP port mapping if supported
4. If that fails, it attempts a sequence of increasingly complex methods:
   - TCP hole punching
   - UDP hole punching
   - TCP simultaneous open
   - ICE protocol with STUN servers
5. As a last resort, it uses TURN relay servers for guaranteed connectivity
6. Each method is tried in sequence until a connection is established

---

## 4. Peer Discovery Mechanisms

Finding peers with desired content is as challenging as connecting to them. Dig NAT Tools implements four complementary peer discovery mechanisms:

### 4.1 DHT-based Discovery

Using a Distributed Hash Table (DHT) similar to those in BitTorrent and Kademlia:

```typescript
// Create DHT client
const dhtClient = new DHTClient({
  bootstrapNodes: ['dht.example.com:6881'],
  nodeId: 'unique-node-id'
});

// Announce content
await dhtClient.announce('content-hash', 8080);

// Find peers for content
const peers = await dhtClient.findPeers('content-hash');
```

**Process Flow:**
1. Nodes form a distributed hash table
2. Content is mapped to locations in the DHT using consistent hashing
3. Peers announce they have content at a specific hash
4. Clients query the DHT for peers with specific content

### 4.2 Peer Exchange (PEX)

Existing connections share information about other known peers:

```typescript
// Create PEX manager
const pexManager = new PexManager({
  maxPeers: 50,
  exchangeInterval: 30000 // 30 seconds
});

// Add connection for PEX
pexManager.addConnection(connection, 'content-hash');

// Listen for new peers
pexManager.on('peer:discovered', (peer, infoHash) => {
  console.log(`PEX discovered peer ${peer.id} for ${infoHash}`);
});
```

**Process Flow:**
1. Connected peers periodically exchange peer lists
2. New connections are attempted to discovered peers
3. Network forms a connected mesh without central coordination

### 4.3 Local Network Discovery

For peers on the same local network, using multicast DNS or broadcast:

```typescript
// Create local discovery
const localDiscovery = new LocalDiscovery({
  port: 8080,
  announceName: 'my-service'
});

// Announce presence
await localDiscovery.announce('content-hash');

// Find local peers
const localPeers = await localDiscovery.findPeers('content-hash');
```
**Process Flow:**
1. Peers send multicast/broadcast announcements on the local network
2. Other peers listen for these announcements
3. Direct connections are established using local IP addresses

### 4.4 Gun.js-based Discovery

A novel approach using the Gun.js distributed database for peer discovery:

```typescript
// Create Gun.js instance
const gun = Gun({
  peers: ['https://gun-server.example.com/gun']
});

// Create Gun discovery
const gunDiscovery = new GunDiscovery({
  gun,
  nodeId: 'unique-node-id',
  persistenceEnabled: true
});

// Announce content
await gunDiscovery.announce('content-hash', {
  port: 8080,
  contentId: 'my-video'
});

// Find peers
const peers = await gunDiscovery.findPeers('content-hash');
```

**Process Flow:**
1. Peers publish their network information to the Gun.js database
2. Information is replicated across all connected Gun peers
3. Other peers query the database for connection information
4. Gun.js handles synchronization and consistency

### 4.5 Peer Discovery Manager

The `PeerDiscoveryManager` class coordinates all discovery mechanisms:

```typescript
// Create peer discovery manager
const discoveryManager = new PeerDiscoveryManager({
  enableDHT: true,
  enablePEX: true,
  enableLocal: true,
  enableGun: true,
  gun: gunInstance,
  nodeId: 'unique-node-id'
});

// Start all discovery mechanisms
await discoveryManager.start();

// Find peers using all available methods
const allPeers = await discoveryManager.findPeers('content-hash');
```

```

+-----------------------------------------------------------------------+
|                      Peer Discovery Manager                            |
|                                                                        |
|  +----------------+   +----------------+   +----------------+          |
|  |                |   |                |   |                |          |
|  |  DHT-based     |   |  Peer Exchange |   |  Local Network |          |
|  |  Discovery     |   |  (PEX)         |   |  Discovery     |          |
|  |                |   |                |   |                |          |
|  +-------+--------+   +-------+--------+   +-------+--------+          |
|          |                    |                    |                    |
|          |                    |                    |                    |
|          v                    v                    v                    |
|  +-------+--------------------+--------------------+--------+           |
|  |                                                          |           |
|  |                     Discovery Results                    |           |
|  |                                                          |           |
|  +--+-------------------------+-------------------------+---+           |
|     |                         |                         |               |
|     |                         |                         |               |
|  +--+-------------+  +--------+-----------+  +----------+----------+   |
|  |                |  |                    |  |                     |   |
|  |  Gun.js-based  |  |  Content           |  |  NAT Traversal     |   |
|  |  Discovery     |  |  Availability      |  |  System            |   |
|  |                |  |  Manager           |  |                     |   |
|  +----------------+  +--------------------+  +---------------------+   |
|                                                                        |
+-----------------------------------------------------------------------+
                |               |                |
                v               v                v
+---------------+---------------+----------------+-------------------+
|                                                                    |
|                     NETWORK                                        |
|                                                                    |
|                      /|\                                           |
|                       |                                            |
|                       |                                            |
|  +-------------+    +-+------------+    +-------------+            |
|  |             |    |              |    |             |            |
|  |   Peer 1    +<-->+    Peer 2    +<-->+   Peer 3    |            |
|  |             |    |              |    |             |            |
|  +------+------+    +------+-------+    +------+------+            |
|         |                  |                   |                    |
|         |                  |                   |                    |
|         +------------------+-------------------+                    |
|                            |                                        |
|                            v                                        |
|  +-------------+    +------+-------+    +-------------+             |
|  |             |    |              |    |             |             |
|  |   Peer 4    +<-->+    Peer 5    +<-->+   Peer 6    |             |
|  |             |    |              |    |             |             |
|  +-------------+    +--------------+    +-------------+             |
|                                                                     |
+---------------------------------------------------------------------+
```

```text
Peer Discovery Mechanisms & Interactions:

1. DHT-based Discovery
   - Distributed Hash Table approach
   - Maps content hashes to peer locations
   - Highly scalable but potentially slower
   - Peers: Announce content → DHT → Query for content

2. Peer Exchange (PEX)
   - Connected peers share known peer lists
   - Forms a mesh network over time
   - Very efficient once connections established
   - Peers: A ⟷ B (exchanges peer list) → A connects to C

3. Local Network Discovery
   - Uses multicast/broadcast on LAN
   - Fastest for peers on same network
   - Zero external dependencies
   - Peers: Multicast announcement → Direct connection

4. Gun.js-based Discovery
   - Real-time distributed database
   - Syncs peer information across network
   - Persists announcements between sessions
   - Peers: Publish availability → Gun DB → Other peers query

Integration Points:
- PeerDiscoveryManager coordinates all mechanisms
- Results from all methods are combined and deduplicated
- ContentAvailabilityManager validates which peers actually have content
- NAT Traversal System establishes connections to discovered peers
```

---

## 5. Content Availability Management

Dig NAT Tools implements a sophisticated content availability management system to ensure reliable information about which peers have which content.

### 5.1 Content Availability Manager

The `ContentAvailabilityManager` tracks announcements and reports:

```typescript
// Create content availability manager
const contentManager = createContentAvailabilityManager({
  nodeId: 'unique-node-id',
  gun: gunInstance,
  contentTTL: 3600000, // 1 hour
  reannounceInterval: 1800000, // 30 minutes
  enableVerification: true
});

// Start the manager
await contentManager.start();

// Announce content availability
contentManager.announceContentAvailable('content-hash', {
  port: 8080,
  contentId: 'my-video'
});
```

### 5.2 Host-Initiated Content Removal

When a host stops sharing content:

```typescript
// Host announces unavailability
contentManager.announceContentUnavailable('content-hash', 'my-video');
```

**Process Flow:**
1. Host announces content is no longer available
2. Announcement propagates through Gun.js network
3. Other peers update their content availability records
4. Discovery mechanisms remove the peer from content queries

### 5.3 Client-Detected Content Unavailability

When clients detect false announcements:

```typescript
// Client reports that peer doesn't have content
contentManager.reportContentUnavailable('peer-id', 'content-hash');
```

**Process Flow:**
1. Client reports that a peer doesn't have claimed content
2. System collects reports from multiple clients
3. When threshold is reached, verification is attempted
4. If verification fails, peer is marked as UNAVAILABLE

### 5.4 Report Levels and Status

The system uses a graduated response model:

```typescript
// Report levels
enum ReportLevel {
  NONE = 'none',   // No reports or expired reports
  LOW = 'low',     // Small number of reports (2+)
  MEDIUM = 'medium', // More reports (3+)
  HIGH = 'high'    // Many reports (5+) from multiple sources (3+)
}

// Content status
enum PeerContentStatus {
  AVAILABLE = 'available', // Peer likely has the content
  SUSPECT = 'suspect',     // Peer might not have content
  UNAVAILABLE = 'unavailable' // Peer definitely doesn't have content
}
```

### 5.5 Discovery Content Integration

The `DiscoveryContentIntegration` class connects availability management with peer discovery:

```typescript
// Create integration component
const integration = createDiscoveryContentIntegration({
  nodeId: 'unique-node-id',
  gun: gunInstance
});

// Register discovery components
integration.registerDHTClient(dhtClient);
integration.registerPEXManager(pexManager);
integration.registerGunDiscovery(gunDiscovery);

// Filter peers by content status
const validPeers = integration.filterPeersByContentStatus(allPeers, 'content-hash');
```

```
┌───────────────────────────────────────────────────────────────────────┐
│                 Content Availability Management System                 │
└───────────────────────────────────────────────────────────────────────┘
                                    │
                   ┌────────────────┼────────────────┐
                   │                │                │
                   ▼                ▼                ▼
      ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
      │  Announcements  │  │    Reports      │  │  Verification   │
      └────────┬────────┘  └────────┬────────┘  └────────┬────────┘
               │                    │                    │
               │                    │                    │
               ▼                    ▼                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                   Content Status State Machine                        │
│                                                                       │
│  ┌─────────────┐       ┌─────────────┐       ┌─────────────┐         │
│  │             │ REPORT│             │ REPORT│             │         │
│  │  AVAILABLE  ├──────►│   SUSPECT   ├──────►│ UNAVAILABLE │         │
│  │             │ LOW   │             │ HIGH  │             │         │
│  └──────┬──────┘       └──────┬──────┘       └──────┬──────┘         │
│         │                     │                     │                 │
│         │ REANNOUNCE          │ VERIFICATION        │ REANNOUNCE     │
│         │ VERIFIED            │ SUCCESS             │ VERIFIED       │
│         │                     │                     │                 │
│         └─────────────────────┼─────────────────────┘                 │
│                               │                                       │
│                               ▼                                       │
│                      ┌────────────────┐                               │
│                      │  Time-based    │                               │
│                      │  Report Decay  │                               │
│                      └────────────────┘                               │
└──────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Client Decision Flow                          │
│                                                                       │
│    ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    │                 │     │                 │     │                 │
│    │  Connect and    │     │  Try if no      │     │  Filter out     │
│    │  download from  │     │  better options │     │  from peer      │
│    │  peer           │     │  available      │     │  list           │
│    │                 │     │                 │     │                 │
│    └─────────────────┘     └─────────────────┘     └─────────────────┘
│    AVAILABLE                SUSPECT                 UNAVAILABLE       │
└──────────────────────────────────────────────────────────────────────┘
```

```text
Content Availability Workflow & Status Transitions:

1. INPUT SOURCES
   - Announcements: Peers declare they have content
   - Reports: Clients report unavailable content
   - Verification: System actively checks content availability

2. STATUS STATES
   - AVAILABLE: Content is believed to be available (default for new announcements)
   - SUSPECT: Content availability is questionable (after LOW/MEDIUM level reports)
   - UNAVAILABLE: Content is confirmed unavailable (after HIGH level reports or verification)

3. TRANSITION TRIGGERS
   - AVAILABLE → SUSPECT: Low/Medium report level reached
   - SUSPECT → UNAVAILABLE: High report level reached or verification fails
   - UNAVAILABLE → AVAILABLE: Peer re-announces with verification
   - SUSPECT → AVAILABLE: Verification succeeds or report level decays

4. REPORT LEVELS
   - NONE: No reports or all reports expired
   - LOW: 2+ reports from any sources
   - MEDIUM: 3+ reports from any sources
   - HIGH: 5+ reports including 3+ unique sources

5. TIME-BASED MECHANISMS
   - Report Decay: Reports lose weight over time
   - Announcement TTL: Announcements expire if not refreshed
   - Verification Schedule: More frequent for SUSPECT status

6. CLIENT BEHAVIOR
   - AVAILABLE peers: Connect normally
   - SUSPECT peers: Use as fallback options
   - UNAVAILABLE peers: Filter out completely
```

---

## 6. File Transfer Protocol

Once peers are discovered and connections established, the file transfer protocol handles the actual data exchange.

### 6.1 Chunked File Transfer

Files are divided into fixed-size chunks for efficient transfer:

```typescript
// Transfer options
const options = {
  chunkSize: 65536, // 64 KB chunks
  concurrency: 5,   // Download 5 chunks simultaneously
  verificationHash: 'sha256-hash-of-file',
  onProgress: (progress) => console.log(`Download: ${progress * 100}%`)
};

// Download file
await client.downloadFile('content-hash', './downloads/file.mp4', options);
```

**Process Flow:**
1. File is divided into indexed chunks
2. Chunks are requested from peers in parallel
3. Completed chunks are written to disk
4. Chunks are verified against expected hashes
5. Missing or corrupt chunks are re-requested

### 6.2 Multi-Source Downloads

Files can be downloaded from multiple peers simultaneously:

```typescript
// Download from multiple sources
await client.downloadFileFromPeers(peers, 'content-hash', './downloads/file.mp4', {
  strategy: 'fastest-available',
  concurrency: 10,
  peerConcurrency: 3 // Chunks per peer
});
```

**Process Flow:**
1. Connection established to multiple peers
2. Different chunks requested from different peers
3. Bandwidth and latency monitored for each peer
4. More requests sent to higher-performing peers
5. Slow or failing peers are deprioritized

### 6.3 Content Verification

All transferred content is verified:

```typescript
// Calculate hash for verification
const fileHash = await calculateSHA256('./downloads/file.mp4');

// Verify against expected hash
if (fileHash === expectedHash) {
  console.log('File verification successful');
} else {
  console.log('File verification failed');
}
```

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   Chunked Multi-Source File Transfer                      │
└─────────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Original File                                   │
│  ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐       │
│  │Chunk │Chunk │Chunk │Chunk │Chunk │Chunk │Chunk │Chunk │Chunk │       │
│  │  1   │  2   │  3   │  4   │  5   │  6   │  7   │  8   │  9   │       │
│  └──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┘       │
└─────────────────────────────────────────────────────────────────────────┘
                           │
                           │ Chunking & Metadata
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Client                                          │
│  ┌──────────────────────────────────────────────┐                       │
│  │ Chunk Request Manager                         │                       │
│  │ ┌───────────────┐  ┌───────────────────────┐ │                       │
│  │ │ Metadata      │  │ Download Tracker      │ │                       │
│  │ │ - File Hash   │  │ - Chunk Status        │ │                       │
│  │ │ - # of Chunks │  │ - Source Performance  │ │                       │
│  │ │ - Chunk Size  │  │ - Verification Status │ │                       │
│  │ │ - Chunk Index │  │ - Request Timeouts    │ │                       │
│  │ │ - Chunk Size  │  │ - Verification Hash  │ │                       │
│  │ │ - Chunk Index │  │ - Verification Hash  │ │                       │
│  │ │ - Verification │  │ - Verification Hash  │ │                       │
│  │ │ - Source       │  │ - Verification Hash  │ │                       │
│  │ │ - Switching    │  │ - Verification Hash  │ │                       │
│  │ │ - Error        │  │ - Verification Hash  │ │                       │
│  │ │ - Handling     │  │ - Verification Hash  │ │                       │
│  │ └───────────────┘  └───────────────────────┘ │                       │
│  └──────────────────────────────────────────────┘                       │
└──────────┬─────────────┬───────────────┬─────────────────┬──────────────┘
           │             │               │                 │
           │             │               │                 │
           ▼             ▼               ▼                 ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Peer A    │  │   Peer B    │  │   Peer C    │  │   Peer D    │
│ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │
│ │Chunks:  │ │  │ │Chunks:  │ │  │ │Chunks:  │ │  │ │Chunks:  │ │
│ │1,2,3,8,9│ │  │ │2,3,4,5,6│ │  │ │1,5,6,7,8│ │  │ │3,4,7,9  │ │
│ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │                │
       │                │                │                │
       ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Parallel Downloads                                 │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐│
│  │Chunk │ │Chunk │ │Chunk │ │Chunk │ │Chunk │ │Chunk │ │Chunk │ │Chunk ││
│  │  1   │ │  2   │ │  3   │ │  4   │ │  5   │ │  6   │ │  7   │ │  9   ││
│  │(A,C) │ │(A,B) │ │(A,B,D)│ │(B,D) │ │(B,C) │ │(B,C) │ │(C,D) │ │(A,D) ││
│  └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘│
│     │        │        │        │        │        │        │        │    │
│     │        │        │        │        │        │        │        │    │
│     ▼        ▼        ▼        ▼        ▼        ▼        ▼        ▼    │
│  ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐       │
│  │Chunk │Chunk │Chunk │Chunk │Chunk │Chunk │Chunk │Chunk │Chunk │       │
│  │  1   │  2   │  3   │  4   │  5   │  6   │  7   │  8   │  9   │       │
│  └──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┘       │
│                                                                          │
│                      Reassembled & Verified File                         │
└─────────────────────────────────────────────────────────────────────────┘
```

```text
Chunked Multi-Source File Transfer Process:

1. File Chunking
   - Original file is divided into fixed-size chunks (e.g., 64KB)
   - Each chunk has an index and a verification hash
   - Metadata contains file size, chunk size, total chunks, and file hash

2. Peer Discovery & Selection
   - Multiple peers hosting the same file are identified
   - Each peer may have some or all chunks available
   - Client tracks which peers have which chunks

3. Parallel Download Strategy
   - Multiple chunks requested simultaneously (controlled concurrency)
   - Different chunks from different peers for maximum throughput
   - Same chunk requested from multiple peers for redundancy
   - Adaptive prioritization based on peer performance

4. Verification & Assembly
   - Each chunk verified against expected hash upon receipt
   - Failed verifications trigger re-requests from alternate peers
   - Verified chunks written to disk in correct order
   - Completed file verified against original file hash

5. Advantages
   - Optimizes bandwidth utilization across multiple sources
   - Resilient to peer disconnections or slowdowns
   - Allows partial downloading and progressive use
   - Ensures data integrity through multiple verification layers
```

---

## 7. Host Operations

File hosting involves announcing availability, responding to peer connections, and serving file data.

### 7.1 Hosting Flow

```typescript
// Create file host
const host = createFileHost({
  port: 8080,
  directory: './shared-files',
  dhtEnabled: true,
  pexEnabled: true,
  localEnabled: true,
  gunEnabled: true,
  gun: gunInstance
});

// Start hosting
await host.start();

// Add file to share
const fileInfo = await host.addFile('./my-video.mp4', {
  contentId: 'my-video',
  announceLevel: 'high'
});

console.log(`Sharing file with hash: ${fileInfo.hash}`);
```

**Detailed Process Flow:**

1. **Initialization**
   - Create the `FileHost` instance with desired configuration
   - Start the network manager and discovery systems
   - Initialize content availability manager

2. **File Addition**
   - Calculate hash for the file
   - Register the file in the internal file registry
   - Map the content ID to the file hash

3. **Content Announcement**
   - Announce file availability through all enabled discovery mechanisms
   - DHT: Announce hash and port to the distributed hash table
   - PEX: Include in peer exchange lists
   - Local: Broadcast on local network
   - Gun: Publish to Gun.js distributed database

4. **Connection Handling**
   - Listen for incoming connection attempts
   - For each connection:
     - Authenticate if enabled
     - Initialize the file transfer protocol
     - Process file requests

5. **File Serving**
   - Receive chunk requests from clients
   - Read requested chunks from disk
   - Send chunks to clients with verification data
   - Track bandwidth and connection statistics

6. **Reannouncement**
   - Periodically reannounce content availability
   - Update announcements with fresh timestamps

7. **Content Removal**
   - When a file is removed from hosting:
     - Announce content unavailability
     - Remove from local registry
     - Stop serving requests for that content

```
┌───────────────────────────────────────────────────────────────────────────┐
│                          Host Operation Flowchart                          │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                              Initialization                                │
│                                                                           │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐   │
│  │ Create FileHost    │  │ Start Network      │  │ Initialize Content │   │
│  │ ----------------   │  │ Manager            │  │ Availability Mgr   │   │
│  │ - Port             │  │ ----------------   │  │ ----------------   │   │
│  │ - Directory        │  │ - Discovery        │  │ - TTL Settings     │   │
│  │ - Discovery Config │  │ - NAT Traversal    │  │ - Verification     │   │
│  └──────────┬─────────┘  └──────────┬─────────┘  └──────────┬─────────┘   │
│             └────────────────┬────────────────────┘                       │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                              File Addition                                 │
│                                                                           │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐   │
│  │ Read & Process     │  │ Calculate File     │  │ Register in File   │   │
│  │ File               │  │ Hash               │  │ Registry           │   │
│  └──────────┬─────────┘  └──────────┬─────────┘  └──────────┬─────────┘   │
│             └────────────────┬────────────────────┘                       │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                         Content Announcement                               │
│                                                                           │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌────────────┐│
│  │                │  │                │  │                │  │            ││
│  │  DHT           │  │  PEX           │  │  Local         │  │  Gun.js    ││
│  │  Announcement  │  │  Announcement  │  │  Announcement  │  │            ││
│  │                │  │                │  │                │  │            ││
│  └────────┬───────┘  └────────┬───────┘  └────────┬───────┘  └─────┬──────┘│
│           │                   │                   │                 │       │
│           └───────────────────┼───────────────────┼─────────────────┘       │
│                               │                   │                         │
└───────────────────────────────┼───────────────────┼─────────────────────────┘
                               /│\                 /│\
                               │ │                 │ │
┌────────────────────┐         │ │                 │ │         ┌───────────────┐
│                    │         │ │                 │ │         │               │
│     Periodic       │         │ │                 │ │         │    Content    │
│  Reannouncement    ├─────────┘ │                 │ └─────────┤    Removal    │
│  (Every 30 min)    │           │                 │           │ Announcements │
│                    │           │                 │           │               │
└────────────────────┘           │                 │           └───────────────┘
                                 │                 │
                                 │  Peer Queries   │
                                 │                 │
                                 ▼                 ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                          Connection Handling                               │
│                                                                           │
│  ┌────────────────┐     ┌────────────────┐     ┌────────────────────┐     │
│  │ Listen for     │────►│ Authenticate   │────►│ Initialize File    │     │
│  │ Connections    │     │ Peer (Optional)│     │ Transfer Protocol  │     │
│  └────────────────┘     └────────────────┘     └──────────┬─────────┘     │
│                                                           │               │
└───────────────────────────────────────────────────────────┬───────────────┘
                                                            │
                                                            ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                             File Serving                                   │
│                                                                           │
│  ┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐ │
│  │ Receive Chunk   │────►│ Read Requested   │────►│ Send Chunk with     │ │
│  │ Requests        │     │ Chunks from Disk │     │ Verification Data   │ │
│  └─────────────────┘     └──────────────────┘     └──────────┬──────────┘ │
│                                                              │            │
│  ┌───────────────────────────────────────────────────────────┘            │
│  │                                                                        │
│  ▼                                                                        │
│  ┌─────────────────┐     ┌─────────────────────┐                          │
│  │ Track Bandwidth │────►│ Adjust Concurrency  │                          │
│  │ & Performance   │     │ & Resource Usage    │                          │
│  └─────────────────┘     └─────────────────────┘                          │
└───────────────────────────────────────────────────────────────────────────┘
```

```text
Host Operation Flowchart Description:

1. Initialization Phase
   - FileHost creation with configuration parameters (port, directory, etc.)
   - Network Manager initialization with discovery and NAT traversal components
   - Content Availability Manager setup with TTL and verification settings

2. File Addition Process
   - File is read and processed
   - Cryptographic hash is calculated for file identification
   - File is registered in the internal registry with metadata

3. Content Announcement
   - File availability is announced through multiple mechanisms:
     * DHT: Distributed Hash Table announcement
     * PEX: Peer Exchange announcements to connected peers
     * Local: Multicast/broadcast on local network
     * Gun: Publication to distributed database

4. Ongoing Announcement Management
   - Periodic reannouncement (typically every 30 minutes)
   - Response to peer queries about content
   - Content removal announcements when files are no longer shared

5. Connection Handling
   - Listening for incoming connection attempts
   - Optional peer authentication via challenge-response
   - Initialization of file transfer protocol for each connection

6. File Serving
   - Processing chunk requests from connected clients
   - Reading requested chunks from disk
   - Sending chunks with verification data
   - Performance monitoring and resource optimization

This operational flow ensures reliable content discovery, secure connections, 
and efficient file transfers while maintaining accurate content availability 
information across the network.
```

---

## 8. Client Operations

File downloading involves discovering peers, establishing connections, and retrieving file data.

### 8.1 Downloading Flow

```typescript
// Create file client
const client = createFileClient({
  downloadDir: './downloads',
  dhtEnabled: true,
  pexEnabled: true,
  localEnabled: true,
  gunEnabled: true,
  gun: gunInstance
});

// Start client
await client.start();

// Download by content ID
await client.downloadByContentId('my-video', {
  progressCallback: (progress) => console.log(`Download: ${progress * 100}%`),
  concurrency: 5
});
```

**Detailed Process Flow:**

1. **Initialization**
   - Create the `FileClient` instance with desired configuration
   - Start the network manager and discovery systems
   - Initialize content availability manager

2. **Content Discovery**
   - If using content ID, look up the associated file hash
   - Query all enabled discovery mechanisms for peers
   - DHT: Query distributed hash table for peers with the hash
   - PEX: Ask connected peers for others with the content
   - Local: Search for peers on local network
   - Gun: Query Gun.js database for announcements

3. **Peer Filtering**
   - Filter discovered peers by content availability status
   - Remove peers marked as UNAVAILABLE
   - Prioritize peers based on reputation and network proximity

4. **Connection Establishment**
   - For each potential peer:
     - Attempt connection using NAT traversal methods
     - Try each method in sequence until one succeeds
     - If all direct methods fail, use TURN relay as fallback

5. **File Download**
   - Create download manager for the file
   - Divide file into chunks for parallel downloading
   - Request chunks from connected peers
   - Write completed chunks to disk
   - Track download progress and peer performance

6. **Verification and Completion**
   - Verify each chunk against expected hash
   - Re-request corrupt or failed chunks
   - Verify complete file hash after download
   - Update peer reputations based on download experience

7. **Reporting**
   - Report successful downloads to improve peer reputation
   - Report unavailable content when peers falsely claim availability

```
┌───────────────────────────────────────────────────────────────────────────┐
│                         Client Operation Flowchart                         │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                              Initialization                                │
│                                                                           │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐   │
│  │ Create FileClient  │  │ Start Network      │  │ Initialize Content │   │
│  │ ----------------   │  │ Manager            │  │ Integration        │   │
│  │ - Download Dir     │  │ ----------------   │  │ ----------------   │   │
│  │ - Discovery Config │  │ - Discovery        │  │ - Peer Filtering   │   │
│  │ - Gun Instance     │  │ - NAT Traversal    │  │ - Status Tracking  │   │
│  └──────────┬─────────┘  └──────────┬─────────┘  └──────────┬─────────┘   │
│             └────────────────┬────────────────────┘                       │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                           Content Discovery                                │
│                                                                           │
│  ┌────────────────────┐  ┌────────────────────────────────────────────┐   │
│  │ Resolve Content ID │  │ Query Multiple Discovery Mechanisms         │   │
│  │ ----------------   │  │ ---------------------------------           │   │
│  │ Content ID → Hash  │  │ ┌───────┐  ┌───────┐  ┌───────┐  ┌───────┐ │   │
│  │                    │  │ │  DHT  │  │  PEX  │  │ Local │  │ Gun.js│ │   │
│  │                    │  │ └───┬───┘  └───┬───┘  └───┬───┘  └───┬───┘ │   │
│  └──────────┬─────────┘  └───────┬──────────┬──────────┬──────────┬───┘   │
│             └────────────────────┼──────────┼──────────┼──────────┘       │
└────────────────────────────────┬─┴──────────┴──────────┘───────────────────┘
                                 │
                                 ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                             Peer Filtering                                 │
│                                                                           │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐   │
│  │ Filter by Content  │  │ Sort by Reputation │  │ Prioritize Local   │   │
│  │ Status             │  │ & Performance      │  │ Network Peers      │   │
│  │ ----------------   │  │ ----------------   │  │ ----------------   │   │
│  │ ✓ AVAILABLE        │  │ - Success Rate     │  │ - Latency          │   │
│  │ ? SUSPECT          │  │ - Transfer Speed   │  │ - Connection Type  │   │
│  │ ✗ UNAVAILABLE      │  │ - Peer Stability   │  │ - NAT Type         │   │
│  └──────────┬─────────┘  └──────────┬─────────┘  └──────────┬─────────┘   │
│             └────────────────┬────────────────────┘                       │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                        Connection Establishment                            │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                     NAT Traversal Methods                            │  │
│  │ ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐  │  │
│  │ │ Local      │  │ UPnP/      │  │ TCP/UDP    │  │ ICE with       │  │  │
│  │ │ Connection │  │ NAT-PMP    │  │ Hole Punch │  │ STUN/TURN      │  │  │
│  │ └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └───────┬────────┘  │  │
│  │       │               │               │                 │           │  │
│  │       └───────────────┴───────────────┴─────────────────┘           │  │
│  │                                │                                     │  │
│  └─────────────────────────────┬─┴─────────────────────────────────────┘  │
└───────────────────────────────┬─┘─────────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                           File Download                                    │
│                                                                           │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐   │
│  │ Create Download    │  │ Chunked Download   │  │ Multi-Peer         │   │
│  │ Manager            │  │ ----------------   │  │ Strategy           │   │
│  │ ----------------   │  │ - Chunk Size       │  │ ----------------   │   │
│  │ - Progress Track   │  │ - Concurrency      │  │ - Peer Selection   │   │
│  │ - File Metadata    │  │ - Request Timeouts │  │ - Load Balancing   │   │
│  │ - Error Handling   │  │ - Priority Queue   │  │ - Peer Failover    │   │
│  └──────────┬─────────┘  └──────────┬─────────┘  └──────────┬─────────┘   │
│             │                       │                       │             │
│             └───────────────────────┼───────────────────────┘             │
│                                     │                                     │
│                                     ▼                                     │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐   │
│  │ Chunk Verification │  │ Write to           │  │ Progress Updates   │   │
│  │ ----------------   │  │ Disk               │  │ ----------------   │   │
│  │ - Hash Check       │  │ - Sparse Files     │  │ - Buffered I/O     │   │
│  │ - Retry Failed     │  │ - Buffered I/O     │  │ - Buffered I/O     │   │
│  │ - Source Switching │  │ - Buffered I/O     │  │ - Buffered I/O     │   │
│  └──────────┬─────────┘  └──────────┬─────────┘  └──────────┬─────────┘   │
│             └────────────────┬────────────────────┘                       │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                      Verification & Completion                             │
│                                                                           │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐   │
│  │ Final File         │  │ Update Peer        │  │ Content            │   │
│  │ Verification       │  │ Reputation         │  │ Reporting          │   │
│  │ ----------------   │  │ ----------------   │  │ ----------------   │   │
│  │ - Full Hash Check  │  │ - Success Rate     │  │ - Report Bad Peers │   │
│  │ - Data Integrity   │  │ - Content Quality  │  │ - Verify Claims    │   │
│  │ - Metadata Check   │  │ - Connection Perf  │  │ - Signed Reports   │   │
│  └──────────┬─────────┘  └──────────┬─────────┘  └──────────┬─────────┘   │
│             └────────────────┬────────────────────┘                       │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                        Download Complete                                   │
└───────────────────────────────────────────────────────────────────────────┘
```

```text
Client Operation Flowchart Description:

1. Initialization Phase
   - FileClient creation with configuration parameters (download directory, etc.)
   - Network Manager initialization with discovery and NAT traversal components
   - Content Integration setup for peer filtering and status tracking

2. Content Discovery Process
   - Resolution of content ID to file hash if needed
   - Parallel queries to multiple discovery mechanisms:
     * DHT: Distributed Hash Table queries
     * PEX: Requesting peer lists from connected peers
     * Local: Searching on local network
     * Gun.js: Querying distributed database

3. Peer Filtering Strategy
   - Filter discovered peers by content availability status
   - Sort peers by reputation and historical performance
   - Prioritize peers based on network proximity and connection type

4. Connection Establishment
   - Attempt connections using multiple NAT traversal techniques in sequence:
     * Direct local connection (if on same network)
     * UPnP/NAT-PMP port mapping
     * TCP/UDP hole punching
     * ICE protocol with STUN/TURN

5. File Download Process
   - Download Manager creation with progress tracking and error handling
   - Chunked download implementation with configurable parameters
   - Multi-peer strategy for optimal bandwidth utilization
   - Verification of each chunk as it arrives
   - Efficient disk writing with buffering
   - Real-time progress reporting

6. Verification & Completion
   - Final verification of complete file against expected hash
   - Updating peer reputation based on download experience
   - Reporting content availability status to the network
   - Signed reporting to maintain network integrity

This operational flow ensures reliable content discovery, efficient downloads 
from multiple sources, and maintains network health through reputation updates
and content verification.
```

---

## 9. NAT Traversal Decision Flow

The selection of NAT traversal methods follows a strategic decision path:

### 9.1 Connection Process Flow

1. **NAT Environment Detection**
   - Determine local NAT type
   - Discover public IP and port mappings
   - Check for UPnP/NAT-PMP support

2. **Attempt Local Connection First**
   - If peers are on same local network, connect directly
   - Local connections bypass NAT traversal needs

3. **UPnP/NAT-PMP Attempt**
   - If router supports port mapping protocols, create mapping
   - Peers connect directly using public IP:port

4. **Hole Punching Techniques**
   - If direct connection fails, try TCP hole punching
   - If TCP fails, try UDP hole punching
   - If both fail, try TCP simultaneous open

5. **ICE Protocol**
   - Gather STUN candidates
   - Exchange candidates via signaling
   - Attempt connection in candidate priority order

6. **TURN Relay Fallback**
   - If all direct connections fail, use TURN relay
   - TURN provides guaranteed but higher-latency connection

```
[DIAGRAM 9: NAT traversal decision tree with success/failure paths]
```

---

## 10. Performance Considerations

### 10.1 Bandwidth Management

The system implements several bandwidth optimization strategies:

- **Chunked Transfers**: Fixed-size chunks for efficient parallelization
- **Progressive Downloading**: Start utilizing chunks before complete download
- **Bandwidth Measurement**: Adapt to changing network conditions
- **Peer Prioritization**: More chunks requested from faster peers
- **Connection Pooling**: Reuse connections for multiple transfers

### 10.2 Resource Utilization

To minimize resource consumption:

- **Event-Driven Architecture**: Non-blocking I/O operations
- **Connection Limits**: Configurable maximum peer connections
- **Timeout Management**: Abandon unresponsive peers and connections
- **Disk Writing Optimization**: Buffer writes to reduce I/O operations
- **Memory Management**: Configurable chunk caching strategies

---

## 11. Cryptographic Identity System

The Dig NAT Tools library includes a comprehensive cryptographic identity system that provides secure peer authentication and verifiable content availability management.

### 11.1 Core Components

#### 11.1.1 CryptoIdentity

The `CryptoIdentity` class provides the foundation for all cryptographic operations:

```typescript
// Create a cryptographic identity with blockchain keys
const identity = createCryptoIdentity({
  privateKey: blockchainPrivateKey,
  publicKey: blockchainPublicKey,
  algorithm: 'secp256k1', // Compatible with most blockchains
  outputEncoding: 'hex'
});

// Sign data with the identity
const signature = identity.sign(dataToSign);

// Verify a signature
const isValid = identity.verify(data, signature, publicKey);
```

The system supports multiple signature algorithms:
- `ed25519`: Fast, secure modern elliptic curve cryptography
- `secp256k1`: Compatible with Bitcoin, Ethereum, and many other blockchains
- `rsa`: Traditional asymmetric cryptography for legacy compatibility

Node IDs are derived from public keys using:
```typescript
const nodeId = identity.getNodeId(); // SHA-256 hash of public key
```

#### 11.1.2 AuthenticatedFileHost

The `AuthenticatedFileHost` extends the base `FileHost` with authentication capabilities:

```typescript
// Create an authenticated file host
const host = createAuthenticatedFileHost({
  port: 8080,
  directory: './shared-files',
  privateKey: blockchainPrivateKey,
  publicKey: blockchainPublicKey,
  signatureAlgorithm: 'secp256k1',
  requirePeerAuthentication: true, // Require peers to authenticate
  acceptAnonymousPeers: false // Reject anonymous peers
});
```

#### 11.1.3 AuthenticatedContentAvailabilityManager

The `AuthenticatedContentAvailabilityManager` enhances content availability tracking with cryptographic verification:

```typescript
// Create a content manager
const contentManager = createAuthenticatedContentAvailabilityManager({
  nodeId: blockchainAddress,
  privateKey: blockchainPrivateKey,
  publicKey: blockchainPublicKey,
  signatureAlgorithm: 'secp256k1',
  gun: gunInstance
});

// Announce content with signature
contentManager.announceContentAvailable('content-hash', {
  port: 8080,
  contentId: 'my-video'
});
```

### 11.2 Authentication Flow

The authentication flow between hosts and clients follows this pattern:

1. **Connection Request**:
   ```
   Client -> Host: "I want to connect, I am {peerId}"
   ```

2. **Challenge**:
   ```
   Host -> Client: {
     challenge: "random-string",
     timestamp: 1635789123456,
     hostId: "host-id"
   }
   ```

3. **Signed Response**:
   ```
   Client -> Host: {
     peerId: "client-id",
     publicKey: "client-public-key",
     signature: "signed-challenge-data",
     timestamp: 1635789123789
   }
   ```

4. **Verification**:
   The host verifies the signature against the client's public key using:
   ```typescript
   const isValid = identity.verify(
     JSON.stringify({
       challenge: challengeData.challenge,
       timestamp,
       hostId: challengeData.hostId
     }),
     signature,
     publicKey
   );
   ```

5. **Connection Acceptance/Rejection**:
   Based on verification result and host policy for unknown peers

```
[DIAGRAM 10: Cryptographic authentication flow with challenge-response]
```

### 11.3 Content Announcement Security

Content announcements and reports are cryptographically signed to ensure authenticity:

#### 11.3.1 Signed Content Announcement

```typescript
{
  data: {
    hash: "content-hash",
    port: 8080,
    contentId: "my-video",
    available: true,
    peerId: "announcer-id"
  },
  signature: "signature-of-data",
  publicKey: "announcer-public-key",
  timestamp: 1635789123456
}
```

#### 11.3.2 Signed Content Report

```typescript
{
  data: {
    reporterId: "reporter-id",
    reportedPeerId: "reported-peer-id",
    contentHash: "content-hash",
    reason: "Content not found"
  },
  signature: "signature-of-data",
  publicKey: "reporter-public-key",
  timestamp: 1635789123456
}
```

#### 11.3.3 Verification Process

All announcements and reports are verified before processing:

```typescript
// Create identity with public key
const tempIdentity = createCryptoIdentity({
  privateKey: '', // Not needed for verification
  publicKey: signedData.publicKey,
  algorithm: 'secp256k1',
  outputEncoding: 'hex'
});

// Verify the signed data
const isValid = verifySignedData(signedData, tempIdentity);
```

### 11.4 Blockchain Integration

The cryptographic identity system integrates seamlessly with blockchain wallets:

```typescript
// Ethereum integration example using ethers.js
import { Wallet } from 'ethers';

// Create a wallet from private key
const wallet = new Wallet(privateKey);

// Use wallet for authenticated file sharing
const host = createAuthenticatedFileHost({
  port: 8080,
  directory: './shared-files',
  privateKey: wallet.privateKey,
  publicKey: wallet.publicKey,
  signatureAlgorithm: 'secp256k1'
});
```

This allows consistent identity between on-chain and off-chain operations, particularly valuable for blockchain-adjacent applications where users already have key pairs.

### 11.5 Trust and Reputation

The system includes multiple trust mechanisms:

- **Trusted Peer Network**: Maintain a list of trusted peers with verified public keys
- **Reputation Tracking**: Build peer reputation based on verified behavior
- **Consensus-Based Reporting**: Require multiple independent reports before marking content unavailable
- **Multi-level Status**: Graduate from AVAILABLE to SUSPECT to UNAVAILABLE based on evidence

```typescript
// Add a trusted peer
contentManager.addTrustedPeer(peerId, publicKey);

// Check if a peer is trusted
const isTrusted = contentManager.isTrustedPeer(peerId, publicKey);
```

### 11.6 Security Benefits

The cryptographic identity system provides several key security benefits:

1. **Non-repudiation**: Peers cannot deny their announcements or reports
2. **End-to-end verification**: No trusted intermediaries required
3. **Sybil attack resistance**: Multiple verified identities needed for consensus
4. **Blockchain integration**: Seamless use with existing blockchain identities
5. **Distributed trust**: Trust decisions based on cryptographically verified behavior

```
[DIAGRAM 11: Security benefits of the cryptographic identity system]
```

---

## 12. Security Considerations

### 12.1 Content Verification

All content is cryptographically verified:

- SHA-256 hashing for complete files
- Per-chunk verification during transfer
- Hash tree structures for efficient partial verification

### 12.2 Peer Authentication

The library includes comprehensive peer authentication mechanisms:

- Public key infrastructure for peer identity
- Challenge-response protocols
- Token-based authentication

### 12.3 Sybil Attack Mitigation

The content availability consensus system helps mitigate Sybil attacks:

- Multiple unique reporters required for HIGH report level
- Reporter reputation affects report weight
- Time-based report decay for stale information

---

## 13. Example Implementation: Full File Transfer System

This example demonstrates a complete file-sharing application:

```typescript
import {
  createFileHost,
  createFileClient,
  createGunDiscovery,
  createContentAvailabilityManager,
  createDiscoveryContentIntegration
} from '@dignetwork/dig-nat-tools';
import Gun from 'gun';

// Create Gun instance with optional persistence
const gun = Gun({
  peers: ['https://gun-server.example.com/gun'],
  localStorage: false,
  radisk: true
});

// Create a unique node ID
const nodeId = Math.random().toString(36).substring(2, 15);

// FILE HOST SETUP

// Create host
const host = createFileHost({
  port: 8080,
  directory: './shared-files',
  nodeId,
  gun
});

// Initialize content availability manager
const hostContentManager = createContentAvailabilityManager({
  nodeId,
  gun,
  contentTTL: 3600000, // 1 hour
  reannounceInterval: 1800000 // 30 minutes
});

// Start host components
await host.start();
await hostContentManager.start();

// Add file to share
const fileInfo = await host.addFile('./my-video.mp4', {
  contentId: 'my-awesome-video'
});

// Announce content availability
hostContentManager.announceContentAvailable(fileInfo.hash, {
  port: 8080,
  contentId: 'my-awesome-video'
});

console.log(`Hosting file with hash: ${fileInfo.hash}`);

// FILE CLIENT SETUP

// Create client
const client = createFileClient({
  downloadDir: './downloads',
  nodeId: `client-${Math.random().toString(36).substring(2, 10)}`,
  gun
});

// Initialize content integration
const clientIntegration = createDiscoveryContentIntegration({
  nodeId: `client-${Math.random().toString(36).substring(2, 10)}`,
  gun
});

// Start client components
await client.start();
await clientIntegration.start();

// Register discovery components with integration
clientIntegration.registerDHTClient(client.getDiscoveryManager().getDHTClient());
clientIntegration.registerPEXManager(client.getDiscoveryManager().getPEXManager());
clientIntegration.registerGunDiscovery(client.getDiscoveryManager().getGunDiscovery());

// Find peers for content ID
const contentHash = await client.getHashForContentId('my-awesome-video');
const allPeers = await client.findPeers(contentHash);

// Filter peers by content availability
const validPeers = clientIntegration.filterPeersByContentStatus(allPeers, contentHash);

console.log(`Found ${validPeers.length} peers with content`);

// Download the file
await client.downloadFile(contentHash, './downloads/downloaded-video.mp4', {
  progressCallback: (progress) => console.log(`Download: ${Math.round(progress * 100)}%`),
  concurrency: 5,
  verificationHash: contentHash
});

console.log('Download complete!');

// If download succeeds, update peer reputation
clientIntegration.updatePeerReputation(validPeers[0].id, true);

// If download fails due to missing content
// clientIntegration.reportContentUnavailable(validPeers[0].id, contentHash);

// When host stops sharing
// hostContentManager.announceContentUnavailable(fileInfo.hash, 'my-awesome-video');

// Cleanup
await client.stop();
await clientIntegration.stop();
await host.stop();
await hostContentManager.stop();
```

```
[DIAGRAM 10: Complete system interaction showing host and client operations]
```

---

## 13. Conclusion

Dig NAT Tools provides a robust solution for peer-to-peer file sharing in challenging network environments. By combining multiple NAT traversal techniques, peer discovery mechanisms, and a sophisticated content availability management system, it offers high reliability and performance.

The library's modular architecture allows developers to utilize its components independently or as a comprehensive solution, with simple high-level interfaces for common use cases and detailed lower-level control when needed.

Key innovations include the Gun.js integration for peer discovery and signaling, the content availability consensus system, and the coordinated NAT traversal approach that maximizes connection success rates across different network configurations.

---

## Appendix A: Diagram Descriptions

1. **High-level component architecture**: Diagram showing the main components and their relationships
2. **Interface relationships**: Diagram showing how the primary interfaces interact
3. **NAT Traversal flow**: Decision tree for NAT traversal techniques
4. **Peer discovery mechanisms**: Illustration of the four discovery methods
5. **Content availability workflow**: State diagram of content status transitions
6. **Chunked file transfer**: Illustration of multi-source parallel downloading
7. **Host operation flowchart**: Sequence diagram of hosting operations
8. **Client operation flowchart**: Sequence diagram of client operations
9. **NAT traversal decision tree**: Detailed flow chart of connection establishment
10. **Complete system interaction**: Comprehensive diagram showing all components working together 

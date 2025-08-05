# Transport Module

This module provides transport layer functionality for the Dig NAT Tools system, including file transfer, connection management, and network utilities.

## Components

The transport module includes these main components:

- **FileClient**: Downloads files from peers in the network
- **FileHost**: Serves files to other peers in the network
- **Utilities**: Network, IP, and dual-stack support for connections

## Usage

### Basic Usage

```typescript
import { createTransportSystem } from './transport';

// Create a complete transport system with both client and host
const transport = createTransportSystem({
  stunServers: ['stun.l.google.com:19302'],
  enableIPv6: true,
  preferIPv6: false,
  enableWebRTC: true
});

// Start the transport system
await transport.start();

// Use the client to download files
const filePath = await transport.client.downloadFile(
  'host-id', 
  'file-hash', 
  { savePath: './downloads/file.txt' }
);

// Use the host to serve files
transport.host.announceFileAvailable(
  'content-id',
  'file-hash',
  '/path/to/file.txt'
);

// Stop the transport system when done
await transport.stop();
```

### Client-Only Usage

```typescript
import { createClient } from './transport';

const client = createClient({
  stunServers: ['stun.l.google.com:19302'],
  enableIPv6: true
});

const filePath = await client.downloadFile(
  'host-id', 
  'file-hash', 
  { savePath: './downloads/file.txt' }
);

await client.stop();
```

### Host-Only Usage

```typescript
import { createHost } from './transport';

const host = createHost({
  stunServers: ['stun.l.google.com:19302'],
  tcpPort: 8080,
  udpPort: 8081
});

await host.start();

// Host specific events and methods
host.on('request', (info) => {
  console.log(`Received request for ${info.hash} from ${info.peerId}`);
});

await host.stop();
```

### Network Utilities

The transport module includes various network utilities:

```typescript
import { 
  discoverPublicIPs, 
  createPortMapping,
  connectWithIPv6Preference
} from './transport';

// Discover public IP addresses
const ips = await discoverPublicIPs({
  stunServers: ['stun.l.google.com:19302'],
  enableIPv6: true
});
console.log(`Public IPs: IPv4=${ips.ipv4}, IPv6=${ips.ipv6}`);

// Create port mappings
const mapping = await createPortMapping(8080, 'TCP', 'My App', 3600);

// Connect with IPv6 preference
const socket = await connectWithIPv6Preference('example.com', 80, 'tcp', {
  timeout: 5000,
  preferIPv6: true
});
```

## Architecture

The transport module is organized into:

1. **Core Components**:
   - `client.ts`: File download client
   - `host.ts`: File serving host

2. **Utilities**:
   - `utils/dual-stack.ts`: IPv4/IPv6 connection utilities
   - `utils/ip-helper.ts`: IP address utilities
   - `utils/network.ts`: Network discovery and port mapping

3. **Interfaces**:
   - Connection interfaces and types
   - Transport options 
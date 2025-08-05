# Connection Module

This module provides connection-related functionalities for the Dig NAT Tools system. It includes components for managing network connections, NAT traversal, and connection sessions.

## Structure

The module is organized into the following submodules:

- **client**: Client-side connection functionality
- **network**: Network-related connection functionality
- **registry**: Connection registration and tracking
- **session**: Connection session management
- **traversal**: NAT traversal functionality

### Traversal Submodule

The traversal submodule implements various NAT traversal techniques:

- **hole-punch**: UDP and TCP hole punching
- **ice**: Interactive Connectivity Establishment (ICE) protocol implementation
- **nat-pmp**: NAT Port Mapping Protocol and PCP implementations
- **turn**: Traversal Using Relays around NAT implementation
- **upnp**: UPnP protocol for port mapping
- **nat-traversal-manager**: Manager that orchestrates all traversal methods

## Usage

The connection module provides a unified interface for establishing peer-to-peer connections across different network configurations, including NAT traversal scenarios.

### Basic Usage

```typescript
import { natTraversalManager } from '@dignetwork/dig-nat-tools';

// Connect to a peer using the most appropriate method
const connection = await natTraversalManager.connect({
  peerId: 'remote-peer-id',
  address: 'remote-peer-address',
  port: 12345,
  protocol: 'TCP',
  // Gun.js instance for signaling
  gun: gunInstance,
  // STUN/TURN configuration
  stunServers: ['stun:stun.l.google.com:19302'],
  turnServer: 'turn:your-turn-server.com',
  turnUsername: 'username',
  turnCredential: 'password'
});

if (connection.success) {
  console.log(`Connected using ${connection.connectionType}`);
  const socket = connection.socket;
  // Use the socket for communication
} else {
  console.error(`Connection failed: ${connection.error}`);
}
```

### Connection Registry

The connection registry keeps track of successful connection methods for each peer, allowing for faster reconnection in the future:

```typescript
import { connectionRegistry } from '@dignetwork/dig-nat-tools';

// Get the most successful connection method for a peer
const connectionMethod = await connectionRegistry.getConnectionMethod('peer-id');

// Save a successful connection method
await connectionRegistry.saveSuccessfulConnection(
  'peer-id',
  CONNECTION_TYPE.UDP_HOLE_PUNCH,
  {
    address: '203.0.113.1',
    port: 12345
  }
);
``` 
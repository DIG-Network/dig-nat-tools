# Gun.js Integration for Dig NAT Tools

This documentation covers the integration of Gun.js into the Dig NAT Tools library, providing enhanced peer discovery and content availability management in challenging NAT environments.

## Overview

Gun.js is integrated into Dig NAT Tools to provide:

1. **Enhanced Peer Discovery**: Find peers even in challenging NAT environments
2. **Content Mapping**: Associate human-readable content IDs with file hashes
3. **Persistence**: Store peer and content information across sessions
4. **Content Availability Management**: Track and verify which peers have which content

## Peer Discovery with Gun.js

The `GunDiscovery` class provides peer discovery functionality using Gun.js as the underlying transport mechanism.

### Key Features

- **Cross-NAT Peer Discovery**: Find peers even behind symmetrical NATs
- **Content Mapping**: Map human-readable content IDs to file hashes
- **Persistence**: Store peer and content data across sessions
- **Event-Based**: Emit events when peers are discovered

### Usage

```typescript
import { createGunDiscovery } from '@dignetwork/dig-nat-tools';
import Gun from 'gun';

// Create a Gun instance
const gun = Gun({
  peers: ['https://gun-server.example.com/gun'], // Optional Gun server
  localStorage: false, // Use IndexedDB instead of localStorage
  radisk: true, // Enable persistent storage
});

// Create a GunDiscovery instance
const gunDiscovery = createGunDiscovery({
  gun,
  nodeId: 'your-unique-node-id',
  persistenceEnabled: true,
  persistenceDir: './data',
  announceTTL: 3600000 // 1 hour in milliseconds
});

// Start the discovery service
await gunDiscovery.start();

// Announce yourself as a peer for a specific content hash
gunDiscovery.announce('content-hash', {
  port: 8080,
  contentId: 'my-video', // Optional human-readable ID
  ttl: 3600000 // Optional TTL override
});

// Find peers for a specific content hash
const peers = await gunDiscovery.findPeers('content-hash', {
  maxPeers: 10,
  timeout: 5000
});

// Map a content ID to a hash
gunDiscovery.mapContentIdToHash('my-video', 'content-hash');

// Find content hash by ID
const hash = await gunDiscovery.findHashByContentId('my-video');

// Listen for peer discovery events
gunDiscovery.on('peer:discovered', (peer) => {
  console.log('Discovered peer:', peer);
});

// Stop announcing
gunDiscovery.unannounce('content-hash');

// Stop the discovery service
await gunDiscovery.stop();
```

## Content Availability Management

The content availability management system tracks which peers have which content and manages the announcement and verification of content availability.

### Key Components

#### ContentAvailabilityManager

The core component that tracks content availability, processes reports, and manages peer reputations.

```typescript
import { createContentAvailabilityManager } from '@dignetwork/dig-nat-tools';

// Create a manager instance
const contentManager = createContentAvailabilityManager({
  nodeId: 'your-node-id',
  gun: gunInstance,              // Optional Gun.js instance
  contentTTL: 3600000,           // Optional, default: 1 hour
  reannounceInterval: 1800000,   // Optional, default: 30 minutes
  enableVerification: true,      // Optional, default: true
  persistenceEnabled: true,      // Optional, default: false
  persistenceDir: './data'       // Optional, default: './.dig-data'
});

// Start the manager
await contentManager.start();

// Announce content availability
contentManager.announceContentAvailable('content-hash', {
  port: 8080,
  contentId: 'my-video',         // Optional human-readable ID
  ttl: 7200000                   // Optional custom TTL
});

// Announce content unavailability
contentManager.announceContentUnavailable('content-hash', 'my-video');

// Report unavailable content
contentManager.reportContentUnavailable('peer-id', 'content-hash');

// Get peer status for content
const status = contentManager.getPeerContentStatus('peer-id', 'content-hash');

// Stop the manager
await contentManager.stop();
```

#### DiscoveryContentIntegration

The integration layer that connects ContentAvailabilityManager with peer discovery systems.

```typescript
import { createDiscoveryContentIntegration } from '@dignetwork/dig-nat-tools';

// Create an integration instance
const integration = createDiscoveryContentIntegration({
  nodeId: 'your-node-id',
  gun: gunInstance,
  verificationTimeout: 10000,
  enableDHTIntegration: true,
  enablePEXIntegration: true,
  enableGunIntegration: true
});

// Register discovery components
integration.registerDHTClient(dhtClient);
integration.registerPEXManager(pexManager);
integration.registerGunDiscovery(gunDiscovery);

// Start the integration
await integration.start();

// Filter peers based on content status
const filteredPeers = integration.filterPeersByContentStatus(peerList, 'content-hash');

// Stop the integration
await integration.stop();
```

## Integrating All Components

The following example demonstrates how to integrate Gun.js peer discovery with content availability management:

```typescript
import { 
  createGunDiscovery, 
  createContentAvailabilityManager,
  createDiscoveryContentIntegration,
  createDHTClient,
  createPEXManager
} from '@dignetwork/dig-nat-tools';
import Gun from 'gun';

// Create a Gun instance
const gun = Gun({
  peers: ['https://gun-server.example.com/gun'],
  localStorage: false,
  radisk: true
});

// Create a unique node ID
const nodeId = Math.random().toString(36).substring(2, 15);

// Set up discovery components
const dhtClient = createDHTClient({ nodeId });
const pexManager = createPEXManager({ nodeId });
const gunDiscovery = createGunDiscovery({ gun, nodeId });

// Create content availability manager
const contentManager = createContentAvailabilityManager({
  nodeId,
  gun,
  persistenceEnabled: true
});

// Create discovery integration
const integration = createDiscoveryContentIntegration({
  nodeId,
  gun
});

// Register components with integration
integration.registerDHTClient(dhtClient);
integration.registerPEXManager(pexManager);
integration.registerGunDiscovery(gunDiscovery);

// Start all components
await Promise.all([
  dhtClient.start(),
  pexManager.start(),
  gunDiscovery.start(),
  contentManager.start(),
  integration.start()
]);

// Announce content availability
contentManager.announceContentAvailable('content-hash', {
  port: 8080,
  contentId: 'my-video'
});

// Find peers for content
const peers = await Promise.all([
  dhtClient.findPeers('content-hash'),
  pexManager.findPeers('content-hash'),
  gunDiscovery.findPeers('content-hash')
]);

// Flatten and deduplicate peers
const allPeers = [...new Set(peers.flat())];

// Filter out peers that don't have content
const validPeers = integration.filterPeersByContentStatus(allPeers, 'content-hash');

// Connect to peers and download content
// ...

// If peer doesn't have content, report it
integration.reportContentUnavailable('peer-id', 'content-hash');

// When shutting down, announce content unavailability
contentManager.announceContentUnavailable('content-hash', 'my-video');

// Stop all components
await Promise.all([
  integration.stop(),
  contentManager.stop(),
  gunDiscovery.stop(),
  pexManager.stop(),
  dhtClient.stop()
]);
```

## Advanced Configuration

### GunDiscovery Configuration Options

```typescript
interface GunDiscoveryOptions {
  gun: IGunInstance;             // Gun.js instance
  nodeId: string;                // Unique node identifier
  persistenceEnabled?: boolean;  // Enable persistence (default: false)
  persistenceDir?: string;       // Directory for persistence (default: './.dig-data')
  announceTTL?: number;          // Announcement TTL in ms (default: 1 hour)
  maxCachedPeers?: number;       // Maximum cached peers (default: 100)
  peerMapName?: string;          // Name of peer map in Gun (default: 'peers')
  contentMapName?: string;       // Name of content map in Gun (default: 'content')
}
```

### ContentAvailabilityManager Configuration Options

```typescript
interface ContentAvailabilityOptions {
  nodeId: string;                // Unique node identifier
  gun?: IGunInstance;            // Optional Gun.js instance
  contentTTL?: number;           // TTL for content announcements (default: 1 hour)
  reannounceInterval?: number;   // Re-announce interval (default: 30 minutes)
  enableVerification?: boolean;  // Enable content verification (default: true)
  persistenceEnabled?: boolean;  // Enable persistence (default: false)
  persistenceDir?: string;       // Directory for persistence (default: './.dig-data')
  maxReportAge?: number;         // Maximum report age in ms (default: 24 hours)
  lowReportThreshold?: number;   // Threshold for LOW report level (default: 2)
  mediumReportThreshold?: number;// Threshold for MEDIUM report level (default: 3)
  highReportThreshold?: number;  // Threshold for HIGH report level (default: 5)
  minUniqueReporters?: number;   // Minimum unique reporters for HIGH (default: 3)
}
```

### DiscoveryContentIntegration Configuration Options

```typescript
interface DiscoveryContentIntegrationOptions {
  nodeId: string;                // Unique node identifier
  gun?: IGunInstance;            // Optional Gun.js instance
  verificationTimeout?: number;  // Verification timeout in ms (default: 10000)
  enableDHTIntegration?: boolean;// Enable DHT integration (default: true)
  enablePEXIntegration?: boolean;// Enable PEX integration (default: true)
  enableGunIntegration?: boolean;// Enable Gun integration (default: true)
  maxVerificationRetries?: number;// Max verification retries (default: 3)
}
```

## API Reference

For a complete API reference, please refer to:

- [GunDiscovery API Documentation](./gun-peer-discovery.md)
- [Content Availability Management Documentation](./content-availability-management.md)

## Troubleshooting

### Common Issues

#### Gun.js Connection Problems

If you're experiencing connection issues with Gun.js:

- Verify that the Gun server is running and accessible
- Check if your firewall is blocking WebSocket connections
- Try connecting to a public Gun server as a fallback

#### Peer Discovery Issues

If peers are not being discovered:

- Ensure that both peers are running the same version of Gun.js
- Verify that both peers have the same Gun configuration
- Check if the content hash is correctly formatted
- Ensure that firewalls are not blocking P2P connections

#### Content Availability Issues

If content availability management is not working as expected:

- Check if verification callbacks are properly registered
- Verify that the content hash matches the one used for announcements
- Ensure that the peer ID is consistent across all components
- Check if the TTL values are appropriate for your use case

## Contributing

Contributions to improve Gun.js integration and content availability management are welcome! Please see [CONTRIBUTING.md](../CONTRIBUTING.md) for more information.

## License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details. 
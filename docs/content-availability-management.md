# Content Availability Management

This module provides a comprehensive system for tracking and managing content availability in peer-to-peer networks. It handles both host-initiated content removal and client-detected content unavailability with consensus mechanisms.

## Key Features

- **Host-Initiated Content Removal**: Hosts can explicitly announce when they no longer have content
- **Client-Detected Content Unavailability**: Clients can report when content is not available from a peer
- **Consensus Mechanism**: Requires multiple reports from different peers before marking content as unavailable
- **Verification**: Direct probing to confirm if a peer has content before removal
- **Time-Based Report Decay**: Old reports expire after a configurable time period
- **Reputation System**: Reports from peers with better reputation carry more weight
- **Graduated Response**: Progressive levels of actions based on report count and verification
- **Cross-Discovery Integration**: Works with DHT, PEX, and Gun.js discovery mechanisms

## Key Components

### ContentAvailabilityManager

The core component that tracks content availability, processes reports, and manages peer reputations.

```typescript
import { 
  createContentAvailabilityManager, 
  PeerContentStatus 
} from '@dignetwork/dig-nat-tools';

// Create a manager instance
const contentManager = createContentAvailabilityManager({
  nodeId: 'your-node-id',        // Required
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
  port: 8080,                    // Optional port
  contentId: 'my-video',         // Optional human-readable ID
  ttl: 7200000                   // Optional custom TTL
});

// Announce content unavailability
contentManager.announceContentUnavailable('content-hash', 'my-video');

// Report unavailable content
contentManager.reportContentUnavailable('peer-id', 'content-hash');

// Get peer status for content
const status = contentManager.getPeerContentStatus('peer-id', 'content-hash');
// Returns: PeerContentStatus.AVAILABLE, SUSPECT, or UNAVAILABLE

// Determine if a peer should be considered for content
const shouldConsider = contentManager.shouldConsiderPeerForContent('peer-id', 'content-hash');

// Update peer reputation
contentManager.updatePeerReputation('peer-id', true); // Successful interaction
contentManager.updatePeerReputation('peer-id', false); // Failed interaction

// Stop the manager
await contentManager.stop();
```

### DiscoveryContentIntegration

An integration layer that connects the ContentAvailabilityManager with peer discovery systems.

```typescript
import { 
  createDiscoveryContentIntegration 
} from '@dignetwork/dig-nat-tools';

// Create an integration instance
const integration = createDiscoveryContentIntegration({
  nodeId: 'your-node-id',
  gun: gunInstance,                     // Optional
  verificationTimeout: 10000,           // Optional, default: 10 seconds
  enableDHTIntegration: true,           // Optional, default: true
  enablePEXIntegration: true,           // Optional, default: true
  enableGunIntegration: true            // Optional, default: true
});

// Register discovery components
integration.registerDHTClient(dhtClient);
integration.registerPEXManager(pexManager);
integration.registerGunDiscovery(gunDiscovery);

// Register verification callbacks
integration.registerVerificationCallback('content-hash', 
  async (peerId, infoHash) => {
    // Verify if peer has content
    return true; // or false
  }
);

// Start the integration
await integration.start();

// Filter peers based on content status
const filteredPeers = integration.filterPeersByContentStatus(peerList, 'content-hash');

// Listen for events
integration.on('peer:statusChanged', (data) => {
  console.log(`Peer ${data.peerId} status changed: ${data.previousStatus} -> ${data.status}`);
});

integration.on('peer:verified', (result) => {
  console.log(`Peer ${result.peerId} verified: ${result.hasContent ? 'has content' : 'no content'}`);
});

// Stop the integration
await integration.stop();
```

## Status Levels

The system uses a graduated response model with three content status levels:

1. **AVAILABLE**: The peer is believed to have the content
2. **SUSPECT**: The peer might not have the content (based on limited reports)
3. **UNAVAILABLE**: The peer definitely doesn't have the content (based on consensus or verification)

## Report Levels

Reports go through four levels:

1. **NONE**: No reports or expired reports
2. **LOW**: Small number of reports (2+)
3. **MEDIUM**: More substantial reports (3+)
4. **HIGH**: High number of reports (5+) from multiple unique reporters (3+)

## Integration with Peer Discovery

The system integrates with various peer discovery mechanisms:

### DHT Integration

When a peer is marked as not having content:
- It's removed from the local DHT routing table for that content
- Other DHT nodes are notified to update their routing tables

### PEX Integration

When a peer is marked as not having content:
- It's removed from the PEX exchange list for that content
- Other peers are notified during the next PEX exchange

### Gun.js Integration

When a peer is marked as not having content:
- Its announcement is removed from the Gun.js network
- Other peers connected to Gun.js will see this update in real-time

## Verification Process

1. When a peer is reported as not having content, a verification process is started
2. A direct connection is attempted to verify if the peer actually has the content
3. If verification succeeds, all reports are reset
4. If verification fails, the peer is immediately marked as UNAVAILABLE
5. If verification cannot be completed (connection failures), multiple attempts are made

## Example Usage

The following example demonstrates how to integrate the content availability management system into a peer-to-peer application:

```typescript
import { 
  createDiscoveryContentIntegration,
  createDHTClient,
  createPEXManager,
  createGunDiscovery
} from '@dignetwork/dig-nat-tools';

// Set up discovery components
const dhtClient = createDHTClient();
const pexManager = createPEXManager();
const gunDiscovery = createGunDiscovery({ gun });

// Create content integration
const contentIntegration = createDiscoveryContentIntegration({
  nodeId: 'my-node-id',
  gun
});

// Register components
contentIntegration.registerDHTClient(dhtClient);
contentIntegration.registerPEXManager(pexManager);
contentIntegration.registerGunDiscovery(gunDiscovery);

// Start everything
await dhtClient.start();
await pexManager.start();
await gunDiscovery.start();
await contentIntegration.start();

// When downloading files, filter out peers that don't have content
const allPeers = await dhtClient.findPeers(contentHash);
const validPeers = contentIntegration.filterPeersByContentStatus(allPeers, contentHash);

// After successful download, update reputation
contentIntegration.updatePeerReputation(peerId, true);

// If download fails due to missing content
contentIntegration.reportContentUnavailable(peerId, contentHash);

// When you stop hosting content
contentIntegration.announceContentUnavailable(contentHash);
```

See the full example in `examples/content-availability-example.ts`. 
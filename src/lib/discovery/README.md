# Discovery Module

This module contains peer and content discovery functionality for the Dig NAT Tools system.

## Structure

The discovery module is now organized into two main components:

### Peer Discovery (`/peer`)

Handles finding peers on the network through various discovery mechanisms:

- **DHT**: Kademlia DHT implementation for peer discovery
- **PEX**: Peer Exchange implementation
- **Local Discovery**: Local network discovery using UDP multicast
- **Gun.js Discovery**: Gun.js-based discovery implementation
- **Peer Discovery Manager**: Main orchestration for peer discovery methods

### Content Discovery (`/content`)

Tracks content availability across the network:

- **Content Availability Manager**: Tracks content reputation and availability
- **Discovery Content Integration**: Integrates peer discovery and content availability

## Integration

The discovery module can be used in several ways:

1. Use the unified discovery system:
   ```typescript
   import { createDiscoverySystem } from './discovery';
   
   const discovery = createDiscoverySystem({
     enableDHT: true,
     enablePEX: true,
     enableLocal: true,
     enableGun: true,
     enableContentTracking: true
   });
   
   await discovery.start();
   ```

2. Use peer discovery directly:
   ```typescript
   import { PeerDiscoveryManager } from './discovery/peer';
   
   const peerDiscovery = new PeerDiscoveryManager({
     enableDHT: true,
     enablePEX: true,
     enableLocal: true,
     enableGun: true
   });
   
   await peerDiscovery.start();
   const peers = await peerDiscovery.findPeers('some-content-id');
   ```

3. Use content discovery directly:
   ```typescript
   import { createDiscoveryIntegration } from './discovery/content';
   
   const contentDiscovery = createDiscoveryIntegration({
     nodeId: 'my-node-id',
     enableVerification: true
   });
   
   await contentDiscovery.start();
   ```

## Helpful Utilities

The discovery module provides several utility functions:

- `findPeers(infoHash, options)`: Find peers for specific content
- `announceContent(contentId, fileHash, options)`: Announce content availability
- `createDiscoveryIntegration(options)`: Create content integration
- `createContentAvailabilityManager(options)`: Create content manager

## Files

The following files need to be moved from `src/lib/utils/` to `src/lib/discovery/`:

1. **dht.ts**: Kademlia DHT implementation for peer discovery
2. **pex.ts**: Peer Exchange implementation
3. **local-discovery.ts**: Local network discovery using UDP multicast
4. **gun-discovery.ts**: Gun.js-based discovery implementation
5. **peer-discovery-manager.ts**: Main discovery orchestration
6. **discovery-content-integration.ts**: Integration between discovery and content availability

## Migration Steps

1. Create the directory structure
2. Create initial skeletons of files with proper imports
3. Copy the full content from original files
4. Update imports to reflect the new structure
5. Update the main index.ts to export all discovery functionality

## Post-Migration Tasks

1. Remove the original files from src/lib/utils/
2. Update imports in other files that reference these modules
3. Test all discovery functionality to ensure it works as expected

## Integration with Main Code

The discovery module is used by the NetworkManager to find peers and share content across the network. This module provides multiple peer discovery mechanisms:

- DHT: Distributed Hash Table for decentralized peer discovery
- PEX: Peer Exchange for sharing peer lists between connected peers
- Local Discovery: Find peers on the local network via UDP multicast
- Gun.js Discovery: Use Gun.js as a signaling and discovery mechanism

## Examples

```typescript
// Example usage
import { PeerDiscoveryManager } from './discovery';

const discoveryManager = new PeerDiscoveryManager({
  enableDHT: true,
  enablePEX: true,
  enableLocal: true,
  enableGun: true
});

await discoveryManager.start();
const peers = await discoveryManager.findPeers('some-content-id');
``` 
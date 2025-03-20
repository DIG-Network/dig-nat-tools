# Using Gun.js for Peer Discovery

This guide explains how to use Gun.js as a peer discovery mechanism in the Dig NAT Tools library, providing an alternative or complementary approach to existing techniques like DHT, PEX, and local discovery.

## Overview

Gun.js is a decentralized, real-time graph database that inherently supports peer-to-peer communication. When integrated with Dig NAT Tools, it offers several advantages for peer discovery:

- **Real-time peer updates**: Discover new peers as soon as they announce themselves
- **Cross-NAT connectivity**: Connect through public relay servers, bypassing even the most restrictive NATs
- **Persistent storage**: Maintain peer information between sessions
- **Content addressing**: Map human-readable content IDs to file hashes
- **Lightweight**: Minimal resource usage with powerful discovery capabilities

## Requirements

To use Gun.js for peer discovery, you need to install the Gun.js library:

```bash
npm install gun
```

For additional security features, you may also want to install the SEA module:

```bash
npm install gun-sea
```

## Configuration

### Basic Gun.js Options

When initializing the `NetworkManager` or `PeerDiscoveryManager`, you can enable Gun.js by providing Gun options:

```typescript
import { NetworkManager } from '@dignetwork/dig-nat-tools';

// Create a network manager with Gun.js enabled
const network = new NetworkManager({
  gunOptions: {
    // Array of Gun.js relay servers
    peers: [
      'https://gun-relay.yourcompany.com/gun',
      'https://gun-relay.herokuapp.com/gun'
    ],
    
    // Local storage path (for Node.js)
    file: './.gun',
    
    // Other Gun.js options
    localStorage: false,  // Disable localStorage in Node.js
    radisk: true,         // Enable disk persistence
    multicast: false      // Disable multicast for private networks
  }
});

await network.start();
```

### Using with PeerDiscoveryManager

If you're using the `PeerDiscoveryManager` directly:

```typescript
import { PeerDiscoveryManager } from '@dignetwork/dig-nat-tools';
import Gun from 'gun';

// Create a Gun instance
const gun = new Gun({
  peers: ['https://gun-relay.example.com/gun'],
  file: './.gun'
});

// Pass the Gun instance to the PeerDiscoveryManager
const discoveryManager = new PeerDiscoveryManager({
  enableDHT: true,
  enablePEX: true,
  enableLocal: true,
  enableGun: true,   // Enable Gun.js discovery
  gun: gun,          // Pass your Gun instance
  nodeId: 'your-unique-node-id'
});

await discoveryManager.start();
```

## Using Gun.js Discovery

### Basic Usage with NetworkManager

The simplest way to use Gun.js discovery is through the `NetworkManager`:

```typescript
import { NetworkManager } from '@dignetwork/dig-nat-tools';

const network = new NetworkManager({
  gunOptions: {
    peers: ['https://gun-relay.example.com/gun']
  }
});

await network.start();

// Share a file (automatically announced via Gun.js)
const fileHash = await network.shareFile('/path/to/file.mp4', 'awesome-video');

// Download using content ID (peers discovered via Gun.js)
const savePath = await network.downloadFile('awesome-video', {
  savePath: './downloads/awesome-video.mp4'
});

// Listen for discovered peers
network.on('peer:discovered', (peer) => {
  console.log(`Discovered peer via ${peer.source}: ${peer.address}:${peer.port}`);
});
```

### Advanced Usage: GunDiscovery Class

For more control, you can use the `GunDiscovery` class directly:

```typescript
import { GunDiscovery, NetworkManager } from '@dignetwork/dig-nat-tools';
import Gun from 'gun';

// Create your own Gun instance
const gun = new Gun({
  peers: ['https://gun-relay.example.com/gun'],
  file: './.gun'
});

// Create the GunDiscovery instance
const gunDiscovery = new GunDiscovery({
  gun,
  nodeId: 'your-unique-node-id',
  announceInterval: 60000, // Re-announce every 60 seconds
  peerTTL: 3600000         // Keep peers for 1 hour
});

// Start discovery
await gunDiscovery.start();

// Add an info hash to track
gunDiscovery.addInfoHash('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

// Listen for discovered peers
gunDiscovery.on('peer:discovered', (peer) => {
  console.log(`Discovered peer with Gun.js: ${peer.address}:${peer.port}`);
  console.log(`Peer has files: ${peer.infoHashes.join(', ')}`);
});

// Find peers for a specific hash
const peers = await gunDiscovery.findPeers('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
console.log(`Found ${peers.length} peers with the file`);
```

## Using Multiple Discovery Methods

Gun.js discovery works especially well when combined with other discovery methods:

```typescript
const discoveryManager = new PeerDiscoveryManager({
  enableDHT: true,    // Use Kademlia DHT
  enablePEX: true,    // Use Peer Exchange
  enableLocal: true,  // Use local network discovery
  enableGun: true,    // Use Gun.js discovery
  gun: gun            // Your Gun instance
});

await discoveryManager.start();

// Add info hashes to track (announced on all enabled methods)
await discoveryManager.addInfoHash('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

// Peers will be discovered from all sources
discoveryManager.on('peer:discovered', (peer) => {
  console.log(`Discovered peer via ${peer.source}: ${peer.address}:${peer.port}`);
});
```

## Content Mapping with Gun.js

Gun.js excels at content mapping, allowing you to use human-readable names for content:

```typescript
// Share a file with a content ID
await network.shareFile('/path/to/file.mp4', 'awesome-video-2023');

// The content ID is mapped to the file hash in Gun.js
const fileHash = network.getContentHash('awesome-video-2023');
console.log(`Content ID 'awesome-video-2023' maps to hash: ${fileHash}`);

// Lookup content ID from hash
const contentId = network.getContentId(fileHash);
console.log(`Hash ${fileHash} maps to content ID: ${contentId}`);

// Download using the content ID
const savePath = await network.downloadFile('awesome-video-2023', {
  savePath: './downloads/my-video.mp4'
});
```

## Security Considerations

### Public Relay Servers

When using public Gun.js relay servers, be aware that:

1. Peer announcements are visible to anyone using the same relay
2. Content mappings (not the content itself) are stored on the relay
3. Relay servers can see which peers are connecting

For maximum privacy:

- Run your own private Gun.js relay server
- Use content hashes instead of descriptive content IDs
- Consider encrypting sensitive content mappings using Gun.js SEA module

### Encrypting Content Mappings

```typescript
import Gun from 'gun';
import 'gun/sea';

const gun = new Gun({
  peers: ['https://gun-relay.example.com/gun']
});

// Create a pair for encryption
const pair = await Gun.SEA.pair();

// Create encrypted content mappings
const user = gun.user().auth(pair);
user.get('contentMaps').get('my-private-video').secret(fileHash);

// Retrieve encrypted content mappings
const hash = await user.get('contentMaps').get('my-private-video').then();
console.log(`Encrypted content hash: ${hash}`);
```

### Peer Verification

To ensure you're connecting to legitimate peers, implement additional verification:

```typescript
network.on('peer:discovered', async (peer) => {
  // Verify the peer is legitimate before connecting
  if (await verifyPeer(peer)) {
    // Connect to the verified peer
    await network.connectToPeer(peer);
  }
});

async function verifyPeer(peer) {
  // Implement your verification logic
  // For example, check against a known peers list,
  // verify a signature, or implement a challenge-response
  return true; // Return true if peer is verified
}
```

## Advanced Configuration

### Running Your Own Gun.js Relay

For production deployments, it's recommended to run your own Gun.js relay server:

```bash
# Install Gun.js globally
npm install -g gun

# Create a simple relay server
echo "require('gun')({ web: require('http').createServer().listen(8765) })" > relay.js

# Run the relay
node relay.js
```

Then configure your application to use your relay:

```typescript
const network = new NetworkManager({
  gunOptions: {
    peers: ['http://your-relay-server.com:8765/gun']
  }
});
```

### WebRTC Configuration

Gun.js supports WebRTC for direct peer-to-peer connections:

```typescript
const network = new NetworkManager({
  gunOptions: {
    peers: ['https://gun-relay.example.com/gun'],
    rtc: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: 'turn:your-turn-server.com',
          username: 'your-username',
          credential: 'your-password'
        }
      ]
    }
  }
});
```

## Troubleshooting

### Discovering No Peers

If you're not discovering peers:

1. Verify Gun.js is properly initialized
2. Check that you're using the same relay server as other peers
3. Ensure your info hashes match exactly
4. Try increasing the announce interval and peer TTL

### Connectivity Issues

If peers are discovered but connections fail:

1. Verify NAT traversal settings
2. Try different relay servers
3. Enable additional discovery methods as fallback

### Persistence Problems

If peer information isn't persisting between sessions:

1. Verify the `file` option is set correctly
2. Check file permissions on the directory
3. Enable debug logging for Gun.js: `localStorage.debug = true`

## Conclusion

Gun.js provides a powerful addition to the peer discovery capabilities of Dig NAT Tools, especially useful in challenging NAT environments. By combining Gun.js with traditional discovery methods, you can create robust, real-time peer discovery that works across various network configurations. 
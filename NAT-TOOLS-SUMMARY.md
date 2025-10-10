# NAT Tools - Simplified Interface Summary

## Overview

A new simplified interface has been added to `dig-nat-tools` that focuses exclusively on magnet URI sharing and WebTorrent operations. This interface coexists with the existing `FileHost` and `FileClient` classes.

## What Was Added

### 1. Extended GunRegistry (`src/registry/gun-registry.ts`)

Added four new methods for magnet URI management:

- **`shareMagnetUri(magnetUri: string, nodeId?: string): Promise<void>`**
  - Shares a magnet URI in the Gun.js registry
  - Uses the info hash as the key
  - Stores timestamp for freshness checking

- **`fetchMagnetUris(maxAgeMs: number = 60000): Promise<string[]>`**
  - Fetches all magnet URIs from registry
  - Filters by age (default: 1 minute)
  - Returns unique magnet URIs only
  - No association with specific peers

- **`unshareMagnetUri(magnetUri: string): Promise<void>`**
  - Removes a magnet URI from the registry
  - Uses info hash for removal

- **Implementation Details:**
  - Uses `{namespace}-magnets` as the Gun.js key
  - Each magnet URI is stored with: `{ magnetUri, infoHash, nodeId, timestamp }`
  - Info hash is extracted from the magnet URI and used as the key

### 2. NatTools Class (`src/nat-tools.ts`)

A simplified interface that wraps WebTorrentManager and GunRegistry:

#### Key Features:
- **Automatic initialization** of WebTorrent and Gun.js
- **Simplified seeding** with automatic registry sharing
- **Discovery** of magnet URIs from all peers (no peer-specific logic)
- **Download** from magnet URIs
- **Tracking** of seeded files locally

#### Public Methods:

```typescript
class NatTools {
  // Initialize the system
  async initialize(): Promise<void>

  // Seed a file and share its magnet URI
  async seedFile(filePath: string, nodeId?: string): Promise<SeedResult>

  // Stop seeding a file
  async unseedFile(filePath: string): Promise<boolean>

  // Download from a magnet URI
  async downloadFromMagnet(magnetUri: string, maxFileSizeBytes?: number): Promise<Buffer>

  // Discover all available magnet URIs (default: last 1 minute)
  async discoverMagnetUris(maxAgeMs?: number): Promise<string[]>

  // Get currently seeded files
  getSeededFiles(): Map<string, string>

  // Get active torrent count
  getActiveTorrentsCount(): number

  // Check availability
  isWebTorrentAvailable(): boolean
  isRegistryAvailable(): boolean

  // Cleanup
  async destroy(): Promise<void>
}
```

### 3. Example Application (`examples/nat-tools-example.js`)

A complete working example that:
- Scans `~/.dig` directory for `*.dig` files
- Seeds all found files
- Shares magnet URIs via Gun.js
- Periodically discovers magnet URIs from other peers (every 30 seconds)
- Downloads files that aren't already present
- Automatically seeds downloaded files
- Handles graceful shutdown (Ctrl+C)

### 4. Updated Exports (`src/index.ts`)

```typescript
export { NatTools }
export type { NatToolsOptions, SeedResult }
```

### 5. Updated Documentation (`README.md`)

- Added "Quick Start: Simplified NAT Tools" section
- Added NatTools API documentation
- Added instructions for running the example

## Usage Example

```typescript
import { NatTools } from 'dig-nat-tools';

// Create and initialize
const natTools = new NatTools({
  peers: ['http://dig-relay-prod.eba-2cmanxbe.us-east-1.elasticbeanstalk.com/gun'],
  namespace: 'my-app'
});

await natTools.initialize();

// Seed a file
const result = await natTools.seedFile('./myfile.txt');
console.log('Magnet URI:', result.magnetUri);

// Discover magnet URIs (from last 1 minute)
const magnetUris = await natTools.discoverMagnetUris(60000);

// Download a file
if (magnetUris.length > 0) {
  const buffer = await natTools.downloadFromMagnet(magnetUris[0]);
  // Use the buffer...
}

// Cleanup
await natTools.destroy();
```

## Running the Example

```bash
# Build the project
npm install
npm run build

# Run the example
node examples/nat-tools-example.js
```

### Creating Test Files

Windows:
```powershell
mkdir $env:USERPROFILE\.dig
echo "Test content" > $env:USERPROFILE\.dig\test.dig
```

Linux/Mac:
```bash
mkdir -p ~/.dig
echo "Test content" > ~/.dig/test.dig
```

## Key Design Decisions

1. **No Peer Association**: Unlike the full `FileHost`/`FileClient` system, magnet URIs are not associated with specific peers. Any peer can share any magnet URI.

2. **Time-Based Filtering**: Magnet URIs are filtered by age (default: 1 minute) to keep the registry fresh.

3. **Info Hash as Key**: The info hash from the magnet URI is used as the Gun.js key, ensuring uniqueness.

4. **Coexistence**: The new NatTools interface coexists with the existing FileHost/FileClient system without breaking changes.

5. **Singleton WebTorrent**: Uses the existing `webTorrentManager` singleton to avoid resource conflicts.

## Architecture

```
NatTools
├── Uses: webTorrentManager (singleton)
│   ├── seedFile() → returns magnet URI
│   ├── downloadFile() → downloads from magnet URI
│   └── removeTorrent() → stops seeding
│
└── Uses: GunRegistry
    ├── shareMagnetUri() → publishes to Gun.js
    ├── fetchMagnetUris() → discovers from Gun.js
    └── unshareMagnetUri() → removes from Gun.js
```

## Benefits

- **Simpler API**: No need to understand capabilities, hosts, or clients
- **Automatic Discovery**: Files are automatically discovered from all peers
- **WebTorrent Only**: Focus on P2P, no HTTP server needed
- **Easy Integration**: Single class handles everything
- **Backward Compatible**: Existing code continues to work

## Next Steps

To use this in your project:

1. Import `NatTools` from `dig-nat-tools`
2. Initialize with your Gun.js relay peers
3. Call `seedFile()` to share files
4. Call `discoverMagnetUris()` to find files
5. Call `downloadFromMagnet()` to get files

The example application (`examples/nat-tools-example.js`) demonstrates a complete P2P file sharing system using this simplified interface.

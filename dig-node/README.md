# DIG Node - Decentralized File Sharing Node

A peer-to-peer file sharing node for the DIG Network that automatically discovers, shares, and synchronizes `.dig` files across the network. The node acts as both a server hosting your local files and a client discovering and downloading files from other nodes.

## What is a DIG Node?

A DIG Node is a service-like application that runs continuously on your system, participating in a decentralized file sharing network. It:

- **Hosts files**: Automatically shares all `.dig` files from a specified directory
- **Discovers peers**: Connects to other nodes on the network using GunJS peer-to-peer protocol
- **Downloads files**: Automatically fetches `.dig` files announced by other nodes
- **Syncs continuously**: Monitors file changes and announces updates to the network
- **Works transparently**: Runs as a background service without user intervention

## Core Functionality

### File Discovery & Sharing
- Scans a designated directory (default: `~/.dig`) for `.dig` files
- Calculates SHA-256 hashes for file integrity verification
- Announces available files to the network via GunJS messaging
- Automatically shares files through multiple protocols (HTTP, WebTorrent, WebRTC)

### Peer-to-Peer Networking
- Connects to the DIG network using GunJS decentralized database
- Listens for file announcements from other nodes
- Maintains a registry of known peers and their capabilities
- Supports multiple connection methods: direct HTTP, WebTorrent magnet links, UPnP port forwarding

### Automatic Synchronization
- Watches the `.dig` directory for file changes (add, modify, delete)
- Periodically announces file availability to maintain network presence  
- Downloads newly discovered files from other peers automatically
- Prevents duplicate downloads through intelligent queuing

### File Transfer Protocols
- **Direct HTTP**: Direct peer-to-peer file transfer over HTTP
- **WebTorrent**: BitTorrent-compatible transfers using magnet URIs
- **WebRTC**: Browser-compatible real-time communication for transfers
- **UPnP**: Automatic NAT traversal for improved connectivity

## Features

- **Cross-platform CLI**: Easy-to-use command-line interface
- **Windows Service Support**: Install and run as a background Windows service  
- **Real-time File Watching**: Instantly shares new files and detects changes
- **Intelligent Download Management**: Prevents duplicate downloads and manages transfer queues
- **Multiple Transfer Protocols**: Supports HTTP, WebTorrent, and WebRTC for maximum compatibility
- **Network Discovery**: Automatically finds and connects to other DIG nodes
- **Comprehensive Logging**: Detailed logs for monitoring and troubleshooting

## Requirements

- Windows 10/11 or Windows Server 2016+
- Node.js 18+ (https://nodejs.org/)
- Administrator privileges (for service installation)

## Installation

### Quick Install

1. **Download** or clone this repository
2. **Run as Administrator**: Right-click `install.bat` and select "Run as administrator"
3. Follow the installation prompts

### Manual Install

```powershell
# 1. Install dependencies
npm install

# 2. Build the project
npm run build

# 3. Install CLI globally
npm link

# 4. Create sample config
dig-node config
```

## Usage

### Basic Commands

```bash
# Show help
dig-node --help

# Generate configuration file
dig-node config

# Start node in foreground (for testing)
dig-node start

# Start with custom config
dig-node start -c ./my-config.json
```

### Windows Service Commands

```bash
# Install as Windows service
dig-node install-service

# Install with custom config
dig-node install-service -c ./my-config.json

# Start the service
dig-node start-service

# Stop the service
dig-node stop-service

# Check service status
dig-node status

# Uninstall the service
dig-node uninstall-service
```

**Note**: The service implementation uses a CommonJS wrapper to handle ES module compatibility issues with node-windows. The service will automatically resolve module paths and handle the ES module/CommonJS bridge.

## Configuration

The configuration file (`dig-node-config.json`) contains:

```json
{
  "port": 8080,
  "digDirectory": "C:\\Users\\YourUser\\.dig",
  "gunOptions": {
    "peers": ["http://nostalgiagame.go.ro:30878/gun"],
    "namespace": "dig-network",
    "webrtc": {
      "iceServers": [
        { "urls": "stun:stun.l.google.com:19302" }
      ]
    }
  },
  "logLevel": "info",
  "syncInterval": 30000,
  "maxConcurrentDownloads": 5
}
```

### Configuration Options

- **port**: Port for the local HTTP file server (default: 8080)
- **digDirectory**: Directory where `.dig` files are stored and monitored (default: `~/.dig`)
- **gunOptions**: 
  - **peers**: List of GunJS peer URLs to connect to for network discovery
  - **namespace**: GunJS namespace for isolating different DIG networks (default: "dig-network")
  - **webrtc**: WebRTC configuration including STUN servers for NAT traversal
- **logLevel**: Logging verbosity - debug, info, warn, error (default: info)
- **syncInterval**: How often to announce files to the network in milliseconds (default: 30000)
- **maxConcurrentDownloads**: Maximum number of simultaneous file downloads (default: 5)

### Network Configuration

The node requires at least one GunJS peer to connect to the network. The default configuration includes:
- `http://nostalgiagame.go.ro:30878/gun` - A public GunJS relay server
- Google STUN servers for WebRTC NAT traversal

For private networks, you can run your own GunJS relay server and configure peers accordingly.

## Quick Start

1. **Install the CLI** using `install.bat` (as Administrator)

2. **Start the node directly**:
   ```bash
   dig-node start
   ```

3. **Or install as Windows service**:
   ```bash
   dig-node install-service
   dig-node start-service
   ```

4. **Add `.dig` files** to your directory (`%USERPROFILE%\.dig` by default)

5. **Check status**:
   ```bash
   dig-node status
   ```

## How It Works

### File Discovery Process
1. **Startup Scan**: On startup, the node scans the configured directory for all `.dig` files
2. **Hash Calculation**: Calculates SHA-256 hashes for each file to ensure integrity
3. **Network Announcement**: Announces file availability to the DIG network via GunJS
4. **Peer Discovery**: Listens for announcements from other nodes on the network

### Automatic File Synchronization
1. **Peer Announcements**: When another node announces files, this node checks if it has them
2. **Download Decision**: If files are missing locally, they're queued for download
3. **Multi-Protocol Transfer**: Downloads using the best available method (HTTP, WebTorrent, etc.)
4. **Local Integration**: Downloaded files are saved to the local directory and re-announced

### File Change Monitoring
1. **Real-time Watching**: Uses `chokidar` to monitor the `.dig` directory for changes
2. **Instant Sharing**: New files are immediately hashed and announced to the network
3. **Update Propagation**: File modifications trigger re-hashing and re-announcement
4. **Cleanup**: Deleted files are automatically removed from network announcements

### Network Protocols
- **GunJS Messaging**: Decentralized database for peer discovery and file announcements
- **HTTP File Serving**: Direct peer-to-peer file downloads over HTTP
- **WebTorrent Integration**: BitTorrent-compatible sharing using magnet URIs
- **WebRTC Connections**: Browser-compatible real-time data channels
- **UPnP Port Mapping**: Automatic NAT traversal for improved connectivity

## File Sharing Behavior

Once running, the node operates completely automatically:

- **Shares everything**: All `.dig` files in your directory are shared with the network
- **Downloads everything**: All `.dig` files announced by other nodes are downloaded locally
- **Stays synchronized**: File changes are immediately propagated across the network
- **Maintains integrity**: SHA-256 hashes ensure file authenticity and prevent corruption
- **Handles conflicts**: Duplicate detection prevents redundant downloads and storage

The node essentially creates a synchronized, decentralized file system where every participant has access to all shared `.dig` files.

## Technical Architecture

### Core Components

- **DigNode**: Main orchestrator that manages file scanning, peer communication, and download coordination
- **NetworkManager**: Handles peer-to-peer networking, file announcements, and protocol coordination
- **FileHost**: Serves local files to other nodes via HTTP, WebTorrent, and WebRTC
- **FileClient**: Downloads files from remote peers using multiple protocols
- **ServiceManager**: Windows service lifecycle management and integration

### File Processing Pipeline

1. **File Discovery**: `chokidar` monitors the `.dig` directory for filesystem changes
2. **Hash Calculation**: SHA-256 hashing ensures file integrity and creates unique identifiers
3. **Network Integration**: Files are registered with the NetworkManager for sharing
4. **Protocol Registration**: Files become available via HTTP endpoints and WebTorrent magnet URIs
5. **Peer Announcement**: File availability is broadcast to the GunJS network

### Download Coordination

1. **Peer Discovery**: Listens for file announcements from other nodes
2. **Duplicate Detection**: Prevents downloading files that already exist locally
3. **Queue Management**: Manages concurrent downloads respecting the `maxConcurrentDownloads` limit  
4. **Protocol Selection**: Chooses the best available transfer method (HTTP, WebTorrent, WebRTC)
5. **Integrity Verification**: Validates downloaded files against announced SHA-256 hashes

## Service Management

The Windows service provides:

- **Automatic startup** on system boot
- **Background operation** without user login
- **Crash recovery** with automatic restart
- **Service logs** for troubleshooting

### Service Locations

- **Service Name**: `DigNodeService`
- **Service Display Name**: `DIG Network File Sharing Node`
- **Service Logs**: Windows Event Viewer → Windows Logs → Application

## Troubleshooting

### Common Issues

1. **Permission Denied**: Run installer as Administrator
2. **Service Won't Start**: 
   - Check config file path and permissions
   - Verify the service wrapper (.cjs file) was created successfully
   - Check Windows Event Viewer for detailed error messages
   - Ensure all dependencies are built (`npm run build`)
3. **Port Already in Use**: Change port in config file or kill competing processes
4. **Node.js Not Found**: Install Node.js and restart terminal
5. **Module Resolution Errors**: 
   - The service uses a CommonJS wrapper to handle ES modules
   - Ensure the project is built before installing the service
   - Check that `dist/` directory contains compiled JavaScript files
6. **No Files Downloading**: 
   - Verify GunJS peers are accessible
   - Check if other nodes are online and announcing files
   - Ensure firewall isn't blocking connections
7. **Files Not Sharing**: 
   - Verify `.dig` files exist in the configured directory
   - Check if dig-nat-tools loaded successfully (look for warnings in logs)
   - Ensure the HTTP port is accessible from other nodes

### Network Diagnostics

```bash
# Check node status and connectivity
dig-node status

# Test with verbose logging
dig-node start --log-level debug

# Verify GunJS peer connectivity
# Look for "Peer connected" messages in logs
```

### File System Issues

- **Directory Permissions**: Ensure the node has read/write access to `digDirectory`
- **File Locks**: Close applications that might have `.dig` files open
- **Path Length**: Windows has path length limitations - use shorter directory paths if needed
- **Special Characters**: Avoid special characters in file names that might cause issues

### Logs

Check logs in:
- **CLI mode**: Real-time console output with configurable log levels
- **Service mode**: Windows Event Viewer → Windows Logs → Application
- **Service wrapper**: `C:\Users\[User]\AppData\Roaming\npm\node_modules\node-windows\daemon\`
- **Debug logs**: Set `logLevel: "debug"` in config for detailed networking information

### Uninstall

```bash
# Stop and uninstall service
dig-node stop-service
dig-node uninstall-service

# Remove CLI globally
npm unlink -g dig-node
```

## Security Considerations

### Network Security
- **Open Network**: The DIG network is open by default - any node can join and access shared files
- **File Integrity**: SHA-256 hashes ensure files haven't been corrupted during transfer
- **No Authentication**: There's no built-in authentication - all `.dig` files are public within the network
- **Firewall**: Configure firewalls appropriately to control network access

### Privacy Implications
- **Public Sharing**: All files in the `digDirectory` are automatically shared with the entire network
- **Peer Discovery**: Your node's identity (storeId) and capabilities are visible to other network participants
- **File Metadata**: File names, sizes, and hashes are visible to all network participants

### Recommendations
- Only place files you want to share publicly in the `.dig` directory
- Use a dedicated directory separate from personal files
- Consider network isolation for sensitive environments
- Monitor logs for unusual network activity

## Limitations

### Current Limitations
- **File Types**: Only `.dig` files are processed and shared
- **Network Dependency**: Requires at least one accessible GunJS peer to function
- **Storage Growth**: The node downloads ALL files announced by other peers
- **Bandwidth Usage**: Continuous network activity for announcements and transfers
- **Windows Focus**: Service management features are Windows-specific

### Scalability Considerations
- **Directory Size**: Large numbers of files may impact scan performance
- **Network Load**: Each node announces files periodically, creating network traffic
- **Storage Requirements**: Total storage needs grow with network participation
- **Transfer Limits**: Concurrent download limits prevent overwhelming the system

## Development

### Building

```bash
npm run build
```

### Testing

```bash
# Test CLI directly
node dist/cli.js --help

# Test service installation
node dist/cli.js install-service

# Run with debug logging
node dist/cli.js start --log-level debug
```

### Architecture Extension
The modular design allows for easy extension:
- Add new transfer protocols by extending NetworkManager
- Implement different file filtering strategies
- Add authentication/authorization layers
- Integrate with different storage backends

### Windows Service Architecture

The Windows service implementation uses a dual-module approach to handle ES module/CommonJS compatibility:

1. **ServiceManager** (TypeScript/ES Modules): Manages service lifecycle and configuration
2. **Service Wrapper** (CommonJS): Bridge between node-windows and ES modules
3. **Dynamic Import**: The wrapper uses `import()` to load ES modules at runtime

This architecture solves the fundamental issue where node-windows runs in a CommonJS context but the application uses ES modules. The service wrapper:
- Uses CommonJS `require()` for basic dependencies
- Dynamically imports ES modules using `import()`
- Resolves absolute paths to avoid working directory issues
- Provides comprehensive error handling and logging

**Service Files**:
- `service-manager.ts` - Service lifecycle management
- `service-wrapper.cjs` - CommonJS bridge (generated at runtime)
- `dig-node-service-config.json` - Service configuration

## License

MIT License - see LICENSE file for details.
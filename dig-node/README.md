# DIG Node

A CLI application for participating in the DIG network file sharing system.

## Features

- 🔄 Automatically scans and shares .dig files from ~/.dig directory
- 🌐 Peer discovery and communication via GunJS
- 📥 Automatic download of missing .dig files from other nodes
- 🚀 Built on dig-nat-tools for NAT traversal and P2P connectivity
- 📝 Comprehensive logging and configuration options

## Installation

1. Navigate to the dig-node directory:
   ```bash
   cd dig-node
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. (Optional) Link globally for system-wide access:
   ```bash
   npm link
   ```

## Usage

### Start a node
```bash
dig-node start
```

### Start with custom options
```bash
dig-node start --port 9090 --dig-dir ./my-dig-files --log-level debug
```

### Generate a configuration file
```bash
dig-node config --output my-config.json
```

### Start with configuration file
```bash
dig-node start --config my-config.json
```

## Configuration

### Command Line Options

- `--port <port>`: Port to listen on (default: 8080)
- `--dig-dir <path>`: Directory containing .dig files (default: ~/.dig)
- `--peers <peers>`: Comma-separated list of GunJS peers
- `--namespace <namespace>`: GunJS namespace (default: dig-network)
- `--log-level <level>`: Log level (debug, info, warn, error, default: info)
- `--config <path>`: Path to configuration file

### Configuration File Format

```json
{
  "port": 8080,
  "digDirectory": "/home/user/.dig",
  "gunOptions": {
    "peers": ["http://nostalgiagame.go.ro:30878/gun"],
    "namespace": "dig-network",
    "webrtc": {
      "iceServers": [
        { "urls": "stun:stun.l.google.com:19302" },
        { "urls": "stun:stun1.l.google.com:19302" }
      ]
    }
  },
  "logLevel": "info",
  "syncInterval": 30000,
  "maxConcurrentDownloads": 5
}
```

## Architecture

The DIG Node consists of several key components:

### DigNode (Main Controller)
- Coordinates all components
- Handles graceful startup and shutdown
- Manages periodic sync operations

### FileManager
- Monitors the .dig directory for changes
- Calculates SHA256 hashes for files
- Emits events when files are added/removed

### NetworkManager
- Integrates with dig-nat-tools for P2P connectivity
- Handles peer discovery via GunJS
- Manages file announcements and downloads

### Logger
- Provides structured logging with multiple levels
- Color-coded output for better readability

## Development

### Watch mode for development
```bash
npm run dev
```

### Lint code
```bash
npm run lint
```

### Fix linting issues
```bash
npm run lint:fix
```

## Integration with dig-nat-tools

This project uses the compiled version of dig-nat-tools from the parent directory's `dist` folder. The integration includes:

- **FileHost**: For serving .dig files to other peers
- **FileClient**: For downloading files from remote peers  
- **GunRegistry**: For peer discovery and network coordination
- **Connection modes**: Support for direct HTTP and WebTorrent transfers

## File Discovery Process

1. **Local Scanning**: On startup, scan ~/.dig for all .dig files
2. **Hash Calculation**: Calculate SHA256 hash for each file
3. **Announcement**: Announce available files to the GunJS network
4. **Peer Discovery**: Listen for other nodes announcing their files
5. **Download**: Automatically download missing .dig files
6. **Monitoring**: Watch for new files and announce them

## TODO

- [ ] Complete integration with dig-nat-tools components
- [ ] Implement file announcement protocol
- [ ] Add WebTorrent support for large file transfers
- [ ] Implement proper peer file listing
- [ ] Add configuration validation
- [ ] Add status monitoring dashboard
- [ ] Implement daemon mode
- [ ] Add automatic restart on crashes
- [ ] Add bandwidth limiting options
- [ ] Implement file prioritization system
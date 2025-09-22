# DIG Node - Windows CLI & Service

A Windows CLI application for running DIG network file sharing nodes with service capabilities.

## Features

- **CLI Interface**: Easy-to-use command-line interface
- **Windows Service**: Install and run as a background Windows service
- **Auto-discovery**: Automatically connects to the DIG network
- **File Sharing**: Share and download files through the DIG network
- **Service Management**: Full lifecycle management of the Windows service

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

- **port**: Port for the local file server
- **digDirectory**: Directory where files are stored and shared from
- **gunOptions**: GunDB configuration for peer-to-peer networking
- **logLevel**: Logging level (debug, info, warn, error)
- **syncInterval**: How often to sync with peers (milliseconds)
- **maxConcurrentDownloads**: Maximum concurrent file downloads

## Quick Start

1. **Install the CLI** using `install.bat` (as Administrator)

2. **Create configuration**:
   ```bash
   dig-node config -o "%USERPROFILE%\.dig\dig-node-config.json"
   ```

3. **Install as Windows service**:
   ```bash
   dig-node install-service -c "%USERPROFILE%\.dig\dig-node-config.json"
   ```

4. **Start the service**:
   ```bash
   dig-node start-service
   ```

5. **Check status**:
   ```bash
   dig-node status
   ```

## File Sharing

Once running, the node will:

- **Download files** from the DIG network to your `digDirectory`
- **Share files** from your `digDirectory` with other nodes
- **Auto-sync** with other peers on the network

Files in your `digDirectory` (default: `C:\Users\YourUser\.dig`) will be automatically shared with the network.

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
2. **Service Won't Start**: Check config file path and permissions
3. **Port Already in Use**: Change port in config file
4. **Node.js Not Found**: Install Node.js and restart terminal

### Logs

Check logs in:
- **CLI mode**: Console output
- **Service mode**: Windows Event Viewer
- **Service wrapper**: `C:\Users\[User]\AppData\Roaming\npm\node_modules\node-windows\daemon\`

### Uninstall

```bash
# Stop and uninstall service
dig-node stop-service
dig-node uninstall-service

# Remove CLI globally
npm unlink -g dig-node
```

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
```

## License

MIT License - see LICENSE file for details.
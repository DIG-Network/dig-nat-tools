# Custom WebTorrent Tracker Setup

This guide shows how to deploy and use your own WebTorrent tracker to avoid issues with unreliable public trackers.

## Why Use a Custom Tracker?

Public WebTorrent trackers like `tracker.leechers-paradise.org` are often unreliable or offline, causing:
- Tracker timeout errors
- "No peers found" messages
- Failed file downloads

A custom tracker gives you:
- Reliable peer discovery
- Better control over your network
- Improved performance for local/private networks

## Quick Setup

### 1. Install Dependencies

```bash
npm install bittorrent-tracker
```

### 2. Deploy the Tracker Server

```bash
# Start the tracker server (port 8000 by default)
node examples/tracker-server.js

# Or specify custom port/host
TRACKER_PORT=9000 TRACKER_HOST=0.0.0.0 node examples/tracker-server.js
```

### 3. Configure Your Host

```javascript
import { FileHost } from 'dig-nat-tools';

const host = new FileHost({
  connectionMode: 'webtorrent',
  gun: { 
    peers: ['http://nostalgiagame.go.ro:30878/gun'],
    namespace: 'my-app'
  },
  // Add your custom tracker
  trackers: [
    'ws://your-server.com:8000',              // WebSocket tracker
    'http://your-server.com:8000/announce',   // HTTP tracker
    'wss://tracker.openwebtorrent.com',       // Backup public tracker
    'udp://tracker.opentrackr.org:1337'       // Backup public tracker
  ]
});
```

### 4. Configure Your Client

```javascript
import { FileClient } from 'dig-nat-tools';

const client = new FileClient({
  peers: ['http://nostalgiagame.go.ro:30878/gun'],
  namespace: 'my-app',
  // Use the same custom tracker
  trackers: [
    'ws://your-server.com:8000',
    'http://your-server.com:8000/announce',
    'wss://tracker.openwebtorrent.com',
    'udp://tracker.opentrackr.org:1337'
  ]
});
```

## Production Deployment

### Docker Deployment

Create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  webtorrent-tracker:
    build: .
    ports:
      - "8000:8000"
    environment:
      - TRACKER_PORT=8000
      - TRACKER_HOST=0.0.0.0
    restart: unless-stopped
    command: node examples/tracker-server.js
```

### Systemd Service

Create `/etc/systemd/system/webtorrent-tracker.service`:

```ini
[Unit]
Description=WebTorrent Tracker
After=network.target

[Service]
Type=simple
User=tracker
WorkingDirectory=/opt/webtorrent-tracker
ExecStart=/usr/bin/node examples/tracker-server.js
Environment=TRACKER_PORT=8000
Environment=TRACKER_HOST=0.0.0.0
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl enable webtorrent-tracker
sudo systemctl start webtorrent-tracker
```

## Firewall Configuration

Make sure your tracker port is accessible:

```bash
# Ubuntu/Debian
sudo ufw allow 8000

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=8000/tcp
sudo firewall-cmd --reload
```

## Testing Your Tracker

1. Start the tracker server
2. Start your host with the custom tracker configuration
3. Start your client with the same tracker configuration
4. Check the tracker stats at `http://your-server:8000/stats`

## Troubleshooting

### Common Issues

1. **Tracker not accessible**: Check firewall settings and port forwarding
2. **WebSocket errors**: Ensure WebSocket support is enabled on your server
3. **UDP tracker issues**: Some networks block UDP traffic

### Debug Mode

Enable tracker logging:
```javascript
const tracker = new Server({
  udp: true,
  http: true,
  ws: true,
  stats: true
});

tracker.on('start', (addr) => console.log(`Peer started: ${addr}`));
tracker.on('update', (addr) => console.log(`Peer updated: ${addr}`));
```

## Advanced Configuration

### SSL/TLS Support

For production, use HTTPS/WSS:

```javascript
import https from 'https';
import fs from 'fs';

const server = new Server({
  https: true,
  key: fs.readFileSync('private-key.pem'),
  cert: fs.readFileSync('certificate.pem')
});
```

### Load Balancing

Use multiple tracker instances behind a load balancer:

```javascript
const trackers = [
  'wss://tracker1.example.com',
  'wss://tracker2.example.com',
  'wss://tracker3.example.com'
];
```

## Public Tracker Alternatives

If you can't deploy your own tracker, use these reliable public trackers:

```javascript
trackers: [
  'wss://tracker.openwebtorrent.com',
  'udp://tracker.opentrackr.org:1337',
  'udp://open.demonii.si:1337',
  'udp://tracker.openbittorrent.com:6969',
  'udp://exodus.desync.com:6969'
]
```

These are more reliable than the default trackers that were causing timeouts.
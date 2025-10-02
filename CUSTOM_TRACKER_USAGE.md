# Custom Tracker Usage Examples

## What's Changed

### 1. **Host and Client Updates**
- Both `FileHost` and `FileClient` now accept an optional `trackers` array in their options
- If `trackers` is provided, it uses your custom trackers
- If `trackers` is not provided or empty, it uses `new WebTorrent()` with default trackers

### 2. **Enhanced Tracker Server**
The tracker server now has detailed logging that shows:
- 📥 When peers start downloading/uploading
- ✅ When peers complete downloads
- 🔄 When peers send updates (progress)
- 🛑 When peers stop
- 🌐 HTTP tracker requests
- 🔌 WebSocket connections/disconnections
- 📊 Periodic stats (torrents and peer counts)

## How to Test

### Step 1: Start the Tracker Server
```bash
# Terminal 1: Start your custom tracker
node examples/tracker-server.js
```

You should see:
```
🚀 Starting custom WebTorrent tracker server...
✅ Custom WebTorrent tracker server running!
📊 Tracker endpoints:
   - HTTP:      http://0.0.0.0:8000/announce
   - WebSocket: ws://0.0.0.0:8000
   - UDP:       udp://0.0.0.0:8000
   - Stats:     http://0.0.0.0:8000/stats
```

### Step 2: Run the Custom Tracker Test
```bash
# Terminal 2: Test the integration
node examples/test-with-custom-tracker.js
```

### Step 3: Use Custom Trackers in Your Examples

#### Host with Custom Tracker
```javascript
const host = new FileHost({
  connectionMode: ConnectionMode.WEBTORRENT_ONLY,
  trackers: [
    'ws://localhost:8000',
    'http://localhost:8000/announce'
  ]
});
```

#### Client with Custom Tracker
```javascript
const client = new FileClient({
  trackers: [
    'ws://localhost:8000',
    'http://localhost:8000/announce'
  ]
});
```

## What You'll See in the Tracker Logs

When you run the test, your tracker server will show activity like:

```
📥 [2:30:15 PM] Peer STARTED: 192.168.1.100:51234
   Info Hash: a1b2c3d4e5f6789...
   Client: -WW0001-abc123def456

🔄 [2:30:16 PM] Peer UPDATED: 192.168.1.100:51234
   Downloaded: 0 bytes
   Uploaded: 0 bytes
   Left: 1024 bytes

🌐 [2:30:17 PM] HTTP Request:
   Event: started
   Info Hash: a1b2c3d4e5f6789...
   Peer ID: -WW0001-abc123def456
   IP: 192.168.1.100
   Port: 51234
```

## Benefits of Custom Tracker

✅ **Reliable**: No dependency on potentially unreliable public trackers  
✅ **Fast**: Local/private network means faster peer discovery  
✅ **Debuggable**: Full visibility into what's happening  
✅ **Controlled**: You control the tracker behavior and availability  

## Fallback Behavior

- If you don't specify `trackers`, WebTorrent uses its default tracker configuration
- This includes reliable built-in trackers that should work better than the problematic ones you were seeing timeouts from
- You can mix custom and public trackers in the same array

## Production Deployment

For production, deploy your tracker server on the same machine as your host or a reliable server that both host and clients can reach.
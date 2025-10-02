// tracker-server.js - Custom WebTorrent tracker server
import { Server } from 'bittorrent-tracker';

const PORT = process.env.TRACKER_PORT || 8000;
const HOST = process.env.TRACKER_HOST || '0.0.0.0';

console.log('🚀 Starting custom WebTorrent tracker server...');

const server = new Server({
  udp: true,      // Enable UDP tracker
  http: true,     // Enable HTTP tracker
  ws: true,       // Enable WebSocket tracker (for web clients)
  stats: true,    // Enable stats endpoint
  filter: function (infoHash, params, cb) {
    // Optional: filter which torrents are allowed
    // For now, allow all torrents
    cb(null, true);
  }
});

// Error handling
server.on('error', (err) => {
  console.error('❌ Tracker server error:', err);
});

server.on('warning', (err) => {
  console.warn('⚠️ Tracker server warning:', err);
});

server.on('listening', () => {
  console.log('✅ Custom WebTorrent tracker server running!');
  console.log(`📊 Tracker endpoints:`);
  console.log(`   - HTTP:      http://${HOST}:${PORT}/announce`);
  console.log(`   - WebSocket: ws://${HOST}:${PORT}`);
  console.log(`   - UDP:       udp://${HOST}:${PORT}`);
  console.log(`   - Stats:     http://${HOST}:${PORT}/stats`);
  console.log('');
  console.log('🔧 To use this tracker, configure your host/client with:');
  console.log(`   trackers: ['ws://${HOST}:${PORT}', 'http://${HOST}:${PORT}/announce']`);
  console.log('');
  console.log('Press Ctrl+C to stop');
});

// Start the server
server.listen(PORT, HOST);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received interrupt signal, shutting down tracker...');
  server.close(() => {
    console.log('✅ Tracker server closed');
    process.exit(0);
  });
});

// Enhanced peer activity logging
server.on('start', (addr, params) => {
  console.log(`📥 [${new Date().toLocaleTimeString()}] Peer STARTED: ${addr.address}:${addr.port}`);
  console.log(`   Info Hash: ${params.info_hash ? params.info_hash.toString('hex') : 'unknown'}`);
  console.log(`   Client: ${params.peer_id ? params.peer_id.toString() : 'unknown'}`);
});

server.on('complete', (addr, params) => {
  console.log(`✅ [${new Date().toLocaleTimeString()}] Peer COMPLETED: ${addr.address}:${addr.port}`);
  console.log(`   Info Hash: ${params.info_hash ? params.info_hash.toString('hex') : 'unknown'}`);
});

server.on('update', (addr, params) => {
  console.log(`🔄 [${new Date().toLocaleTimeString()}] Peer UPDATED: ${addr.address}:${addr.port}`);
  console.log(`   Downloaded: ${params.downloaded || 0} bytes`);
  console.log(`   Uploaded: ${params.uploaded || 0} bytes`);
  console.log(`   Left: ${params.left || 0} bytes`);
});

server.on('stop', (addr, params) => {
  console.log(`🛑 [${new Date().toLocaleTimeString()}] Peer STOPPED: ${addr.address}:${addr.port}`);
  console.log(`   Info Hash: ${params.info_hash ? params.info_hash.toString('hex') : 'unknown'}`);
});

// Log HTTP requests to the tracker
server.on('request', (params, cb) => {
  console.log(`🌐 [${new Date().toLocaleTimeString()}] HTTP Request:`);
  console.log(`   Event: ${params.event || 'none'}`);
  console.log(`   Info Hash: ${params.info_hash ? params.info_hash.toString('hex') : 'unknown'}`);
  console.log(`   Peer ID: ${params.peer_id ? params.peer_id.toString() : 'unknown'}`);
  console.log(`   IP: ${params.ip || 'unknown'}`);
  console.log(`   Port: ${params.port || 'unknown'}`);
});

// Log WebSocket connections
server.on('connection', (socket) => {
  console.log(`🔌 [${new Date().toLocaleTimeString()}] WebSocket connection from: ${socket._socket ? socket._socket.remoteAddress : 'unknown'}`);
  
  socket.on('close', () => {
    console.log(`🔌 [${new Date().toLocaleTimeString()}] WebSocket disconnected: ${socket._socket ? socket._socket.remoteAddress : 'unknown'}`);
  });
});

// Periodic stats logging
setInterval(() => {
  const stats = server.getSwarm();
  const totalTorrents = Object.keys(stats).length;
  let totalPeers = 0;
  
  Object.values(stats).forEach(swarm => {
    totalPeers += swarm.complete + swarm.incomplete;
  });
  
  console.log(`📊 Tracker stats: ${totalTorrents} torrents, ${totalPeers} peers`);
}, 60000); // Every minute
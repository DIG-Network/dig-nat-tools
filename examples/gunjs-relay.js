// gunjs-relay.js - Simple Gun.js relay server for deployment
import Gun from 'gun';
import 'gun/sea.js';
import http from 'http';

const PORT = 30876;

// Create HTTP server
const server = http.createServer();

// Initialize Gun database with the server
const gun = Gun({
  web: server,
  peers: [], // No peers needed for relay
  radisk: false, // In-memory only for simplicity
  localStorage: false
});

// Log connections
gun.on('hi', (peer) => {
  console.log(`🟢 Peer connected: ${peer.id || peer.url || 'unknown'}`);
  if (peer.id?.includes('host-') || peer.url?.includes('localhost')) {
    console.log('🏠 Host connected to relay!');
  } else if (peer.id?.includes('client-')) {
    console.log('👤 Client connected to relay!');
  }
});

gun.on('bye', (peer) => {
  console.log(`🔴 Peer disconnected: ${peer.id || peer.url || 'unknown'}`);
});

// Monitor host registrations
gun.get('hosts').on((data, key) => {
  if (key !== '_' && data && data.name) {
    console.log(`📝 Host registered: ${data.name} (ID: ${data.id})`);
    console.log(`   📂 File server: ${data.fileServerUrl}`);
    console.log(`   📊 Status: ${data.status}`);
  }
});

// Start the server
server.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Gun.js Relay Server Started');
  console.log(`📡 Listening on: 0.0.0.0:${PORT}`);
  console.log(`🌐 Gun endpoint: http://0.0.0.0:${PORT}/gun`);
  console.log(`🔗 Relay URL for peers: http://nostalgiagame.go.ro:${PORT}/gun`);
  console.log('⏳ Waiting for connections...\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down relay server...');
  server.close(() => {
    console.log('✅ Relay server stopped');
    process.exit(0);
  });
});

// Log periodic status
setInterval(() => {
  console.log(`⚡ Relay active - ${new Date().toLocaleTimeString()}`);
}, 60000); // Every minute

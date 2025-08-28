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
  console.log(`🟢 Peer connected: ${peer.id}`);
});

gun.on('bye', (peer) => {
  console.log(`🔴 Peer disconnected: ${peer.id}`);
});

// Start the server
server.listen(PORT, () => {
  console.log('🚀 Gun.js Relay Server Started');
  console.log(`📡 Listening on port: ${PORT}`);
  console.log(`🌐 Gun endpoint: http://localhost:${PORT}/gun`);
  console.log(`🔗 Relay URL for peers: http://YOUR_SERVER_IP:${PORT}/gun`);
  console.log('💡 Replace YOUR_SERVER_IP with your actual server IP address');
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

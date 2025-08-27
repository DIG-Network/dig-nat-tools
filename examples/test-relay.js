// test-relay.js - Start a Gun.js relay server
import '../dist/relay.js';

// The relay server will start automatically when imported
// It will run on http://localhost:8765/gun by default
// You can set PORT environment variable to change the port

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8765;

console.log('🚀 Gun.js relay server starting...');
console.log(`📡 Gun relay endpoint: http://localhost:${PORT}/gun`);
console.log('🔄 Relay is ready to accept connections from hosts and clients');
console.log('⏳ Waiting for hosts to register...');
console.log('Press Ctrl+C to stop');

// Add some periodic status logging
setInterval(() => {
  console.log(`⚡ Relay still running on port ${PORT} - ${new Date().toLocaleTimeString()}`);
}, 30000); // Log every 30 seconds

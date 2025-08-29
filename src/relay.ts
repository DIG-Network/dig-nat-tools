import Gun from 'gun';
import 'gun/sea.js';
import 'gun/lib/webrtc.js';
import http from 'http';

/**
 * Gun relay server
 *
 * Usage:
 *   ts-node relay.ts
 *
 * Options:
 *   PORT: Set the port (default: 8765)
 */
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 30878;

// Graceful shutdown handler
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
  console.log('✅ Gun relay server shutdown complete');
  process.exit(0);
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // For nodemon

async function startRelay(): Promise<void> {
  console.log('🚀 Starting Gun relay server...');
  console.log(`📡 Port: ${PORT}`);
  console.log('🔗 WebRTC enabled with mesh networking for peer-to-peer connections');
  console.log('📊 This relay serves as discovery point only - data flows peer-to-peer');
  console.log('📝 Logging enabled for:');
  console.log('   • TCP connections and disconnections');
  console.log('   • Gun.js peer connections (hi/bye events)');
  console.log('   • HTTP requests to /gun endpoints');
  console.log('   • Data write/update operations');
  console.log('   • Host registrations and unregistrations');
  console.log('   • Data changes in dig-nat-tools and dig-nat-tools-test namespaces');

  // Create a simple HTTP server for Gun.js
  const server = http.createServer();

  // Gun relay setup with WebRTC and mesh networking support
  console.log('🔧 Initializing Gun.js database with WebRTC support...');
  
  // Initialize Gun with the HTTP server
  const gun = Gun({
    web: server,
    radisk: true, // persistent storage
    file: 'gun-data', // storage folder
    peers: [], // no public relays - this relay serves as the discovery point
    axe: false
  });

  // Add custom routes by intercepting requests before Gun handles them
  const originalListeners = server.listeners('request');
  server.removeAllListeners('request');
  
  server.on('request', (req: http.IncomingMessage, res: http.ServerResponse) => {
    // Handle our custom routes
    if (req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'online',
        service: 'Gun.js relay server',
        endpoint: '/gun',
        port: PORT,
        features: {
          webrtc: true,
          mesh: true, // Automatic with WebRTC
          discoveryOnly: true
        }
      }));
      return;
    }
    
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
      return;
    }

    // Log all requests
    const timestamp = new Date().toISOString();
    const clientIp = req.socket.remoteAddress || 'unknown';
    console.log(`📡 [${timestamp}] HTTP request: ${req.method} ${req.url} from ${clientIp}`);

    // Let Gun.js handle all other requests (including /gun)
    for (const listener of originalListeners) {
      (listener as (req: http.IncomingMessage, res: http.ServerResponse) => void).call(server, req, res);
    }
  });

  // Start the server
  server.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Gun relay server running on http://0.0.0.0:${PORT}`);
    console.log(`🔗 Gun.js endpoint available at: http://0.0.0.0:${PORT}/gun`);
    console.log('✅ Gun relay server fully initialized and ready for connections');
  });

  // Add connection logging
  server.on('connection', (socket) => {
    const clientAddress = socket.remoteAddress;
    const clientPort = socket.remotePort;
    console.log(`🔌 New TCP connection from ${clientAddress}:${clientPort}`);
    
    socket.on('close', () => {
      console.log(`🔌 TCP connection closed from ${clientAddress}:${clientPort}`);
    });
    
    socket.on('error', (error) => {
      console.log(`❌ TCP connection error from ${clientAddress}:${clientPort}:`, error.message);
    });
  });

  // Monitor Gun.js events for data operations
  gun.on('hi', (peer: { id?: string; url?: string }) => {
    console.log(`🤝 New Gun.js peer connected:`, {
      id: peer.id || 'unknown',
      url: peer.url || 'unknown'
    });
  });

  gun.on('bye', (peer: { id?: string; url?: string }) => {
    console.log(`👋 Gun.js peer disconnected:`, {
      id: peer.id || 'unknown',
      url: peer.url || 'unknown'
    });
  });

  // Monitor data changes with Gun.js map/on
  console.log('🔍 Setting up data monitoring...');
  
  // Monitor all data changes in the registry
  gun.get('dig-nat-tools').map().on((data: Record<string, unknown> | null, key: string) => {
    if (data && key) {
      const timestamp = new Date().toISOString();
      console.log(`📊 [${timestamp}] Data updated in 'dig-nat-tools':`, {
        key: key,
        hasData: !!data,
        dataKeys: data ? Object.keys(data).filter(k => k !== '_') : []
      });
    }
  });

  // Monitor test namespace as well
  gun.get('dig-nat-tools-test').map().on((data: Record<string, unknown> | null, key: string) => {
    if (data && key) {
      const timestamp = new Date().toISOString();
      console.log(`📊 [${timestamp}] Data updated in 'dig-nat-tools-test':`, {
        key: key,
        hasData: !!data,
        dataKeys: data ? Object.keys(data).filter(k => k !== '_') : []
      });
    }
  });

  // Monitor host registrations specifically
  gun.get('dig-nat-tools').get('hosts').map().on((data: Record<string, unknown> | null, key: string) => {
    if (data && key) {
      const timestamp = new Date().toISOString();
      if (data === null || data === undefined) {
        console.log(`🗑️ [${timestamp}] Host unregistered: ${key}`);
      } else {
        console.log(`🏠 [${timestamp}] Host registered/updated: ${key}`, {
          storeId: data.storeId || 'unknown',
          lastSeen: data.lastSeen ? new Date(data.lastSeen as number).toLocaleString() : 'unknown',
          directHttp: data.directHttp_available || false,
          webTorrent: data.webTorrent_available || false
        });
      }
    }
  });

  gun.get('dig-nat-tools-test').get('hosts').map().on((data: Record<string, unknown> | null, key: string) => {
    if (data && key) {
      const timestamp = new Date().toISOString();
      if (data === null || data === undefined) {
        console.log(`🗑️ [${timestamp}] Test host unregistered: ${key}`);
      } else {
        console.log(`🏠 [${timestamp}] Test host registered/updated: ${key}`, {
          storeId: data.storeId || 'unknown',
          lastSeen: data.lastSeen ? new Date(data.lastSeen as number).toLocaleString() : 'unknown',
          directHttp: data.directHttp_available || false,
          webTorrent: data.webTorrent_available || false
        });
      }
    }
  });

  console.log('✅ Gun.js database initialized with comprehensive logging');

  // Handle server errors
  server.on('error', (error) => {
    console.error('❌ Server error:', error);
    process.exit(1);
  });
}

// Start the relay server
startRelay().catch((error) => {
  console.error('❌ Failed to start relay server:', error);
  process.exit(1);
});

export default null; // Export for module compatibility

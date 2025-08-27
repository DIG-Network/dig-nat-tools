import Gun from 'gun';
import 'gun/sea.js';
import 'gun/lib/webrtc.js';
import express from 'express';
import type { Client } from 'nat-upnp';

/**
 * Gun relay server with UPnP port forwarding
 *
 * Usage:
 *   ts-node relay.ts
 *
 * Options:
 *   PORT: Set the port (default: 8765)
 *   UPNP_ENABLED: Enable UPnP port forwarding (default: true)
 *   UPNP_TTL: UPnP mapping TTL in seconds (default: 7200 = 2 hours)
 */
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8765;
const UPNP_ENABLED = process.env.UPNP_ENABLED !== 'false';
const UPNP_TTL = process.env.UPNP_TTL ? parseInt(process.env.UPNP_TTL, 10) : 7200;

let upnpClient: Client | null = null;
let upnpMapped = false;

// Initialize UPnP client
async function initializeUpnp(): Promise<void> {
  if (!UPNP_ENABLED) {
    console.log('🔧 UPnP disabled via environment variable');
    return;
  }

  try {
    const { default: natUpnp } = await import('nat-upnp');
    upnpClient = natUpnp.createClient();
    console.log('🔧 UPnP client initialized');
  } catch (error) {
    console.warn('⚠️ Failed to initialize UPnP client:', error);
    upnpClient = null;
  }
}

// Map port using UPnP
async function mapPort(port: number): Promise<void> {
  if (!upnpClient) {
    console.log('🔧 UPnP not available, skipping port mapping');
    return;
  }

  return new Promise((resolve) => {
    console.log(`🔄 Attempting UPnP port mapping for port ${port}...`);
    
    upnpClient!.portMapping({
      public: port,
      private: port,
      ttl: UPNP_TTL,
      description: `Gun.js relay server on port ${port}`
    }, (err: Error | null) => {
      if (err) {
        console.warn(`⚠️ UPnP port mapping failed for port ${port}:`, err.message);
      } else {
        console.log(`✅ UPnP port mapping successful for port ${port}`);
        upnpMapped = true;
      }
      resolve();
    });
  });
}

// Unmap port using UPnP
async function unmapPort(port: number): Promise<void> {
  if (!upnpClient || !upnpMapped) {
    return;
  }

  return new Promise((resolve) => {
    console.log(`🔄 Removing UPnP port mapping for port ${port}...`);
    
    upnpClient!.portUnmapping({
      public: port
    }, (err: Error | null) => {
      if (err) {
        console.warn(`⚠️ UPnP port unmapping failed for port ${port}:`, err.message);
      } else {
        console.log(`✅ UPnP port unmapping successful for port ${port}`);
      }
      upnpMapped = false;
      resolve();
    });
  });
}

// Graceful shutdown handler
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n� Received ${signal}, shutting down gracefully...`);
  
  // Remove UPnP port mapping
  await unmapPort(PORT);
  
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
  console.log(`🔧 UPnP enabled: ${UPNP_ENABLED}`);
  console.log('🔗 WebRTC enabled with mesh networking for peer-to-peer connections');
  console.log('📊 This relay serves as discovery point only - data flows peer-to-peer');
  console.log('📝 Logging enabled for:');
  console.log('   • TCP connections and disconnections');
  console.log('   • Gun.js peer connections (hi/bye events)');
  console.log('   • HTTP requests to /gun endpoints');
  console.log('   • Data write/update operations');
  console.log('   • Host registrations and unregistrations');
  console.log('   • Data changes in dig-nat-tools and dig-nat-tools-test namespaces');
  if (UPNP_ENABLED) {
    console.log(`⏰ UPnP TTL: ${UPNP_TTL} seconds`);
  }

  // Initialize UPnP
  await initializeUpnp();

  const app = express();
  const server = app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Gun relay server running on http://0.0.0.0:${PORT}/gun`);
    
    // Map port via UPnP
    await mapPort(PORT);
    
    console.log('✅ Gun relay server fully initialized and ready for connections');
  });

  // Gun relay setup with WebRTC and mesh networking support
  console.log('🔧 Initializing Gun.js database with WebRTC support...');
  
  const gun = Gun({
    web: server,
    radisk: true, // persistent storage
    file: 'gun-data', // storage folder
    peers: [], // no public relays - this relay serves as the discovery point
    rtc: { // Enable WebRTC for direct peer connections (mesh is automatic)
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    },
    localStorage: false // Relay doesn't need local storage
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

  // Add middleware to log HTTP requests to Gun endpoints
  app.use('/gun', (req, res, next) => {
    const timestamp = new Date().toISOString();
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    console.log(`📡 [${timestamp}] Gun.js HTTP request: ${req.method} ${req.url} from ${clientIp}`);
    
    // Log request body for POST/PUT requests (data writes)
    if ((req.method === 'POST' || req.method === 'PUT') && req.body) {
      try {
        const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        if (bodyStr.length > 200) {
          console.log(`📝 Data write operation (${bodyStr.length} chars): ${bodyStr.substring(0, 200)}...`);
        } else {
          console.log(`📝 Data write operation:`, bodyStr);
        }
      } catch {
        console.log(`📝 Data write operation (could not parse body)`);
      }
    }
    
    next();
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

  app.get('/', (req, res) => {
    res.json({
      status: 'online',
      service: 'Gun.js relay server',
      endpoint: '/gun',
      port: PORT,
      features: {
        webrtc: true,
        mesh: true, // Automatic with WebRTC
        discoveryOnly: true
      },
      upnp: {
        enabled: UPNP_ENABLED,
        mapped: upnpMapped
      }
    });
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

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

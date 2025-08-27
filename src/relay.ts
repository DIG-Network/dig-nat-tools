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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

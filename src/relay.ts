import Gun from 'gun';
import 'gun/sea.js';
import 'gun/lib/webrtc.js';
import express from 'express';

/**
 * Simple Gun relay server using Express
 *
 * Usage:
 *   ts-node relay.ts
 *
 * Options:
 *   PORT: Set the port (default: 8765)
 */
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8765;

const app = express();
const server = app.listen(PORT, () => {
  console.log(`🚀 Gun relay server running on http://localhost:${PORT}/gun`);
});

// Gun relay setup
const gun = Gun({
  web: server,
  radisk: true, // persistent storage
  file: 'gun-data', // storage folder
  peers: [], // no public relays
});

app.get('/', (req, res) => {
  res.send('Gun relay server is running. Connect your Gun.js client to /gun');
});

export default gun;

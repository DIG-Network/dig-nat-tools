// gunjs-host.js - Gun.js host that shares files and data
import Gun from 'gun';
import 'gun/sea.js';
import express from 'express';
import fs from 'fs';
import path from 'path';

// Configuration
const HOST_PORT = 3000;
const RELAY_URL = 'http://YOUR_SERVER_IP:30876/gun'; // Replace with your server IP
const HOST_ID = `host-${Date.now()}`;

// Create Express server for file serving
const app = express();

// Serve static files from a 'shared' directory
const sharedDir = './shared';
if (!fs.existsSync(sharedDir)) {
  fs.mkdirSync(sharedDir);
}

app.use('/files', express.static(sharedDir));

// Start Express server
const server = app.listen(HOST_PORT, () => {
  console.log(`📁 File server running on http://localhost:${HOST_PORT}`);
});

// Initialize Gun.js
const gun = Gun({
  peers: [RELAY_URL], // Connect to your relay server
  localStorage: false,
  radisk: false
});

// Host data structure in Gun
const hostNode = gun.get('hosts').get(HOST_ID);

// Register host information
const hostInfo = {
  id: HOST_ID,
  name: 'Example File Host',
  fileServerUrl: `http://YOUR_SERVER_IP:${HOST_PORT}/files`, // Replace with your server IP
  timestamp: Date.now(),
  status: 'online'
};

// Register the host
hostNode.put(hostInfo);
console.log('🚀 Host registered with Gun.js');
console.log(`🆔 Host ID: ${HOST_ID}`);
console.log(`🔗 Connected to relay: ${RELAY_URL}`);
console.log(`📂 File server: http://localhost:${HOST_PORT}/files`);

// Function to share a file
function shareFile(filename, content) {
  // Create the file
  const filePath = path.join(sharedDir, filename);
  fs.writeFileSync(filePath, content);
  
  // Register file in Gun
  const fileNode = gun.get('files').get(filename);
  const fileInfo = {
    filename: filename,
    size: content.length,
    hostId: HOST_ID,
    url: `${hostInfo.fileServerUrl}/${filename}`,
    timestamp: Date.now(),
    hash: Buffer.from(content).toString('base64').slice(0, 16) // Simple hash
  };
  
  fileNode.put(fileInfo);
  console.log(`📤 Shared file: ${filename} (${content.length} bytes)`);
  return fileInfo;
}

// Share some example files
shareFile('welcome.txt', 'Welcome to the Gun.js file sharing example!');
shareFile('data.json', JSON.stringify({ message: 'Hello from the host!', timestamp: new Date().toISOString() }, null, 2));

// Update host status periodically
setInterval(() => {
  hostNode.get('timestamp').put(Date.now());
  console.log(`💓 Host heartbeat sent - ${new Date().toLocaleTimeString()}`);
}, 30000); // Every 30 seconds

// Listen for file requests
gun.get('requests').get(HOST_ID).on((data, key) => {
  if (data && data.filename) {
    console.log(`📥 File requested: ${data.filename} by ${data.clientId}`);
    
    // Respond with file info if it exists
    const filePath = path.join(sharedDir, data.filename);
    if (fs.existsSync(filePath)) {
      const responseNode = gun.get('responses').get(data.clientId).get(data.requestId);
      responseNode.put({
        success: true,
        filename: data.filename,
        url: `${hostInfo.fileServerUrl}/${data.filename}`,
        hostId: HOST_ID,
        timestamp: Date.now()
      });
    }
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down host...');
  
  // Mark host as offline
  hostNode.get('status').put('offline');
  
  server.close(() => {
    console.log('✅ Host stopped');
    process.exit(0);
  });
});

console.log('\n📋 Host is running. Available commands:');
console.log('  • Files are automatically shared from ./shared/ directory');
console.log('  • Add files to ./shared/ and they will be served');
console.log('  • Press Ctrl+C to stop');
console.log('\n💡 Remember to replace YOUR_SERVER_IP with your actual server IP address!');

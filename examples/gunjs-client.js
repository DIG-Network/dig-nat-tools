// gunjs-client.js - Gun.js client that discovers hosts and downloads files
import Gun from 'gun';
import 'gun/sea.js';
import fs from 'fs';
import https from 'https';
import http from 'http';

// Configuration
const RELAY_URL = 'http://YOUR_SERVER_IP:30876/gun'; // Replace with your server IP
const CLIENT_ID = `client-${Date.now()}`;

console.log('🔍 Starting Gun.js Client');
console.log(`🆔 Client ID: ${CLIENT_ID}`);
console.log(`🔗 Connecting to relay: ${RELAY_URL}`);

// Initialize Gun.js
const gun = Gun({
  peers: [RELAY_URL], // Connect to your relay server
  localStorage: false,
  radisk: false
});

// Function to discover available hosts
function discoverHosts() {
  return new Promise((resolve) => {
    const hosts = [];
    
    gun.get('hosts').once((data) => {
      if (data) {
        Object.keys(data).forEach(key => {
          if (key !== '_' && data[key] && typeof data[key] === 'object') {
            const host = data[key];
            if (host.status === 'online') {
              hosts.push(host);
            }
          }
        });
      }
      resolve(hosts);
    });
  });
}

// Function to discover available files
function discoverFiles() {
  return new Promise((resolve) => {
    const files = [];
    
    gun.get('files').once((data) => {
      if (data) {
        Object.keys(data).forEach(key => {
          if (key !== '_' && data[key] && typeof data[key] === 'object') {
            files.push(data[key]);
          }
        });
      }
      resolve(files);
    });
  });
}

// Function to download a file
function downloadFile(fileInfo, localPath) {
  return new Promise((resolve, reject) => {
    const url = fileInfo.url;
    const protocol = url.startsWith('https') ? https : http;
    
    console.log(`📥 Downloading: ${fileInfo.filename} from ${url}`);
    
    const file = fs.createWriteStream(localPath);
    
    protocol.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          console.log(`✅ Downloaded: ${fileInfo.filename} -> ${localPath}`);
          resolve(localPath);
        });
      } else {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
      }
    }).on('error', (err) => {
      fs.unlink(localPath, () => {}); // Delete partial file
      reject(err);
    });
  });
}

// Function to request a specific file from a host
function requestFile(hostId, filename) {
  const requestId = `req-${Date.now()}`;
  
  // Send request
  gun.get('requests').get(hostId).put({
    filename: filename,
    clientId: CLIENT_ID,
    requestId: requestId,
    timestamp: Date.now()
  });
  
  // Listen for response
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Request timeout'));
    }, 10000); // 10 second timeout
    
    gun.get('responses').get(CLIENT_ID).get(requestId).once((response) => {
      clearTimeout(timeout);
      if (response && response.success) {
        resolve(response);
      } else {
        reject(new Error('File not found or request failed'));
      }
    });
  });
}

// Main client functionality
async function runClient() {
  try {
    // Wait a moment for Gun.js to connect
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('\n🔍 Discovering hosts...');
    const hosts = await discoverHosts();
    
    if (hosts.length === 0) {
      console.log('❌ No online hosts found');
      console.log('💡 Make sure the host is running and connected to the same relay');
      return;
    }
    
    console.log(`✅ Found ${hosts.length} online host(s):`);
    hosts.forEach((host, index) => {
      console.log(`  ${index + 1}. ${host.name} (ID: ${host.id})`);
      console.log(`     📂 Files: ${host.fileServerUrl}`);
    });
    
    console.log('\n📁 Discovering available files...');
    const files = await discoverFiles();
    
    if (files.length === 0) {
      console.log('❌ No files found');
      return;
    }
    
    console.log(`✅ Found ${files.length} file(s):`);
    files.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file.filename} (${file.size} bytes)`);
      console.log(`     🏠 Host: ${file.hostId}`);
      console.log(`     🔗 URL: ${file.url}`);
    });
    
    // Create downloads directory
    const downloadDir = './downloads';
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir);
    }
    
    // Download all available files
    console.log('\n📥 Downloading files...');
    for (const file of files) {
      try {
        const localPath = `${downloadDir}/${file.filename}`;
        await downloadFile(file, localPath);
      } catch (error) {
        console.log(`❌ Failed to download ${file.filename}: ${error.message}`);
      }
    }
    
    console.log('\n✅ Client finished successfully!');
    console.log(`📂 Downloaded files are in: ${downloadDir}`);
    
    // Example of requesting a specific file
    if (hosts.length > 0) {
      console.log('\n🎯 Example: Requesting a specific file...');
      try {
        const response = await requestFile(hosts[0].id, 'welcome.txt');
        console.log(`✅ File request successful: ${response.url}`);
      } catch (error) {
        console.log(`❌ File request failed: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.log(`❌ Client error: ${error.message}`);
  }
}

// Run the client
runClient().then(() => {
  console.log('\n🏁 Client session complete');
  process.exit(0);
}).catch((error) => {
  console.log(`💥 Fatal error: ${error.message}`);
  process.exit(1);
});

console.log('\n💡 Remember to replace YOUR_SERVER_IP with your actual server IP address!');

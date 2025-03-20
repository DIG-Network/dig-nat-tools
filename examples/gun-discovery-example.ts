/**
 * Advanced Gun.js Peer Discovery Example
 * 
 * This example demonstrates real-world usage patterns for Gun.js based peer discovery
 * including content sharing, announcement, discovery, and downloading in a resilient
 * network with NAT traversal.
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import * as crypto from 'crypto';
import Gun from 'gun';
import { 
  NetworkManager, 
  GunDiscovery,
  PeerDiscoveryManager,
  calculateSHA256,
  DiscoveredPeer,
  PEER_SOURCES,
  FileHost,
  createHost,
  announceFile
} from '../src';

// Configuration
const DOWNLOAD_DIR = path.join(__dirname, 'downloaded-files');
const SHARED_DIR = path.join(__dirname, 'shared-files');
const PERSISTENCE_DIR = path.join(__dirname, '.dig-nat-tools-data');
const TEST_FILE = path.join(SHARED_DIR, 'test-file.txt');
const TEST_CONTENT = 'This is a test file for Gun.js peer discovery example.';
const TEST_CONTENT_ID = 'example-test-file';

// List of public Gun relay servers (for demonstration)
const GUN_RELAY_SERVERS = [
  'https://gun-relay.herokuapp.com/gun',
  'https://gun-manhattan.herokuapp.com/gun',
  'https://us-west.gun-relay.app/gun'
];

// Create necessary directories
async function setupDirectories() {
  await fs.ensureDir(DOWNLOAD_DIR);
  await fs.ensureDir(SHARED_DIR);
  await fs.ensureDir(PERSISTENCE_DIR);
  
  // Create test file if it doesn't exist
  if (!await fs.pathExists(TEST_FILE)) {
    await fs.writeFile(TEST_FILE, TEST_CONTENT);
    console.log(`Created test file: ${TEST_FILE}`);
  }
}

/**
 * Demonstrates the entire peer discovery, content sharing, and downloading cycle
 * using Gun.js as the primary discovery mechanism.
 */
async function runExample() {
  console.log('Starting Gun.js Peer Discovery Example...\n');
  
  try {
    // Set up required directories
    await setupDirectories();
    
    // Generate a unique node ID for this session
    const nodeId = crypto.randomBytes(8).toString('hex');
    console.log(`Generated Node ID: ${nodeId}`);
    
    // Create Gun instance with persistence
    const gun = Gun({
      peers: GUN_RELAY_SERVERS,
      file: path.join(PERSISTENCE_DIR, 'gun-data'),
      localStorage: false, // Disable localStorage for Node.js
      radisk: true,        // Enable disk persistence
      multicast: false     // Disable multicast for private networks
    });
    
    // Initialize NetworkManager for Node 1 (Sharer)
    console.log('\n=== Starting Node 1 (Content Sharer) ===');
    const sharerNetwork = new NetworkManager({
      enableDHT: true,
      enablePEX: true,
      enableLocal: true,
      gunOptions: { gun },
      localId: `sharer-${nodeId}`,
      chunkSize: 64 * 1024, // 64KB chunks
      announcePort: 8001
    });
    
    // Start the network
    await sharerNetwork.start();
    console.log('Network manager started for sharer node');
    
    // Calculate hash of the test file
    const fileBuffer = await fs.readFile(TEST_FILE);
    const fileHash = await calculateSHA256(fileBuffer);
    console.log(`Test file hash: ${fileHash}`);
    
    // Create a file host for sharing the test file
    const fileHost = createHost({
      hostFileCallback: async (contentId, startChunk, chunkSize) => {
        try {
          if (contentId === TEST_CONTENT_ID || contentId === fileHash) {
            const fileData = await fs.readFile(TEST_FILE);
            // Simple implementation for this example
            return [fileData]; 
          }
          return null;
        } catch (err) {
          console.error('Error serving file:', err);
          return null;
        }
      }
    });
    
    // Add content mapping for the file
    sharerNetwork.addContentMapping(TEST_CONTENT_ID, fileHash);
    console.log(`Mapped content ID: ${TEST_CONTENT_ID} to hash: ${fileHash}`);
    
    // Announce the file using the helper function
    const peerDiscovery = await announceFile(
      TEST_CONTENT_ID,
      fileHash,
      8001,
      {
        enableDHT: true,
        enableLocal: true,
        enablePEX: true,
        enablePersistence: true
      }
    );
    
    console.log(`Announced file with hash: ${fileHash}`);
    
    // Initialize NetworkManager for Node 2 (Downloader)
    console.log('\n=== Starting Node 2 (Downloader) ===');
    const downloaderNetwork = new NetworkManager({
      enableDHT: true,
      enablePEX: true, 
      enableLocal: true,
      gunOptions: { gun },
      localId: `downloader-${nodeId}`,
      chunkSize: 64 * 1024, // 64KB chunks
      announcePort: 8002
    });
    
    // Start the network
    await downloaderNetwork.start();
    console.log('Network manager started for downloader node');
    
    // Use Gun Discovery directly for more control
    console.log('\n=== Demonstrating Direct GunDiscovery Usage ===');
    const gunDiscovery = new GunDiscovery({
      gun,
      nodeId: `discovery-${nodeId}`,
      announceInterval: 10000, // 10 seconds
      peerTTL: 3600000,        // 1 hour
      enablePersistence: true,
      persistenceDir: path.join(PERSISTENCE_DIR, 'gun-discovery')
    });
    
    // Start discovery
    await gunDiscovery.start();
    console.log('Gun discovery started');
    
    // Add the test file hash to track
    gunDiscovery.addInfoHash(fileHash, true);
    console.log(`Added hash to Gun.js for tracking: ${fileHash}`);
    
    // Add content mapping
    gunDiscovery.addContentMapping(TEST_CONTENT_ID, fileHash);
    console.log(`Added content mapping: ${TEST_CONTENT_ID} -> ${fileHash}`);
    
    // Listen for discovered peers
    gunDiscovery.on('peer:discovered', (peer: DiscoveredPeer) => {
      console.log(`[GunDiscovery] Found peer: ${peer.address}:${peer.port} via ${peer.source}`);
    });
    
    // Wait for peer discovery for demonstration purposes
    console.log('\n=== Waiting for peer discovery (10 seconds) ===');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Find peers for our test file
    console.log('\n=== Finding peers with GunDiscovery ===');
    const gunPeers = await gunDiscovery.findPeers(fileHash);
    console.log(`Found ${gunPeers.length} peers via Gun.js for hash ${fileHash}`);
    
    gunPeers.forEach((peer, idx) => {
      console.log(`Peer ${idx+1}: ${peer.address}:${peer.port} (confidence: ${peer.confidence})`);
    });
    
    // Use PeerDiscoveryManager to find peers
    console.log('\n=== Finding peers with PeerDiscoveryManager ===');
    const discoveryManager = new PeerDiscoveryManager({
      enableGun: true,
      gun: gun
    });
    await discoveryManager.start();
    const downloadPeers = await discoveryManager.findPeers(TEST_CONTENT_ID);
    console.log(`Found ${downloadPeers.length} peers via PeerDiscoveryManager for content ${TEST_CONTENT_ID}`);
    
    // Get peer list
    const peerList = downloadPeers.map(peer => `${peer.address}:${peer.port}`);
    
    // Download the file if peers were found
    if (peerList.length > 0) {
      console.log('\n=== Downloading file ===');
      const savePath = path.join(DOWNLOAD_DIR, 'downloaded-test-file.txt');
      
      try {
        await downloaderNetwork.downloadFile(peerList, TEST_CONTENT_ID, {
          savePath,
          verificationHash: fileHash,
          onProgress: (received, total) => {
            const percent = Math.floor((received / total) * 100);
            console.log(`Download progress: ${percent}% (${received}/${total} bytes)`);
          }
        });
        
        console.log(`File downloaded successfully to ${savePath}`);
        
        // Verify file content
        const downloadedContent = await fs.readFile(savePath, 'utf8');
        console.log(`\nDownloaded file content: "${downloadedContent}"`);
        console.log(`Original file content: "${TEST_CONTENT}"`);
        console.log(`Content match: ${downloadedContent === TEST_CONTENT ? 'YES ✓' : 'NO ✗'}`);
      } catch (err) {
        console.error(`Error downloading file: ${err.message}`);
      }
    } else {
      console.log('No peers found to download from. Try running again after waiting longer.');
    }
    
    // Demonstrate resilience with network partitioning
    console.log('\n=== Demonstrating Resilience with Network Partitioning ===');
    console.log('Simulating network partition by stopping discovery...');
    
    // Stop Gun discovery
    gunDiscovery.stop();
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Restart discovery to simulate reconnection after partition
    console.log('Reconnecting after network partition...');
    await gunDiscovery.start();
    
    // Wait for recovery
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Verify persisted content mappings
    console.log('\n=== Verifying Persisted Content Mappings ===');
    const retrievedHash = gunDiscovery.getHashForContent(TEST_CONTENT_ID);
    console.log(`Retrieved hash for ${TEST_CONTENT_ID}: ${retrievedHash}`);
    console.log(`Original hash: ${fileHash}`);
    console.log(`Hash match: ${retrievedHash === fileHash ? 'YES ✓' : 'NO ✗'}`);
    
    // Clean up
    console.log('\n=== Cleaning Up ===');
    await sharerNetwork.stop();
    await downloaderNetwork.stop();
    peerDiscovery.stop();
    gunDiscovery.stop();
    
    console.log('\nExample completed successfully!');
    
  } catch (error) {
    console.error('Error running example:', error);
  }
}

// Run the example
runExample().catch(console.error); 
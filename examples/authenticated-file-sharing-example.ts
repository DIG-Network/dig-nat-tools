/**
 * Authenticated File Sharing Example
 * 
 * This example demonstrates how to use the authenticated file hosting system
 * with blockchain private/public keys for peer identity.
 */

import { EventEmitter } from 'events';
import Gun from 'gun';
import { CryptoIdentity, createCryptoIdentity } from '../src/lib/crypto/identity';
import { 
  AuthenticatedFileHost, 
  createAuthenticatedFileHost 
} from '../src/lib/application/authenticated-file-host';
import { 
  AuthenticatedContentAvailabilityManager,
  createAuthenticatedContentAvailabilityManager,
  PeerContentStatus
} from '../src/lib/application/authenticated-content-availability-manager';

/**
 * Mock blockchain wallet for demo purposes
 */
class MockBlockchainWallet {
  private privateKey: string;
  private publicKey: string;
  private address: string;

  constructor() {
    // In a real scenario, these would be actual blockchain keys
    this.privateKey = '7bf22f9d440199165ce707b9d97876ad3a0e0c377ce993990e2739f3a37c1c25';
    this.publicKey = '0495e4c3908e2ef779157e3d3ff2ff897571a9c3f7e1d5fb7ca1486b7af7b196c77c9dfdad9896f25a0d850e85c9a8a61c68b5a14f6854f890190a1f981f842168';
    this.address = '0x8943d478a1353583d79bbb8bbb9e3a8413ba28c1';
  }

  getPrivateKey(): string {
    return this.privateKey;
  }

  getPublicKey(): string {
    return this.publicKey;
  }

  getAddress(): string {
    return this.address;
  }

  sign(message: string): string {
    // In a real scenario, this would use the actual blockchain signing method
    const identity = createCryptoIdentity({
      privateKey: this.privateKey,
      publicKey: this.publicKey,
      algorithm: 'secp256k1',
      outputEncoding: 'hex'
    });
    
    return identity.sign(message);
  }

  verify(message: string, signature: string, publicKey: string): boolean {
    const identity = createCryptoIdentity({
      privateKey: '', // Not needed for verification
      publicKey,
      algorithm: 'secp256k1',
      outputEncoding: 'hex'
    });
    
    return identity.verify(message, signature);
  }
}

/**
 * Mock authenticated file client for demo purposes
 */
class MockAuthenticatedFileClient extends EventEmitter {
  private wallet: MockBlockchainWallet;
  private nodeId: string;
  private contentManager: AuthenticatedContentAvailabilityManager;
  private knownHosts: Map<string, { publicKey: string, port: number }>;

  constructor(wallet: MockBlockchainWallet, gun: any) {
    super();
    
    this.wallet = wallet;
    this.nodeId = wallet.getAddress();
    this.knownHosts = new Map();
    
    // Create content manager with blockchain wallet keys
    this.contentManager = createAuthenticatedContentAvailabilityManager({
      nodeId: this.nodeId,
      privateKey: wallet.getPrivateKey(),
      publicKey: wallet.getPublicKey(),
      signatureAlgorithm: 'secp256k1',
      gun
    });
  }

  async start(): Promise<void> {
    await this.contentManager.start();
    console.log(`Client started with node ID: ${this.nodeId}`);
  }

  async stop(): Promise<void> {
    await this.contentManager.stop();
    console.log('Client stopped');
  }

  async connectToHost(hostNodeId: string, hostPublicKey: string, hostPort: number): Promise<void> {
    console.log(`Connecting to host ${hostNodeId} on port ${hostPort}`);
    
    // Store host information
    this.knownHosts.set(hostNodeId, { publicKey: hostPublicKey, port: hostPort });
    
    // Create a challenge response
    const challenge = CryptoIdentity.generateChallenge();
    console.log(`Sending connection request with challenge: ${challenge}`);
    
    // In a real implementation, we would send this to the host and wait for a challenge
    
    // Simulate host challenge
    const hostChallenge = {
      challenge: CryptoIdentity.generateChallenge(),
      timestamp: Date.now(),
      hostId: hostNodeId
    };
    
    console.log(`Received host challenge: ${hostChallenge.challenge}`);
    
    // Sign the host challenge
    const dataToSign = JSON.stringify({
      challenge: hostChallenge.challenge,
      timestamp: Date.now(),
      hostId: hostChallenge.hostId
    });
    
    const signature = this.wallet.sign(dataToSign);
    
    // Send response to host
    const response = {
      peerId: this.nodeId,
      publicKey: this.wallet.getPublicKey(),
      signature,
      timestamp: Date.now()
    };
    
    console.log('Sent signed challenge response to host');
    
    // In a real implementation, we would wait for acceptance
    console.log('Connection accepted by host');
    
    // Add host as trusted peer
    this.contentManager.addTrustedPeer(hostNodeId, hostPublicKey);
  }

  async downloadFile(hostNodeId: string, contentHash: string, savePath: string): Promise<void> {
    console.log(`Attempting to download content ${contentHash} from host ${hostNodeId}`);
    
    // Check content availability
    const status = this.contentManager.getContentStatus(hostNodeId, contentHash);
    
    if (status === PeerContentStatus.UNAVAILABLE) {
      console.error(`Content ${contentHash} is marked as unavailable from host ${hostNodeId}`);
      return;
    }
    
    if (status === PeerContentStatus.SUSPECT) {
      console.warn(`Content ${contentHash} is marked as suspect from host ${hostNodeId}, proceeding with caution`);
    }
    
    // In a real implementation, we would establish connection and download the file
    console.log(`Downloading content ${contentHash} to ${savePath}`);
    
    // Simulate download progress
    for (let i = 0; i <= 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 200));
      console.log(`Download progress: ${i * 10}%`);
    }
    
    console.log(`Download complete: ${savePath}`);
    
    // Update peer reputation after successful download
    this.contentManager.addTrustedPeer(hostNodeId, this.knownHosts.get(hostNodeId)!.publicKey);
  }

  reportContentUnavailable(hostNodeId: string, contentHash: string): void {
    console.log(`Reporting content ${contentHash} as unavailable from host ${hostNodeId}`);
    this.contentManager.reportContentUnavailable(hostNodeId, contentHash, 'Content not found');
  }
}

/**
 * Run the authenticated file sharing example
 */
async function runExample() {
  // Create Gun instance (would connect to actual peers in production)
  const gun = new Gun({
    peers: ['https://gun-server.example.com/gun']
  });
  
  console.log('===============================');
  console.log('Authenticated File Sharing Example');
  console.log('===============================\n');
  
  // Create blockchain wallets for host and client
  const hostWallet = new MockBlockchainWallet();
  const clientWallet = new MockBlockchainWallet();
  
  console.log('Host Address (nodeId):', hostWallet.getAddress());
  console.log('Client Address (nodeId):', clientWallet.getAddress());
  console.log();
  
  // Create host with blockchain wallet keys
  const host = createAuthenticatedFileHost({
    port: 8080,
    directory: './shared-files',
    privateKey: hostWallet.getPrivateKey(),
    publicKey: hostWallet.getPublicKey(),
    signatureAlgorithm: 'secp256k1',
    requirePeerAuthentication: true,
    gun
  });
  
  // Create content manager for host
  const hostContentManager = createAuthenticatedContentAvailabilityManager({
    nodeId: hostWallet.getAddress(),
    privateKey: hostWallet.getPrivateKey(),
    publicKey: hostWallet.getPublicKey(),
    signatureAlgorithm: 'secp256k1',
    gun
  });
  
  // Create client
  const client = new MockAuthenticatedFileClient(clientWallet, gun);
  
  // Start host and client
  console.log('Starting host and client...');
  await host.start();
  await hostContentManager.start();
  await client.start();
  
  // Add a file to share
  console.log('\n--- Hosting a file ---');
  const fileInfo = await host.addFile('./example-file.mp4', {
    contentId: 'awesome-video',
    announceLevel: 'high'
  });
  
  console.log(`Added file: ${fileInfo.path}`);
  console.log(`Content Hash: ${fileInfo.hash}`);
  console.log(`Content ID: ${fileInfo.contentId}`);
  
  // Announce content availability
  console.log('\n--- Announcing content availability ---');
  hostContentManager.announceContentAvailable(fileInfo.hash, {
    port: 8080,
    contentId: fileInfo.contentId
  });
  
  // Connect client to host
  console.log('\n--- Establishing authenticated connection ---');
  await client.connectToHost(
    hostWallet.getAddress(),
    hostWallet.getPublicKey(),
    8080
  );
  
  // Download the file
  console.log('\n--- Downloading file ---');
  await client.downloadFile(hostWallet.getAddress(), fileInfo.hash, './downloads/example-file.mp4');
  
  // Remove the file from hosting
  console.log('\n--- Removing file from hosting ---');
  await host.removeFile(fileInfo.hash);
  
  // Announce content unavailability
  hostContentManager.announceContentUnavailable(fileInfo.hash, fileInfo.contentId);
  
  // Try to download again (will fail)
  console.log('\n--- Attempting download after removal ---');
  try {
    await client.downloadFile(hostWallet.getAddress(), fileInfo.hash, './downloads/example-file-2.mp4');
  } catch (err) {
    console.error('Download failed as expected:', err);
  }
  
  // Report content as unavailable
  console.log('\n--- Reporting content unavailability ---');
  client.reportContentUnavailable(hostWallet.getAddress(), fileInfo.hash);
  
  // Cleanup
  console.log('\n--- Cleanup ---');
  await client.stop();
  await hostContentManager.stop();
  await host.stop();
  
  console.log('\nExample completed successfully!');
}

// Run the example
runExample().catch(err => {
  console.error('Error running example:', err);
}); 
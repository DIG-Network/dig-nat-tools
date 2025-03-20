/**
 * Content Availability Management Example
 * 
 * This example demonstrates how to use the content availability management system
 * to track content availability across different peer discovery mechanisms.
 */

import Gun from 'gun';
import { EventEmitter } from 'events';
import {
  createContentAvailabilityManager,
  createDiscoveryContentIntegration,
  PeerContentStatus,
  VerificationResult,
} from '../src';

// Mock types and interfaces used in the example
interface MockPeer {
  id: string;
  infoHash: string;
  [key: string]: any;
}

interface MockDiscoveryComponent extends EventEmitter {
  start(): Promise<void>;
  stop(): Promise<void>;
  findPeers(infoHash: string): Promise<MockPeer[]>;
  removePeer?(peerId: string, infoHash: string): void;
}

// Mock DHT Client
class MockDHTClient extends EventEmitter implements MockDiscoveryComponent {
  private peers: Map<string, string[]> = new Map();

  async start(): Promise<void> {
    console.log('DHT client started');
  }

  async stop(): Promise<void> {
    console.log('DHT client stopped');
  }

  addPeer(peerId: string, infoHash: string): void {
    const peerHashes = this.peers.get(peerId) || [];
    if (!peerHashes.includes(infoHash)) {
      peerHashes.push(infoHash);
    }
    this.peers.set(peerId, peerHashes);
  }

  removePeer(peerId: string, infoHash: string): void {
    const peerHashes = this.peers.get(peerId) || [];
    const index = peerHashes.indexOf(infoHash);
    if (index !== -1) {
      peerHashes.splice(index, 1);
      this.peers.set(peerId, peerHashes);
      console.log(`DHT: Removed peer ${peerId} for hash ${infoHash}`);
    }
  }

  async findPeers(infoHash: string): Promise<MockPeer[]> {
    const result: MockPeer[] = [];
    for (const [peerId, hashes] of this.peers.entries()) {
      if (hashes.includes(infoHash)) {
        result.push({ id: peerId, infoHash });
      }
    }
    return result;
  }
}

// Mock PEX Manager
class MockPEXManager extends EventEmitter implements MockDiscoveryComponent {
  private peers: Map<string, Set<string>> = new Map();

  async start(): Promise<void> {
    console.log('PEX manager started');
  }

  async stop(): Promise<void> {
    console.log('PEX manager stopped');
  }

  addPeer(peerId: string, infoHash: string): void {
    if (!this.peers.has(infoHash)) {
      this.peers.set(infoHash, new Set());
    }
    this.peers.get(infoHash)!.add(peerId);
  }

  removePeer(peerId: string, infoHash: string): void {
    const peerSet = this.peers.get(infoHash);
    if (peerSet && peerSet.has(peerId)) {
      peerSet.delete(peerId);
      console.log(`PEX: Removed peer ${peerId} for hash ${infoHash}`);
    }
  }

  async findPeers(infoHash: string): Promise<MockPeer[]> {
    const peerSet = this.peers.get(infoHash);
    if (!peerSet) return [];
    return Array.from(peerSet).map(id => ({ id, infoHash }));
  }
}

// Mock Gun Discovery
class MockGunDiscovery extends EventEmitter implements MockDiscoveryComponent {
  private announcements: Map<string, Set<string>> = new Map();

  async start(): Promise<void> {
    console.log('Gun discovery started');
  }

  async stop(): Promise<void> {
    console.log('Gun discovery stopped');
  }

  announce(infoHash: string, peerId: string): void {
    if (!this.announcements.has(infoHash)) {
      this.announcements.set(infoHash, new Set());
    }
    this.announcements.get(infoHash)!.add(peerId);
  }

  unannounce(infoHash: string, peerId: string): void {
    const peerSet = this.announcements.get(infoHash);
    if (peerSet && peerSet.has(peerId)) {
      peerSet.delete(peerId);
      console.log(`Gun: Removed announcement for peer ${peerId} and hash ${infoHash}`);
    }
  }

  async findPeers(infoHash: string): Promise<MockPeer[]> {
    const peerSet = this.announcements.get(infoHash);
    if (!peerSet) return [];
    return Array.from(peerSet).map(id => ({ id, infoHash }));
  }
}

async function runExample() {
  console.log('Starting content availability example...');

  // Create a Gun instance
  const gun = Gun();

  // Create mock discovery components
  const dhtClient = new MockDHTClient();
  const pexManager = new MockPEXManager();
  const gunDiscovery = new MockGunDiscovery();

  // Generate unique node IDs
  const hostNodeId = 'host-' + Math.random().toString(36).substring(2, 10);
  const clientNodeId = 'client-' + Math.random().toString(36).substring(2, 10);

  // Content info
  const contentHash = 'QmHash123456789';
  const contentId = 'my-test-video';

  // Create content manager for the host
  console.log('\n--- Host Setup ---');
  const hostContentManager = createContentAvailabilityManager({
    nodeId: hostNodeId,
    gun,
    contentTTL: 60000, // 1 minute for testing
    reannounceInterval: 30000, // 30 seconds for testing
  });

  // Create integration for the host
  const hostIntegration = createDiscoveryContentIntegration({
    nodeId: hostNodeId,
    gun,
    verificationTimeout: 5000,
  });

  // Register components with host integration
  hostIntegration.registerDHTClient(dhtClient as any);
  hostIntegration.registerPEXManager(pexManager as any);
  hostIntegration.registerGunDiscovery(gunDiscovery as any);

  // Start host components
  await hostContentManager.start();
  await hostIntegration.start();

  // Host announces content
  console.log(`Host ${hostNodeId} announcing content ${contentHash} (${contentId})`);
  hostContentManager.announceContentAvailable(contentHash, {
    port: 8080,
    contentId,
  });

  // Add host to discovery mechanisms (would happen automatically in real integration)
  dhtClient.addPeer(hostNodeId, contentHash);
  pexManager.addPeer(hostNodeId, contentHash);
  gunDiscovery.announce(contentHash, hostNodeId);

  // Create content manager for the client
  console.log('\n--- Client Setup ---');
  const clientContentManager = createContentAvailabilityManager({
    nodeId: clientNodeId,
    gun,
    contentTTL: 60000,
  });

  // Create integration for the client
  const clientIntegration = createDiscoveryContentIntegration({
    nodeId: clientNodeId,
    gun,
    verificationTimeout: 5000,
  });

  // Register components with client integration
  clientIntegration.registerDHTClient(dhtClient as any);
  clientIntegration.registerPEXManager(pexManager as any);
  clientIntegration.registerGunDiscovery(gunDiscovery as any);

  // Start client components
  await clientContentManager.start();
  await clientIntegration.start();

  // Client searches for peers
  console.log('\n--- Client Peer Discovery ---');
  const dhtPeers = await dhtClient.findPeers(contentHash);
  const pexPeers = await pexManager.findPeers(contentHash);
  const gunPeers = await gunDiscovery.findPeers(contentHash);

  console.log(`DHT peers: ${dhtPeers.length}`);
  console.log(`PEX peers: ${pexPeers.length}`);
  console.log(`Gun peers: ${gunPeers.length}`);

  // Combine all peers
  const allPeers = [...dhtPeers, ...pexPeers, ...gunPeers];
  console.log(`Total peers found: ${allPeers.length}`);

  // Check peer status
  const hostStatus = clientContentManager.getPeerContentStatus(hostNodeId, contentHash);
  console.log(`Host status for content: ${hostStatus}`);

  // Filter peers by content status
  const filteredPeers = clientIntegration.filterPeersByContentStatus(allPeers as any, contentHash);
  console.log(`Filtered peers: ${filteredPeers.length}`);

  // SCENARIO 1: Host-initiated content removal
  console.log('\n--- SCENARIO 1: Host-initiated content removal ---');
  console.log('Host announces that content is no longer available');
  
  hostContentManager.announceContentUnavailable(contentHash, contentId);
  
  // Small delay to allow announcement to propagate
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Check peer status after removal
  const hostStatusAfterRemoval = clientContentManager.getPeerContentStatus(hostNodeId, contentHash);
  console.log(`Host status after removal: ${hostStatusAfterRemoval}`);
  
  // Find peers again
  const peersAfterRemoval = await Promise.all([
    dhtClient.findPeers(contentHash),
    pexManager.findPeers(contentHash),
    gunDiscovery.findPeers(contentHash)
  ]);
  
  const totalPeersAfterRemoval = peersAfterRemoval.reduce((total, peers) => total + peers.length, 0);
  console.log(`Total peers after removal: ${totalPeersAfterRemoval}`);

  // SCENARIO 2: Client-detected content unavailability with consensus
  console.log('\n--- SCENARIO 2: Client-detected content unavailability with consensus ---');
  
  // Reset state for second scenario
  hostContentManager.announceContentAvailable(contentHash, {
    port: 8080,
    contentId,
  });
  
  dhtClient.addPeer(hostNodeId, contentHash);
  pexManager.addPeer(hostNodeId, contentHash);
  gunDiscovery.announce(contentHash, hostNodeId);
  
  // Small delay to allow announcement to propagate
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Create some additional mock clients to report content unavailability
  const additionalClientIds = [
    'client-' + Math.random().toString(36).substring(2, 10),
    'client-' + Math.random().toString(36).substring(2, 10),
    'client-' + Math.random().toString(36).substring(2, 10)
  ];
  
  console.log('Multiple clients report that content is unavailable from host');
  
  // First client reports content unavailable
  clientContentManager.reportContentUnavailable(hostNodeId, contentHash);
  console.log(`Client ${clientNodeId} reported content unavailable`);
  
  // Check status after first report
  const statusAfterOneReport = clientContentManager.getPeerContentStatus(hostNodeId, contentHash);
  console.log(`Host status after one report: ${statusAfterOneReport}`);
  
  // Additional clients report content unavailable
  for (const clientId of additionalClientIds) {
    clientContentManager.reportContentUnavailable(hostNodeId, contentHash, clientId);
    console.log(`Client ${clientId} reported content unavailable`);
    
    // Small delay between reports
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check status after each additional report
    const currentStatus = clientContentManager.getPeerContentStatus(hostNodeId, contentHash);
    console.log(`Host status after report from ${clientId}: ${currentStatus}`);
  }
  
  // Small delay to allow verification and consensus
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Final check of status and peers
  const finalStatus = clientContentManager.getPeerContentStatus(hostNodeId, contentHash);
  console.log(`Final host status: ${finalStatus}`);
  
  const finalPeers = await Promise.all([
    dhtClient.findPeers(contentHash),
    pexManager.findPeers(contentHash),
    gunDiscovery.findPeers(contentHash)
  ]);
  
  const totalFinalPeers = finalPeers.reduce((total, peers) => total + peers.length, 0);
  console.log(`Total peers after consensus: ${totalFinalPeers}`);

  // Cleanup
  console.log('\n--- Cleanup ---');
  await clientIntegration.stop();
  await clientContentManager.stop();
  await hostIntegration.stop();
  await hostContentManager.stop();
  
  // Close Gun connection
  console.log('Shutting down...');
}

// Run the example
runExample().catch(error => {
  console.error('Error in example:', error);
}); 
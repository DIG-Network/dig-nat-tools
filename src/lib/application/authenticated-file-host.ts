/**
 * Authenticated File Host
 * 
 * Extends the base FileHost with cryptographic identity capabilities
 * allowing for secure peer verification and signed content announcements.
 */

import { EventEmitter } from 'events';
import { 
  CryptoIdentity,
  createCryptoIdentity,
  signData,
  verifySignedData 
} from '../crypto/identity';
import type { SignatureAlgorithm } from '../crypto/identity';
import { 
  PeerDiscoveryManager,
  AnnouncePriority,
  NODE_TYPE 
} from '../discovery/peer';
import type { PeerDiscoveryOptions } from '../discovery/peer';
import FileHost from '../transport/host';
import type { GunInstance } from '../types/gun';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Options for creating an authenticated file host
 */
export interface AuthenticatedFileHostOptions {
  port: number;
  directory: string;
  privateKey: Buffer | string;
  publicKey?: Buffer | string;
  signatureAlgorithm?: SignatureAlgorithm;
  keyEncoding?: BufferEncoding;
  
  // Discovery options
  dhtEnabled?: boolean;
  pexEnabled?: boolean;
  localEnabled?: boolean;
  gunEnabled?: boolean;
  
  // Optional Gun instance
  gun?: GunInstance;
  
  // Authentication options
  requirePeerAuthentication?: boolean;
  acceptAnonymousPeers?: boolean;
  knownPeers?: Record<string, string>; // nodeId -> publicKey
}

/**
 * File information interface
 */
export interface AuthenticatedFileInfo {
  path: string;
  hash: string;
  size: number;
  contentId?: string;
  signature?: string;
  timestamp?: number;
}

/**
 * Connection challenge for peer authentication
 */
export interface ConnectionChallenge {
  challenge: string;
  timestamp: number;
  hostId: string;
}

/**
 * Connection response from peer
 */
export interface ConnectionResponse {
  peerId: string;
  publicKey: string;
  signature: string;
  timestamp: number;
}

/**
 * Authenticated file host class
 */
export class AuthenticatedFileHost extends EventEmitter {
  private readonly port: number;
  private readonly directory: string;
  private readonly identity: CryptoIdentity;
  private readonly nodeId: string;
  private readonly requirePeerAuth: boolean;
  private readonly acceptAnonymous: boolean;
  private readonly knownPeers: Record<string, string>;
  private readonly fileRegistry: Map<string, AuthenticatedFileInfo>;
  private readonly contentIdMap: Map<string, string>;
  private readonly challenges: Map<string, ConnectionChallenge>;
  private fileHost: FileHost | null = null;
  private discoveryManager: PeerDiscoveryManager | null = null;
  private isStarted: boolean = false;
  private readonly options: AuthenticatedFileHostOptions;
  private cleanupInterval?: NodeJS.Timeout;
  private currentRequestPeerId?: string;
  
  constructor(options: AuthenticatedFileHostOptions) {
    super();
    
    this.options = options;
    this.port = options.port;
    this.directory = options.directory;
    this.requirePeerAuth = options.requirePeerAuthentication ?? false;
    this.acceptAnonymous = options.acceptAnonymousPeers ?? true;
    this.knownPeers = options.knownPeers || {};
    
    // Initialize identity
    this.identity = createCryptoIdentity({
      privateKey: options.privateKey,
      publicKey: options.publicKey,
      algorithm: options.signatureAlgorithm || 'ed25519',
      encoding: options.keyEncoding || 'hex',
      outputEncoding: 'hex'
    });
    
    this.nodeId = this.identity.getNodeId();
    
    this.fileRegistry = new Map<string, AuthenticatedFileInfo>();
    this.contentIdMap = new Map<string, string>();
    this.challenges = new Map<string, ConnectionChallenge>();
    
    // Add event listeners
    this.on('connection:request', this.handleConnectionRequest.bind(this));
    this.on('connection:response', this.handleConnectionResponse.bind(this));
  }
  
  /**
   * Start the file host
   */
  public async start(): Promise<void> {
    if (this.isStarted) {
      throw new Error('File host is already started');
    }

    try {
      // Create the hosting directory if it doesn't exist
      await fs.ensureDir(this.directory);

      // Initialize the file host
      this.fileHost = new FileHost({
        hostId: this.nodeId,
        hostFileCallback: this.handleFileRequest.bind(this),
        chunkSize: 64 * 1024, // 64KB chunks
        stunServers: ['stun:stun.l.google.com:19302'],
        enableTCP: true,
        enableUDP: true,
        enableWebRTC: true,
        tcpPort: this.port,
        udpPort: this.port + 1,
        watchDir: this.directory,
        watchRecursive: false,
        nodeType: NODE_TYPE.STANDARD,
        gunOptions: this.options.gun ? { instance: this.options.gun } : undefined
      });

      // Start the file host
      await this.fileHost.start();

      // Initialize discovery manager with appropriate options
      this.discoveryManager = new PeerDiscoveryManager({
        enableDHT: this.options.dhtEnabled ?? true,
        enablePEX: this.options.pexEnabled ?? true,
        enableLocal: this.options.localEnabled ?? true,
        enableGun: this.options.gunEnabled ?? false,
        gun: this.options.gun,
        announcePort: this.port,
        nodeId: this.nodeId
      } as PeerDiscoveryOptions);

      // Start discovery manager
      await this.discoveryManager.start();

      // Register existing files in the directory
      await this.registerExistingFiles();

      // Setup cleanup interval
      this.cleanupInterval = setInterval(() => {
        this.cleanupExpiredChallenges();
      }, 5 * 60 * 1000); // Clean up every 5 minutes

      this.isStarted = true;
      this.emit('started', { nodeId: this.nodeId, port: this.port });

    } catch (error) {
      // Clean up if startup fails
      await this.stop();
      throw error;
    }
  }
  
  /**
   * Stop the file host
   */
  public async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    try {
      // Stop file host
      if (this.fileHost) {
        await this.fileHost.stop();
        this.fileHost = null;
      }

      // Stop discovery manager
      if (this.discoveryManager) {
        await this.discoveryManager.stop();
        this.discoveryManager = null;
      }

      // Clear cleanup interval
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = undefined;
      }

      // Clear all registries and challenges
      this.fileRegistry.clear();
      this.contentIdMap.clear();
      this.challenges.clear();

      this.isStarted = false;
      this.emit('stopped', { nodeId: this.nodeId });

    } catch (error) {
      console.error('Error stopping file host:', error);
      throw error;
    }
  }
  
  /**
   * Calculate SHA-256 hash of a file
   * @private
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      
      stream.on('error', err => reject(err));
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }
  
  /**
   * Add a file to share
   */
  public async addFile(
    filePath: string, 
    options?: { contentId?: string; announceLevel?: 'low' | 'medium' | 'high' }
  ): Promise<AuthenticatedFileInfo> {
    if (!this.isStarted) {
      throw new Error('File host is not started');
    }

    // Ensure file exists
    if (!await fs.pathExists(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    try {
      // Get file stats
      const stats = await fs.stat(filePath);
      
      // Calculate file hash
      const hash = await this.calculateFileHash(filePath);

      // Copy file to hosting directory if not already there
      const hostedPath = path.join(this.directory, hash);
      if (filePath !== hostedPath) {
        await fs.copy(filePath, hostedPath);
      }

      // Create file info
      const fileInfo: AuthenticatedFileInfo = {
        path: hostedPath,
        hash,
        size: stats.size,
        contentId: options?.contentId,
        timestamp: Date.now()
      };

      // Sign the file info
      const signedData = signData(
        { hash: fileInfo.hash, contentId: fileInfo.contentId },
        this.identity,
        this.nodeId
      );

      fileInfo.signature = signedData.signature;

      // Register the file
      this.fileRegistry.set(fileInfo.hash, fileInfo);

      // Map content ID to hash if provided
      if (fileInfo.contentId) {
        this.contentIdMap.set(fileInfo.contentId, fileInfo.hash);
      }

      // Announce availability with priority
      if (this.discoveryManager) {
        const priority = options?.announceLevel === 'high' ? AnnouncePriority.HIGH :
                        options?.announceLevel === 'medium' ? AnnouncePriority.MEDIUM :
                        AnnouncePriority.LOW;
        await this.discoveryManager.addInfoHash(fileInfo.hash, priority);
      }

      this.emit('file:added', fileInfo);
      return fileInfo;

    } catch (error) {
      console.error('Error adding file:', error);
      throw error;
    }
  }
  
  /**
   * Register existing files in the hosting directory
   * @private
   */
  private async registerExistingFiles(): Promise<void> {
    try {
      // Read all files in the directory
      const files = await fs.readdir(this.directory);

      // Process each file
      for (const file of files) {
        const filePath = path.join(this.directory, file);
        const stats = await fs.stat(filePath);

        // Skip directories
        if (!stats.isFile()) {
          continue;
        }

        // Calculate hash and register file
        const hash = await this.calculateFileHash(filePath);
        const fileInfo: AuthenticatedFileInfo = {
          path: filePath,
          hash,
          size: stats.size,
          timestamp: Date.now()
        };

        // Sign the file info
        const signedData = signData(
          { hash: fileInfo.hash },
          this.identity,
          this.nodeId
        );

        fileInfo.signature = signedData.signature;

        // Register the file
        this.fileRegistry.set(fileInfo.hash, fileInfo);

        // Announce availability
        if (this.discoveryManager) {
          await this.discoveryManager.addInfoHash(fileInfo.hash, AnnouncePriority.MEDIUM);
        }

        this.emit('file:registered', fileInfo);
      }
    } catch (error) {
      console.error('Error registering existing files:', error);
      throw error;
    }
  }
  
  /**
   * Announce content unavailability
   */
  public async announceContentUnavailable(hash: string, contentId?: string): Promise<void> {
    if (this.discoveryManager) {
      await this.discoveryManager.removeInfoHash(hash);
    }

    // Remove from registries
    this.fileRegistry.delete(hash);
    if (contentId) {
      this.contentIdMap.delete(contentId);
    }

    this.emit('content:unavailable', { hash, contentId });
  }
  
  /**
   * Create a challenge for a peer connection request
   */
  private createConnectionChallenge(peerId: string): ConnectionChallenge {
    const challenge = CryptoIdentity.generateChallenge();
    const timestamp = Date.now();
    
    const challengeData: ConnectionChallenge = {
      challenge,
      timestamp,
      hostId: this.nodeId
    };
    
    // Store challenge for later verification
    this.challenges.set(peerId, challengeData);
    
    return challengeData;
  }
  
  /**
   * Handle connection request from a peer
   */
  private handleConnectionRequest(peerId: string): void {
    const challenge = this.createConnectionChallenge(peerId);
    
    // Clean up old challenge if it exists
    if (this.challenges.has(peerId)) {
      this.challenges.delete(peerId);
    }
    
    // Store new challenge
    this.challenges.set(peerId, challenge);
    
    this.emit('challenge:created', { peerId, challenge });
  }
  
  /**
   * Handle connection response from a peer
   */
  private handleConnectionResponse(response: ConnectionResponse): void {
    const { peerId, publicKey, signature, timestamp } = response;
    
    // Check if we have a challenge for this peer
    const challenge = this.challenges.get(peerId);
    if (!challenge) {
      this.emit('connection:error', { peerId, error: 'No challenge found' });
      return;
    }
    
    // Check if the challenge is expired (5 minutes)
    const now = Date.now();
    if (now - challenge.timestamp > 5 * 60 * 1000) {
      this.challenges.delete(peerId);
      this.emit('connection:error', { peerId, error: 'Challenge expired' });
      return;
    }
    
    // Check if we know this peer
    const isKnownPeer = this.knownPeers[peerId] !== undefined;
    
    // If we require authentication and this peer is not known
    if (this.requirePeerAuth && !isKnownPeer && !this.acceptAnonymous) {
      this.emit('connection:error', { peerId, error: 'Unknown peer' });
      return;
    }
    
    // Create identity for verification with the peer's public key
    const tempIdentity = createCryptoIdentity({
      privateKey: '', // Not needed for verification
      publicKey: isKnownPeer ? this.knownPeers[peerId] : publicKey,
      algorithm: 'ed25519',
      outputEncoding: 'hex'
    });
    
    // Verify signature
    const dataToVerify = {
      challenge: challenge.challenge,
      timestamp: challenge.timestamp,
      hostId: challenge.hostId
    };
    
    const isValid = verifySignedData(
      { data: dataToVerify, signature, publicKey, timestamp },
      tempIdentity
    );
    
    if (!isValid) {
      this.emit('connection:error', { peerId, error: 'Invalid signature' });
      return;
    }
    
    // If signature is valid and this is a new peer, add to known peers
    if (!isKnownPeer) {
      this.knownPeers[peerId] = publicKey;
    }
    
    // Clean up challenge
    this.challenges.delete(peerId);
    
    // Accept connection
    this.emit('connection:accepted', { peerId });
  }
  
  /**
   * Clean up expired challenges
   * @private
   */
  private cleanupExpiredChallenges(): void {
    const now = Date.now();
    for (const [peerId, challenge] of this.challenges.entries()) {
      if (now - challenge.timestamp > 5 * 60 * 1000) {
        this.challenges.delete(peerId);
      }
    }
  }
  
  /**
   * Get public information about this host
   */
  public getPublicInfo() {
    return {
      nodeId: this.nodeId,
      port: this.port,
      files: Array.from(this.fileRegistry.values())
    };
  }

  /**
   * Check if a peer is authenticated
   * @private
   */
  private isPeerAuthenticated(peerId: string): boolean {
    return this.knownPeers[peerId] !== undefined;
  }

  /**
   * Set the current request's peer ID
   */
  public setCurrentRequestPeerId(peerId: string | undefined) {
    this.currentRequestPeerId = peerId;
  }

  /**
   * Handle a file request from a peer
   */
  public async handleFileRequest(
    contentId: string,
    startChunk: number,
    chunkSize: number,
    sha256?: string
  ): Promise<Buffer[] | null> {
    try {
      // Check peer authentication if required
      if (this.requirePeerAuth && !this.acceptAnonymous && this.currentRequestPeerId) {
        if (!this.isPeerAuthenticated(this.currentRequestPeerId)) {
          console.warn(`Unauthenticated file request from peer ${this.currentRequestPeerId}`);
          return null;
        }
      }

      // Try to find file by hash first
      let filePath: string;
      if (sha256) {
        filePath = path.join(this.directory, sha256);
      } else {
        const hash = this.contentIdMap.get(contentId);
        if (!hash) {
          console.warn(`Content ID not found: ${contentId}`);
          return null;
        }
        filePath = path.join(this.directory, hash);
      }

      // Check if file exists
      if (!await fs.pathExists(filePath)) {
        console.warn(`File not found: ${filePath}`);
        // If file is missing but we have it in our registry, announce it as unavailable
        if (sha256 && this.fileRegistry.has(sha256)) {
          await this.announceContentUnavailable(sha256, contentId);
        } else if (!sha256 && contentId) {
          const hash = this.contentIdMap.get(contentId);
          if (hash) {
            await this.announceContentUnavailable(hash, contentId);
          }
        }
        return null;
      }

      // Read file chunks
      const fileStream = fs.createReadStream(filePath, {
        start: startChunk * chunkSize,
        end: (startChunk + 1) * chunkSize - 1
      });

      return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        fileStream.on('data', (chunk: Buffer | string) => {
          if (Buffer.isBuffer(chunk)) {
            chunks.push(chunk);
          } else {
            chunks.push(Buffer.from(chunk));
          }
        });
        fileStream.on('end', () => resolve(chunks));
        fileStream.on('error', async (err) => {
          console.error(`Error reading file chunks: ${err}`);
          // If we get an error reading the file, announce it as unavailable
          if (sha256) {
            await this.announceContentUnavailable(sha256, contentId);
          }
          reject(err);
        });
      });

    } catch (error) {
      console.error(`Error handling file request: ${error}`);
      return null;
    }
  }

  /**
   * Remove a file from sharing
   */
  public async removeFile(hash: string): Promise<void> {
    if (!this.isStarted) {
      throw new Error('File host is not started');
    }

    const fileInfo = this.fileRegistry.get(hash);
    if (!fileInfo) {
      throw new Error(`File not found with hash: ${hash}`);
    }

    try {
      // Announce unavailability
      await this.announceContentUnavailable(hash, fileInfo.contentId);

      // Delete the file if it exists in our directory
      const filePath = path.join(this.directory, hash);
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
      }

      this.emit('file:removed', fileInfo);
    } catch (error) {
      console.error('Error removing file:', error);
      throw error;
    }
  }
}

/**
 * Create an authenticated file host
 */
export function createAuthenticatedFileHost(
  options: AuthenticatedFileHostOptions
): AuthenticatedFileHost {
  return new AuthenticatedFileHost(options);
} 
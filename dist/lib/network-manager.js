"use strict";
/**
 * Network Manager that handles connections and file transfers
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const gun_1 = __importDefault(require("gun"));
const events_1 = require("events");
const client_1 = __importDefault(require("./client"));
const nat_traversal_manager_1 = require("./utils/nat-traversal-manager");
const debug_1 = __importDefault(require("debug"));
const connection_registry_1 = require("./utils/connection-registry");
const peer_discovery_manager_1 = require("./utils/peer-discovery-manager");
const host_1 = require("./host");
const constants_1 = require("../types/constants");
const debug = (0, debug_1.default)('dig-nat-tools:network-manager');
// Helper function to generate a random port
function getRandomPort() {
    return Math.floor(Math.random() * (65535 - 49152)) + 49152;
}
class NetworkManager extends events_1.EventEmitter {
    /**
     * Create a new NetworkManager instance
     * @param config - Configuration options
     */
    constructor(config = {}) {
        super();
        this._speedHistory = []; // Array to store recent download speeds
        // New properties for connection tracking
        this.connectionTypes = {};
        // Add these properties to the NetworkManager class
        this._pieceRarityMap = new Map(); // piece index -> count of peers who have it
        this._isInEndgameMode = false;
        this._endgameModeThreshold = 0.95; // Start endgame when 95% complete
        this._infoHash = null;
        this._isStarted = false;
        // Add these new properties for continuous peer discovery
        this._activePeers = new Set(); // Keep track of active peers in current download
        this._continuousDiscoveryInterval = null;
        this._maxPeersToConnect = 10; // Maximum number of peers to maintain for downloads
        this._isContinuousDiscoveryEnabled = false; // Flag to toggle continuous discovery
        // Add content mapping property
        this._contentHashMap = new Map(); // Maps contentId to fileHash
        this.peerDiscovery = null;
        this.host = null;
        this.dht = null;
        this.gun = null;
        this.fileClients = new Map();
        this.started = false;
        this.chunkSize = config.chunkSize || 64 * 1024; // 64KB default
        this.concurrency = config.concurrency || 3; // Default concurrent downloads
        this.peerTimeout = config.peerTimeout || 30000; // 30 seconds
        this.gunOptions = config.gunOptions || {};
        this.stunServers = config.stunServers || ['stun:stun.l.google.com:19302'];
        // Initialize NAT traversal properties
        this.localId = config.localId || crypto.randomBytes(16).toString('hex');
        this.localTCPPort = config.localTCPPort || getRandomPort();
        this.localUDPPort = config.localUDPPort || getRandomPort();
        this.turnServer = config.turnServer;
        this.turnUsername = config.turnUsername;
        this.turnPassword = config.turnPassword;
        // Initialize Gun instance for signaling if not provided
        if (this.gunOptions.instance) {
            this.gunInstance = this.gunOptions.instance;
        }
        else {
            // Use type assertion for Gun instantiation
            this.gunInstance = new gun_1.default(this.gunOptions);
        }
        // New adaptive download settings
        this.maxConcurrency = config.maxConcurrency || 10;
        this.minConcurrency = config.minConcurrency || 1;
        this.bandwidthCheckInterval = config.bandwidthCheckInterval || 5000; // 5 seconds
        this.slowPeerThreshold = config.slowPeerThreshold || 0.5; // 50% of average speed
        this.connections = new Map();
        this.downloadStartTime = 0;
        // Initialize peer discovery manager
        this._options = {
            enableDHT: config.enableDHT !== undefined ? config.enableDHT : true,
            enableLocal: config.enableLocal !== undefined ? config.enableLocal : true,
            enablePEX: config.enablePEX !== undefined ? config.enablePEX : true,
            enableIPv6: config.enableIPv6 !== undefined ? config.enableIPv6 : false,
            maxPeers: config.maxPeers || 5,
            announcePort: config.announcePort || 0,
            enableLogging: false
        };
        this._discoveryManager = new peer_discovery_manager_1.PeerDiscoveryManager({
            enableDHT: this._options.enableDHT,
            enableLocal: this._options.enableLocal,
            enablePEX: this._options.enablePEX,
            enableIPv6: this._options.enableIPv6,
            announcePort: this._options.announcePort
        });
        // Set flag for continuous discovery if provided
        this._isContinuousDiscoveryEnabled = config.enableContinuousDiscovery !== undefined ?
            config.enableContinuousDiscovery : true;
        // Set maximum number of peers to connect if provided
        this._maxPeersToConnect = config.maxPeers || 10;
        // Generate a unique node ID
        this.nodeId = this._generateNodeId();
    }
    /**
     * Toggle continuous peer discovery during downloads
     * @param enabled - Whether to enable continuous peer discovery
     */
    setEnableContinuousDiscovery(enabled) {
        this._isContinuousDiscoveryEnabled = enabled;
        debug(`Continuous peer discovery ${enabled ? 'enabled' : 'disabled'}`);
    }
    /**
     * Download a file from multiple peers
     * @param peers - Array of peer IDs
     * @param contentId - Content identifier for the file
     * @param options - Download options
     * @returns Promise with download result
     */
    async downloadFile(peers, contentId, options) {
        if (!peers || peers.length === 0) {
            throw new Error('At least one peer is required');
        }
        if (!contentId) {
            throw new Error('Content ID is required');
        }
        if (!options.savePath) {
            throw new Error('Save path is required');
        }
        const { savePath, onProgress, onPeerStatus, verificationHash } = options;
        // Determine the file hash to use for verification
        // Use verificationHash from options if provided, otherwise look it up from content mapping
        let fileHash = verificationHash;
        if (!fileHash) {
            fileHash = this.getHashForContent(contentId);
            if (!fileHash) {
                debug(`Warning: No verification hash found for contentId ${contentId}`);
                // Fall back to using the contentId itself if no mapping exists
                fileHash = contentId;
            }
            else {
                debug(`Using mapped hash ${fileHash} for content ID ${contentId}`);
            }
        }
        else {
            // If verificationHash was provided, make sure we have the mapping
            this.addContentMapping(contentId, fileHash);
        }
        this._infoHash = contentId; // Store the content ID for discovery
        this.downloadStartTime = Date.now();
        debug(`Starting multi-peer download of content ${contentId} (hash: ${fileHash}) from ${peers.length} peers`);
        // Start the discovery manager if needed
        if (!this._discoveryManager || !this._isStarted) {
            await this._discoveryManager.start(this._options.announcePort);
            this._isStarted = true;
        }
        // Clear active peers list
        this._activePeers.clear();
        // Establish connections to initial peers
        await this._connectToPeers(peers);
        // Add the initial peers to our active set
        peers.forEach(peer => this._activePeers.add(peer));
        // Determine file size by getting metadata from a peer
        // Use fileHash for accessing the content on peers
        const fileSizeAndMetadata = await this._getFileMetadata(peers, fileHash);
        const { totalChunks, totalBytes } = fileSizeAndMetadata;
        debug(`File has ${totalChunks} chunks, total size: ${totalBytes} bytes`);
        // Initialize piece rarity tracking using fileHash
        await this._initializePieceRarity(peers, fileHash, totalChunks);
        // Set initial concurrency based on file size
        this._adjustConcurrencyForFileSize(totalBytes);
        // Setup temporary directory for chunks
        const tempDir = path.join(path.dirname(savePath), `.${path.basename(savePath)}.parts`);
        await fs.ensureDir(tempDir);
        try {
            // Set up download tracker
            const chunksToDownload = new Array(totalChunks).fill(0).map((_, idx) => idx);
            const completedChunks = new Set();
            const failedAttempts = new Map();
            const inProgressChunks = new Set();
            // Track peer stats with performance metrics
            const peerStats = {};
            for (const peerId of peers) {
                peerStats[peerId] = {
                    bytesDownloaded: 0,
                    chunksDownloaded: 0,
                    connectionType: '',
                    downloadSpeed: 0,
                    lastChunkTime: null,
                    lastBytesDownloaded: 0,
                    consecutiveFailures: 0,
                    active: true
                };
            }
            // Set up progress tracking
            let receivedBytes = 0;
            let lastProgressUpdate = Date.now();
            let lastProgressBytes = 0;
            // Define properly typed callback functions
            const progressCallback = onProgress ?
                (receivedBytes) => onProgress(receivedBytes, totalBytes) :
                undefined;
            const peerStatusCallback = onPeerStatus ?
                (peerId, status, bytesFromPeer) => onPeerStatus(peerId, status, bytesFromPeer) :
                undefined;
            // Start continuous peer discovery if enabled
            if (this._isContinuousDiscoveryEnabled) {
                this._startContinuousDiscovery(fileHash, peerStats);
            }
            // Setup interval for bandwidth checks and peer performance evaluation
            const bandwidthCheckerId = setInterval(() => {
                this._evaluatePeerPerformance(peerStats, totalBytes);
            }, this.bandwidthCheckInterval);
            // Download chunks in parallel with adaptive concurrency
            while (chunksToDownload.length > 0 || inProgressChunks.size > 0) {
                // Adjust concurrency based on current network conditions
                this._adjustConcurrencyBasedOnBandwidth(receivedBytes, lastProgressBytes, Date.now() - lastProgressUpdate);
                lastProgressUpdate = Date.now();
                lastProgressBytes = receivedBytes;
                // Check if we should enter endgame mode
                this._checkAndEnableEndgameMode(completedChunks, inProgressChunks, totalChunks, fileHash, tempDir, peerStats);
                // If active downloads are less than concurrency and we have chunks to download, start more
                while (inProgressChunks.size < this.concurrency && chunksToDownload.length > 0) {
                    let chunkIndex;
                    // Use rarest-first if not in endgame mode and we have rarity data
                    if (!this._isInEndgameMode) {
                        const rarestPiece = this._selectNextPieceRarestFirst(completedChunks);
                        if (rarestPiece !== null) {
                            // Find and remove from chunksToDownload
                            const index = chunksToDownload.findIndex(idx => idx === rarestPiece);
                            if (index !== -1) {
                                chunksToDownload.splice(index, 1);
                                chunkIndex = rarestPiece;
                            }
                            else {
                                // If not in chunksToDownload, use the next one
                                chunkIndex = chunksToDownload.shift();
                            }
                        }
                        else {
                            // Fall back to sequential if no rarity data available
                            chunkIndex = chunksToDownload.shift();
                        }
                    }
                    else {
                        // In endgame mode, just take the next one
                        chunkIndex = chunksToDownload.shift();
                    }
                    inProgressChunks.add(chunkIndex);
                    // Select the best peer for this chunk
                    const selectedPeer = this._selectBestPeer(peerStats);
                    // Start download without awaiting to allow parallelism
                    this._downloadChunkFromPeer(selectedPeer, fileHash, chunkIndex, peerStats, tempDir)
                        .then(({ bytes }) => {
                        // Update progress
                        receivedBytes += bytes;
                        if (progressCallback) {
                            progressCallback(receivedBytes);
                        }
                        completedChunks.add(chunkIndex);
                        inProgressChunks.delete(chunkIndex);
                        // Reset consecutive failures on success
                        peerStats[selectedPeer].consecutiveFailures = 0;
                        // Update peer status if callback provided
                        if (peerStatusCallback) {
                            peerStatusCallback(selectedPeer, 'chunk_downloaded', peerStats[selectedPeer].bytesDownloaded);
                        }
                    })
                        .catch(error => {
                        debug(`Error downloading chunk ${chunkIndex} from peer ${selectedPeer}: ${error.message}`);
                        // Increment consecutive failures
                        peerStats[selectedPeer].consecutiveFailures += 1;
                        // Mark peer as inactive if too many consecutive failures
                        if (peerStats[selectedPeer].consecutiveFailures >= 3) {
                            debug(`Marking peer ${selectedPeer} as inactive due to multiple failures`);
                            peerStats[selectedPeer].active = false;
                            // Notify of peer status change
                            if (peerStatusCallback) {
                                peerStatusCallback(selectedPeer, 'inactive', peerStats[selectedPeer].bytesDownloaded);
                            }
                        }
                        // Put back in the queue if failed
                        const attempts = (failedAttempts.get(chunkIndex) || 0) + 1;
                        failedAttempts.set(chunkIndex, attempts);
                        // If too many attempts, give up on this chunk
                        if (attempts >= peers.length * 2) {
                            debug(`Failed to download chunk ${chunkIndex} after multiple attempts`);
                        }
                        else {
                            chunksToDownload.push(chunkIndex);
                        }
                        inProgressChunks.delete(chunkIndex);
                    });
                }
                // Small delay to prevent CPU spinning
                if (inProgressChunks.size > 0) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            // Clear the bandwidth checker interval
            clearInterval(bandwidthCheckerId);
            // Verify all chunks were downloaded
            if (completedChunks.size !== totalChunks) {
                throw new Error(`Not all chunks were downloaded. Expected ${totalChunks}, got ${completedChunks.size}`);
            }
            // Finalize download by combining chunks and verifying integrity using fileHash
            debug(`All chunks downloaded. Combining into final file: ${savePath}`);
            const verificationSuccess = await this._combineChunksAndVerify(tempDir, totalChunks, savePath, fileHash);
            if (!verificationSuccess) {
                throw new Error('File integrity verification failed: hash mismatch');
            }
            // Remove temp directory after successful combination
            await fs.remove(tempDir);
            const endTime = Date.now();
            const totalTime = (endTime - this.downloadStartTime) / 1000;
            debug(`Download completed in ${totalTime.toFixed(2)} seconds`);
            const averageSpeed = totalBytes / (totalTime / 1000); // bytes per second
            debug(`Average download speed: ${(averageSpeed / (1024 * 1024)).toFixed(2)} MB/s`);
            // Return download result with performance metrics
            return {
                path: savePath,
                peerStats,
                averageSpeed,
                totalTime,
                connectionTypes: this.connectionTypes
            };
        }
        catch (error) {
            debug(`Error during multi-peer download: ${error.message}`);
            // Clean up temp directory on error, but leave partial chunks
            // for potential retry/resume later
            throw error;
        }
        finally {
            // Stop continuous discovery interval
            this._stopContinuousDiscovery();
            // Reset endgame flag for future downloads
            this._isInEndgameMode = false;
            this._pieceRarityMap.clear();
            // Close all peer connections
            this._closeAllConnections();
            // Clear the current info hash
            this._infoHash = null;
        }
    }
    /**
     * Connect to multiple peers
     *
     * @private
     * @param peers - Array of peer IDs
     */
    async _connectToPeers(peers) {
        debug(`Establishing connections to ${peers.length} peers`);
        // Connect to at least 3 peers or all peers if there are fewer than 3
        const connectCount = Math.min(peers.length, 3);
        const priorityPeers = this._getShuffledPeers(peers).slice(0, connectCount);
        // Connect to priority peers first using promise.all for parallel connections
        await Promise.all(priorityPeers.map(async (peerId) => {
            try {
                await this._connectToPeer(peerId);
                debug(`Connected to priority peer ${peerId}`);
            }
            catch (err) {
                debug(`Failed to connect to priority peer ${peerId}: ${err.message}`);
            }
        }));
        // Connect to remaining peers
        const remainingPeers = peers.filter(peerId => !priorityPeers.includes(peerId));
        if (remainingPeers.length > 0) {
            debug(`Connecting to ${remainingPeers.length} additional peers`);
            // Connect in parallel but don't wait for all to complete
            for (const peerId of remainingPeers) {
                this._connectToPeer(peerId).catch(err => {
                    debug(`Failed to connect to additional peer ${peerId}: ${err.message}`);
                });
            }
        }
    }
    /**
     * Connect to a single peer using NAT traversal
     *
     * @private
     * @param peerId - Peer ID to connect to
     */
    async _connectToPeer(peerId) {
        if (this.connections.has(peerId)) {
            return; // Already connected
        }
        try {
            // For now, assume connectionRegistry.getSuccessfulMethods exists and returns an array of CONNECTION_TYPE
            // We would need to implement this method in the actual ConnectionRegistry class
            const previousMethods = connection_registry_1.connectionRegistry.getSuccessfulMethods ?
                connection_registry_1.connectionRegistry.getSuccessfulMethods(peerId) : [];
            let natOptions = {
                localId: this.localId,
                remoteId: peerId,
                gun: this.gunInstance,
                localTCPPort: this.localTCPPort,
                localUDPPort: this.localUDPPort,
                timeout: this.peerTimeout,
                saveToRegistry: true,
                iceOptions: {
                    stunServers: this.stunServers,
                    turnServer: this.turnServer,
                    turnUsername: this.turnUsername,
                    turnPassword: this.turnPassword
                },
                turnOptions: {
                    turnServer: this.turnServer,
                    turnUsername: this.turnUsername,
                    turnPassword: this.turnPassword
                }
            };
            // If we have previously successful methods and the NATTraversalOptions interface supports it,
            // add them as an additional property (this would require extending the interface)
            if (previousMethods.length > 0) {
                debug(`Using previously successful connection methods for ${peerId}: ${previousMethods.join(', ')}`);
                // Note: This would need to be properly typed in the NATTraversalOptions interface
                natOptions.preferredMethods = previousMethods;
            }
            // Use NAT traversal manager to establish connection
            const traversalResult = await (0, nat_traversal_manager_1.connectWithNATTraversal)(natOptions);
            if (!traversalResult.success || !traversalResult.socket || !traversalResult.connectionType) {
                throw new Error(`Failed to connect to peer: ${traversalResult.error || 'Unknown error'}`);
            }
            // Create client with the established socket
            const client = new client_1.default({
                gunOptions: this.gunOptions,
                stunServers: this.stunServers,
                existingSocket: traversalResult.socket,
                connectionType: traversalResult.connectionType,
                remoteAddress: traversalResult.address,
                remotePort: traversalResult.port
            });
            // Store the connection
            this.connections.set(peerId, client);
            // Store the connection type used
            if (traversalResult.connectionType) {
                // Use type assertion to ensure it's treated as CONNECTION_TYPE
                this.connectionTypes[peerId] = traversalResult.connectionType;
            }
            debug(`Connected to peer ${peerId} using ${traversalResult.connectionType}`);
        }
        catch (err) {
            debug(`Failed to connect to peer ${peerId}: ${err.message}`);
            throw err;
        }
    }
    /**
     * Get the connection type used for a specific peer
     *
     * @param peerId - Peer ID
     * @returns The connection type or undefined if not connected
     */
    getConnectionType(peerId) {
        return this.connectionTypes[peerId];
    }
    /**
     * Close all peer connections
     *
     * @private
     */
    _closeAllConnections() {
        for (const [peerId, client] of this.connections.entries()) {
            try {
                // Check if client has a shutdown method, otherwise simulate
                if (typeof client.shutdown === 'function') {
                    client.shutdown();
                }
                debug(`Closed connection to peer ${peerId}`);
            }
            catch (err) {
                debug(`Error closing connection to peer ${peerId}: ${err.message}`);
            }
        }
        this.connections.clear();
    }
    /**
     * Get metadata about a file from any available peer
     * @private
     * @param peers - Array of peer IDs
     * @param fileHash - SHA-256 hash of the file (used for verification and content access)
     * @returns Promise with file size and chunks information
     */
    async _getFileMetadata(peers, fileHash) {
        // Try each peer until we get metadata
        for (const peerId of peers) {
            try {
                const client = this.connections.get(peerId);
                if (!client)
                    continue;
                // Check if client has getFileInfo method
                if (typeof client.getFileInfo === 'function') {
                    const fileInfo = await client.getFileInfo(fileHash);
                    return {
                        totalBytes: fileInfo.size,
                        totalChunks: Math.ceil(fileInfo.size / this.chunkSize)
                    };
                }
                else {
                    // Fallback for testing or if client method is not available
                    debug(`Using simulated file metadata for hash ${fileHash} with peer ${peerId}`);
                    return {
                        totalBytes: 1024 * 1024 * 10, // 10MB
                        totalChunks: Math.ceil((1024 * 1024 * 10) / this.chunkSize)
                    };
                }
            }
            catch (err) {
                debug(`Failed to get metadata from peer ${peerId}: ${err.message}`);
            }
        }
        throw new Error('Failed to get file metadata from any peer');
    }
    /**
     * Download a specific chunk from a specific peer
     *
     * @private
     * @param peerId - Peer ID to download from
     * @param sha256 - SHA-256 hash of the file
     * @param chunkIndex - Index of the chunk to download
     * @param peerStats - Record of peer statistics to update
     * @param tempDir - Directory to save chunks
     * @returns Promise with the chunk path, peer ID, and bytes downloaded
     */
    async _downloadChunkFromPeer(peerId, sha256, chunkIndex, peerStats, tempDir) {
        const startTime = Date.now();
        const chunkPath = path.join(tempDir, `chunk-${chunkIndex}`);
        try {
            const client = this.connections.get(peerId);
            if (!client) {
                throw new Error(`No connection to peer ${peerId}`);
            }
            // Check if client has downloadChunk method
            if (typeof client.downloadChunk === 'function') {
                // Get connection type from client if available
                if (typeof client.getConnectionType === 'function') {
                    peerStats[peerId].connectionType = await client.getConnectionType();
                }
                else {
                    peerStats[peerId].connectionType = 'unknown';
                }
                // Download the chunk using the client
                const chunkData = await client.downloadChunk(sha256, chunkIndex);
                // Write chunk to file
                await fs.writeFile(chunkPath, chunkData);
                const bytes = chunkData.length;
                const endTime = Date.now();
                // Update peer stats
                const downloadDuration = endTime - startTime;
                const speed = bytes / (downloadDuration / 1000); // bytes per second
                peerStats[peerId].bytesDownloaded += bytes;
                peerStats[peerId].chunksDownloaded += 1;
                peerStats[peerId].lastChunkTime = endTime;
                // Update download speed with exponential moving average
                if (peerStats[peerId].downloadSpeed === 0) {
                    peerStats[peerId].downloadSpeed = speed;
                }
                else {
                    peerStats[peerId].downloadSpeed = 0.7 * peerStats[peerId].downloadSpeed + 0.3 * speed;
                }
                debug(`Downloaded chunk ${chunkIndex} from peer ${peerId} at ${(speed / (1024 * 1024)).toFixed(2)} MB/s`);
                return {
                    chunkPath,
                    peerId,
                    bytes
                };
            }
            else {
                // Fallback for testing or if method is not available
                debug(`Using simulated chunk download for index ${chunkIndex} with peer ${peerId}`);
                // Simulate download time (50-500ms)
                const downloadTime = 50 + Math.random() * 450;
                await new Promise(resolve => setTimeout(resolve, downloadTime));
                // Generate random data to simulate the chunk
                // In a test environment, create reproducible chunk data based on chunk index
                const chunkData = Buffer.alloc(Math.min(this.chunkSize, 1024 * 1024 * 10 - chunkIndex * this.chunkSize)).fill(chunkIndex % 256);
                // Write chunk to file
                await fs.writeFile(chunkPath, chunkData);
                const bytes = chunkData.length;
                const endTime = Date.now();
                // Set a dummy connection type
                peerStats[peerId].connectionType = 'simulated';
                // Update peer stats
                const downloadDuration = endTime - startTime;
                const speed = bytes / (downloadDuration / 1000); // bytes per second
                peerStats[peerId].bytesDownloaded += bytes;
                peerStats[peerId].chunksDownloaded += 1;
                peerStats[peerId].lastChunkTime = endTime;
                // Update download speed with exponential moving average
                if (peerStats[peerId].downloadSpeed === 0) {
                    peerStats[peerId].downloadSpeed = speed;
                }
                else {
                    peerStats[peerId].downloadSpeed = 0.7 * peerStats[peerId].downloadSpeed +
                        0.3 * speed;
                }
                debug(`Simulated download of chunk ${chunkIndex} from peer ${peerId} at ${(speed / (1024 * 1024)).toFixed(2)} MB/s`);
                return {
                    chunkPath,
                    peerId,
                    bytes
                };
            }
        }
        catch (error) {
            debug(`Error downloading chunk ${chunkIndex} from peer ${peerId}: ${error.message}`);
            throw error;
        }
    }
    /**
     * Select the best peer to download from based on performance
     *
     * @private
     * @param peerStats - Record of peer statistics
     * @returns Peer ID of the selected peer
     */
    _selectBestPeer(peerStats) {
        // Get all active peers
        const activePeers = Object.entries(peerStats)
            .filter(([_, stats]) => stats.active)
            .map(([peerId, stats]) => ({
            peerId,
            stats
        }));
        if (activePeers.length === 0) {
            // If no active peers, reactivate all peers and try again
            for (const peerId in peerStats) {
                peerStats[peerId].active = true;
                peerStats[peerId].consecutiveFailures = 0;
            }
            return this._selectBestPeer(peerStats);
        }
        // Sort peers by download speed (fastest first)
        activePeers.sort((a, b) => b.stats.downloadSpeed - a.stats.downloadSpeed);
        // Select the fastest peer most of the time, but occasionally use others for diversity
        const randomValue = Math.random();
        if (randomValue < 0.7 && activePeers[0].stats.downloadSpeed > 0) {
            // 70% of the time, use the fastest peer
            return activePeers[0].peerId;
        }
        else {
            // 30% of the time, randomly select from top half of peers
            const topHalfCount = Math.max(1, Math.ceil(activePeers.length / 2));
            const randomIndex = Math.floor(Math.random() * topHalfCount);
            return activePeers[randomIndex].peerId;
        }
    }
    /**
     * Evaluate peer performance and mark slow peers as inactive
     *
     * @private
     * @param peerStats - Record of peer statistics
     * @param totalBytes - Total file size in bytes
     */
    _evaluatePeerPerformance(peerStats, totalBytes) {
        // Calculate average speed across all active peers
        const activePeers = Object.entries(peerStats).filter(([_, stats]) => stats.active);
        if (activePeers.length === 0)
            return;
        const totalSpeed = activePeers.reduce((sum, [_, stats]) => sum + stats.downloadSpeed, 0);
        const averageSpeed = totalSpeed / activePeers.length;
        debug(`Average peer speed: ${(averageSpeed / (1024 * 1024)).toFixed(2)} MB/s`);
        // Identify slow peers
        for (const [peerId, stats] of activePeers) {
            // Skip peers we haven't downloaded from yet
            if (stats.downloadSpeed === 0)
                continue;
            // If the peer is significantly slower than average, mark it as inactive
            const speedRatio = stats.downloadSpeed / averageSpeed;
            if (speedRatio < this.slowPeerThreshold) {
                debug(`Marking peer ${peerId} as inactive due to slow speed: ${(stats.downloadSpeed / (1024 * 1024)).toFixed(2)} MB/s`);
                stats.active = false;
            }
        }
        // If we have too few active peers, reactivate the fastest inactive peers
        const minActivePeers = Math.min(3, Object.keys(peerStats).length);
        if (activePeers.length < minActivePeers) {
            // Get all inactive peers
            const inactivePeers = Object.entries(peerStats)
                .filter(([_, stats]) => !stats.active)
                .map(([peerId, stats]) => ({
                peerId,
                stats
            }))
                .sort((a, b) => b.stats.downloadSpeed - a.stats.downloadSpeed);
            // Reactivate the fastest inactive peers
            const peersToReactivate = inactivePeers.slice(0, minActivePeers - activePeers.length);
            for (const { peerId, stats } of peersToReactivate) {
                debug(`Reactivating peer ${peerId} with speed ${(stats.downloadSpeed / (1024 * 1024)).toFixed(2)} MB/s`);
                stats.active = true;
                stats.consecutiveFailures = 0;
            }
        }
    }
    /**
     * Adjust concurrency level based on file size
     *
     * @private
     * @param totalBytes - Total file size in bytes
     */
    _adjustConcurrencyForFileSize(totalBytes) {
        // Base concurrency on file size, but stay within defined limits
        // Small files (<1MB): min concurrency
        // Medium files (1-100MB): scaled concurrency
        // Large files (>100MB): max concurrency
        const MB = 1024 * 1024;
        const smallFileSizeThreshold = 1 * MB; // 1MB
        const largeFileSizeThreshold = 100 * MB; // 100MB
        if (totalBytes < smallFileSizeThreshold) {
            this.concurrency = this.minConcurrency;
        }
        else if (totalBytes > largeFileSizeThreshold) {
            this.concurrency = this.maxConcurrency;
        }
        else {
            // Scale linearly between min and max based on file size
            const sizeRatio = (totalBytes - smallFileSizeThreshold) / (largeFileSizeThreshold - smallFileSizeThreshold);
            const concurrencyRange = this.maxConcurrency - this.minConcurrency;
            this.concurrency = Math.round(this.minConcurrency + (sizeRatio * concurrencyRange));
        }
        debug(`Adjusted concurrency to ${this.concurrency} based on file size of ${(totalBytes / MB).toFixed(2)} MB`);
    }
    /**
     * Adjust concurrency level based on current bandwidth
     *
     * @private
     * @param currentBytes - Total bytes downloaded so far
     * @param previousBytes - Bytes downloaded as of last check
     * @param timeInterval - Time elapsed since last check in ms
     */
    _adjustConcurrencyBasedOnBandwidth(currentBytes, previousBytes, timeInterval) {
        if (timeInterval === 0)
            return;
        const bytesDelta = currentBytes - previousBytes;
        const currentSpeed = bytesDelta / (timeInterval / 1000); // bytes per second
        if (currentSpeed === 0)
            return;
        // Adaptive strategy:
        // 1. If speed is increasing or steady, incrementally increase concurrency
        // 2. If speed is decreasing, reduce concurrency
        const MB = 1024 * 1024;
        const speedMBps = currentSpeed / MB;
        debug(`Current download speed: ${speedMBps.toFixed(2)} MB/s with concurrency ${this.concurrency}`);
        // Keep track of last few speed measurements to detect trend
        this._speedHistory.push(currentSpeed);
        // Keep only last 3 measurements
        if (this._speedHistory.length > 3) {
            this._speedHistory.shift();
        }
        // Need at least 2 measurements to detect trend
        if (this._speedHistory.length < 2)
            return;
        // Calculate if speed is increasing, decreasing, or steady
        const previousSpeed = this._speedHistory[this._speedHistory.length - 2];
        const speedRatio = currentSpeed / previousSpeed;
        if (speedRatio > 1.1) {
            // Speed increased by more than 10% - increase concurrency
            const newConcurrency = Math.min(this.concurrency + 1, this.maxConcurrency);
            if (newConcurrency !== this.concurrency) {
                this.concurrency = newConcurrency;
                debug(`Increased concurrency to ${this.concurrency} due to improving download speed`);
            }
        }
        else if (speedRatio < 0.9) {
            // Speed decreased by more than 10% - decrease concurrency
            const newConcurrency = Math.max(this.concurrency - 1, this.minConcurrency);
            if (newConcurrency !== this.concurrency) {
                this.concurrency = newConcurrency;
                debug(`Decreased concurrency to ${this.concurrency} due to degrading download speed`);
            }
        }
        // Otherwise, maintain current concurrency level
    }
    /**
     * Download a specific chunk from any available peer
     *
     * @private
     * @param peers - Array of peer IDs
     * @param sha256 - SHA-256 hash of the file
     * @param chunkIndex - Index of the chunk to download
     * @param peerStats - Record of peer statistics to update
     * @returns Promise with the chunk path, peer ID, and bytes downloaded
     */
    async _downloadChunkFromAnyPeer(peers, sha256, chunkIndex, peerStats) {
        // Select the best peer for this chunk
        const selectedPeer = this._selectBestPeer(peerStats);
        // Download from the selected peer
        return this._downloadChunkFromPeer(selectedPeer, sha256, chunkIndex, peerStats, '/tmp' // Temporary directory, would be replaced in actual implementation
        );
    }
    /**
     * Combine downloaded chunks into the final file and verify integrity
     * @param tempDir - Directory containing chunk files
     * @param totalChunks - Total number of chunks
     * @param savePath - Final file path
     * @param fileHash - Expected file hash
     * @returns True if verification succeeds
     */
    async _combineChunksAndVerify(tempDir, totalChunks, savePath, fileHash) {
        debug(`Combining ${totalChunks} chunks into final file: ${savePath}`);
        // Create output file
        const outputFile = await fs.open(savePath, 'w');
        // Create hash calculator for integrity verification
        const hashCalculator = crypto.createHash('sha256');
        try {
            // Combine chunks in order
            for (let i = 0; i < totalChunks; i++) {
                const chunkPath = path.join(tempDir, `chunk_${i}`);
                const chunkData = await fs.readFile(chunkPath);
                // Write chunk to final file
                await fs.write(outputFile, chunkData, 0, chunkData.length, i * this.chunkSize);
                // Update hash calculation
                hashCalculator.update(chunkData);
                // Remove chunk file after writing to save space
                await fs.unlink(chunkPath);
            }
            // Get final calculated hash
            const calculatedHash = hashCalculator.digest('hex');
            // Verify file integrity
            if (calculatedHash !== fileHash) {
                debug(`File integrity verification failed. Expected: ${fileHash}, got: ${calculatedHash}`);
                return false;
            }
            debug(`File integrity verified successfully: ${calculatedHash}`);
            return true;
        }
        finally {
            await fs.close(outputFile);
        }
    }
    /**
     * Get a shuffled copy of the peers array for load balancing
     *
     * @private
     * @param peers - Array of peer IDs
     * @returns Shuffled copy of the peers array
     */
    _getShuffledPeers(peers) {
        // Fisher-Yates shuffle algorithm
        const shuffled = [...peers];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
    /**
     * Initialize the piece rarity map by querying peers for which pieces they have
     * @private
     * @param peers - Array of peer IDs
     * @param fileHash - SHA-256 hash of the file (used for content access)
     * @param totalPieces - Total number of pieces in the file
     */
    async _initializePieceRarity(peers, fileHash, totalPieces) {
        debug(`Initializing piece rarity tracking for ${totalPieces} pieces`);
        // Initialize all pieces with 0 peers having them
        for (let i = 0; i < totalPieces; i++) {
            this._pieceRarityMap.set(i, 0);
        }
        // Query all peers for their piece availability and update rarity map
        const availabilityPromises = peers.map(async (peerId) => {
            try {
                const client = this.connections.get(peerId);
                if (!client)
                    return;
                // Check if client has getAvailablePieces method
                if (typeof client.getAvailablePieces === 'function') {
                    const pieces = await client.getAvailablePieces(fileHash);
                    if (Array.isArray(pieces)) {
                        pieces.forEach(pieceIndex => {
                            const currentCount = this._pieceRarityMap.get(pieceIndex) || 0;
                            this._pieceRarityMap.set(pieceIndex, currentCount + 1);
                        });
                    }
                }
                else {
                    // If not available, assume peer has all pieces
                    // This ensures backward compatibility
                    for (let i = 0; i < totalPieces; i++) {
                        const currentCount = this._pieceRarityMap.get(i) || 0;
                        this._pieceRarityMap.set(i, currentCount + 1);
                    }
                }
            }
            catch (err) {
                debug(`Error getting piece availability from peer ${peerId}: ${err.message}`);
            }
        });
        // Wait for all queries to complete
        await Promise.all(availabilityPromises);
        debug(`Piece rarity map initialized with ${this._pieceRarityMap.size} pieces`);
    }
    /**
     * Select the next piece to download using rarest-first algorithm
     * @private
     * @param completedChunks - Set of already completed chunks
     * @returns The index of the rarest piece or null if no pieces available
     */
    _selectNextPieceRarestFirst(completedChunks) {
        // Find the rarest pieces that we still need to download
        const neededPieces = Array.from(this._pieceRarityMap.entries())
            .filter(([pieceIndex]) => !completedChunks.has(pieceIndex))
            .sort(([, rarityA], [, rarityB]) => rarityA - rarityB);
        return neededPieces.length > 0 ? neededPieces[0][0] : null;
    }
    /**
     * Check if we should enter endgame mode and handle accordingly
     * @private
     * @param completedChunks - Set of already completed chunks
     * @param inProgressChunks - Set of chunks currently being downloaded
     * @param totalPieces - Total number of pieces in the file
     * @param fileHash - Hash of the file
     * @param tempDir - Directory for temporary files
     * @param peerStats - Statistics for each peer
     */
    _checkAndEnableEndgameMode(completedChunks, inProgressChunks, totalPieces, fileHash, tempDir, peerStats) {
        if (this._isInEndgameMode)
            return;
        const completionRatio = completedChunks.size / totalPieces;
        if (completionRatio >= this._endgameModeThreshold) {
            debug(`Entering endgame mode at ${(completionRatio * 100).toFixed(2)}% completion`);
            this._isInEndgameMode = true;
            // Request all remaining pieces from multiple peers
            const remainingPieces = Array.from(Array(totalPieces).keys())
                .filter(pieceIndex => !completedChunks.has(pieceIndex) && !inProgressChunks.has(pieceIndex));
            if (remainingPieces.length === 0) {
                debug('No remaining pieces to request in endgame mode');
                return;
            }
            debug(`Requesting ${remainingPieces.length} remaining pieces from multiple peers in endgame mode`);
            // Get a list of active peers
            const activePeers = Object.entries(peerStats)
                .filter(([_, stats]) => stats.active)
                .map(([peerId]) => peerId);
            if (activePeers.length === 0) {
                debug('No active peers available for endgame mode');
                return;
            }
            // Request each remaining piece from multiple peers
            remainingPieces.forEach(pieceIndex => {
                this._requestPieceFromMultiplePeers(pieceIndex, activePeers, fileHash, tempDir, peerStats);
            });
        }
    }
    /**
     * Request a piece from multiple peers for endgame mode
     * @private
     * @param pieceIndex - Index of the piece to request
     * @param peers - Array of peer IDs
     * @param fileHash - Hash of the file
     * @param tempDir - Directory for temporary files
     * @param peerStats - Statistics for each peer
     */
    _requestPieceFromMultiplePeers(pieceIndex, peers, fileHash, tempDir, peerStats) {
        // Use a subset of peers to avoid overloading
        const maxPeersPerPiece = Math.min(3, peers.length);
        const selectedPeers = this._selectRandomPeers(peers, maxPeersPerPiece);
        debug(`Requesting piece ${pieceIndex} from ${selectedPeers.length} peers in endgame mode`);
        // Create a way to track which peers have responded
        const respondedPeers = new Set();
        selectedPeers.forEach(peerId => {
            this._downloadChunkFromPeer(peerId, fileHash, pieceIndex, peerStats, tempDir)
                .then(({ bytes }) => {
                debug(`Got piece ${pieceIndex} from peer ${peerId} in endgame mode`);
                respondedPeers.add(peerId);
                // Cancel requests to other peers if we've already got the piece
                if (respondedPeers.size === 1) {
                    selectedPeers.forEach(otherPeerId => {
                        if (otherPeerId !== peerId) {
                            const client = this.connections.get(otherPeerId);
                            if (client && typeof client.cancelRequest === 'function') {
                                client.cancelRequest(fileHash, pieceIndex)
                                    .catch((err) => debug(`Error canceling request to peer ${otherPeerId}: ${err.message}`));
                            }
                        }
                    });
                }
            })
                .catch((err) => {
                debug(`Failed to get piece ${pieceIndex} from peer ${peerId} in endgame mode: ${err.message}`);
            });
        });
    }
    /**
     * Select a random subset of peers
     * @private
     * @param peers - Array of peer IDs
     * @param count - Number of peers to select
     * @returns Array of selected peer IDs
     */
    _selectRandomPeers(peers, count) {
        if (peers.length <= count)
            return [...peers];
        const shuffled = [...peers];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled.slice(0, count);
    }
    /**
     * Start continuous peer discovery for the current download
     * @private
     * @param fileHash - Hash of the file being downloaded
     * @param peerStats - Current peer statistics
     */
    _startContinuousDiscovery(fileHash, peerStats) {
        // Stop any existing discovery interval
        this._stopContinuousDiscovery();
        debug(`Starting continuous peer discovery for ${fileHash.substring(0, 6)}...`);
        // Start an interval to periodically check for new peers
        this._continuousDiscoveryInterval = setInterval(async () => {
            try {
                // Get active peer count
                const activePeerCount = Object.values(peerStats).filter(p => p.active).length;
                // Check if we need more peers
                if (activePeerCount >= this._maxPeersToConnect) {
                    debug(`Already have ${activePeerCount} active peers, skipping discovery`);
                    return;
                }
                // Find peers for this file hash
                const newPeers = await this._discoveryManager.findPeers(fileHash);
                if (newPeers.length === 0) {
                    debug(`No new peers found for ${fileHash.substring(0, 6)}...`);
                    return;
                }
                debug(`Found ${newPeers.length} potential new peers for ${fileHash.substring(0, 6)}...`);
                // Convert discovered peers to peer IDs
                const peersToAdd = [];
                for (const peer of newPeers) {
                    const peerId = peer.id || `${peer.address}:${peer.port}`;
                    // Skip peers we already know about
                    if (this._activePeers.has(peerId)) {
                        continue;
                    }
                    peersToAdd.push(peerId);
                    this._activePeers.add(peerId);
                    // Add this peer to our stats tracking
                    peerStats[peerId] = {
                        bytesDownloaded: 0,
                        chunksDownloaded: 0,
                        connectionType: '',
                        downloadSpeed: 0,
                        lastChunkTime: null,
                        lastBytesDownloaded: 0,
                        consecutiveFailures: 0,
                        active: true
                    };
                    // Only add a limited number of new peers at once
                    if (peersToAdd.length >= this._maxPeersToConnect - activePeerCount) {
                        break;
                    }
                }
                if (peersToAdd.length > 0) {
                    debug(`Adding ${peersToAdd.length} new peers to active download`);
                    // Connect to these new peers - don't await since we want this to run in the background
                    this._connectToPeers(peersToAdd).catch(err => {
                        debug(`Error connecting to new peers: ${err.message}`);
                    });
                }
            }
            catch (err) {
                debug(`Error in continuous peer discovery: ${err.message}`);
            }
        }, 30000); // Check for new peers every 30 seconds
    }
    /**
     * Stop continuous peer discovery
     * @private
     */
    _stopContinuousDiscovery() {
        if (this._continuousDiscoveryInterval) {
            clearInterval(this._continuousDiscoveryInterval);
            this._continuousDiscoveryInterval = null;
            debug('Stopped continuous peer discovery');
        }
    }
    /**
     * Add a mapping between content ID and SHA-256 hash
     * @param contentId - Content identifier
     * @param fileHash - SHA-256 hash for verification
     */
    addContentMapping(contentId, fileHash) {
        this._contentHashMap.set(contentId, fileHash);
        debug(`Added content mapping: ${contentId} -> ${fileHash}`);
        // If we have a discovery manager, also add the mapping there
        if (this._discoveryManager) {
            this._discoveryManager.addContentMapping(contentId, fileHash);
        }
    }
    /**
     * Get SHA-256 hash for a content ID
     * @param contentId - Content identifier
     * @returns SHA-256 hash or undefined if not found
     */
    getHashForContent(contentId) {
        // First check our local map
        const localHash = this._contentHashMap.get(contentId);
        if (localHash) {
            return localHash;
        }
        // If not found locally, check the discovery manager if available
        if (this._discoveryManager) {
            return this._discoveryManager.getHashForContent(contentId);
        }
        return undefined;
    }
    /**
     * Get content ID for a SHA-256 hash (reverse lookup)
     * @param fileHash - SHA-256 hash
     * @returns Content ID or undefined if not found
     */
    getContentForHash(fileHash) {
        // Check our local map first
        for (const [contentId, hash] of this._contentHashMap.entries()) {
            if (hash === fileHash) {
                return contentId;
            }
        }
        // If not found locally, check the discovery manager if available
        if (this._discoveryManager) {
            return this._discoveryManager.getContentForHash(fileHash);
        }
        return undefined;
    }
    /**
     * Start the network manager
     */
    async start() {
        if (this.started) {
            debug('Network manager already started');
            return;
        }
        debug('Starting network manager');
        try {
            // Initialize Gun.js if options are provided
            if (this.gunOptions) {
                await this._initializeGun();
            }
            // Create file host
            this.host = new host_1.FileHost({
                hostFileCallback: this._hostFileCallback.bind(this),
                chunkSize: this.chunkSize,
                stunServers: this.stunServers,
                gunOptions: this.gunOptions,
                nodeType: constants_1.NODE_TYPE.STANDARD // Default to standard node
            });
            await this.host.start();
            // Get the host's listening ports
            const hostPorts = this.host.getListeningPorts();
            // Initialize peer discovery
            this.peerDiscovery = new peer_discovery_manager_1.PeerDiscoveryManager({
                enableDHT: true,
                enablePEX: true,
                enableLocal: true,
                enableGun: !!this.gun, // Enable Gun discovery if Gun is initialized
                enableIPv6: false, // Default to IPv4 for backward compatibility
                announcePort: hostPorts.tcp || 0,
                enablePersistence: true,
                persistenceDir: './.dig-nat-tools',
                gun: this.gun, // Pass Gun instance if available
                nodeId: this.nodeId
            });
            // Start peer discovery without parameters
            await this.peerDiscovery.start();
            // Listen for peer discovery events
            this.peerDiscovery.on('peer:discovered', (peer) => {
                debug(`Discovered peer: ${peer.address}:${peer.port} (${peer.source})`);
                this.emit('peer:discovered', peer);
            });
            this.started = true;
            debug('Network manager started');
        }
        catch (err) {
            debug(`Failed to start network manager: ${err.message}`);
            await this.stop();
            throw err;
        }
    }
    /**
     * Stop the network manager
     */
    async stop() {
        if (!this.started) {
            return;
        }
        debug('Stopping network manager');
        // Close all file clients
        for (const client of this.fileClients.values()) {
            try {
                // Try different methods that might exist on the client
                // to properly clean up resources
                if (typeof client.stopDownloads === 'function') {
                    await client.stopDownloads();
                }
            }
            catch (err) {
                debug(`Error stopping client: ${err.message}`);
            }
        }
        this.fileClients.clear();
        // Stop peer discovery
        if (this.peerDiscovery) {
            this.peerDiscovery.stop();
            this.peerDiscovery = null;
        }
        // Stop host
        if (this.host) {
            await this.host.stop();
            this.host = null;
        }
        // Gun.js doesn't need to be explicitly stopped
        this.started = false;
        debug('Network manager stopped');
    }
    /**
     * Host file callback that maps content ID to file chunks
     * @param contentId - Content ID or file hash
     * @param startChunk - Starting chunk number
     * @param chunkSize - Size of each chunk
     * @param sha256 - Optional SHA-256 hash for verification
     * @returns Promise resolving to array of chunks or null if not found
     * @private
     */
    async _hostFileCallback(contentId, startChunk, chunkSize, sha256) {
        // First check if contentId is a SHA-256 hash directly
        if (this.host?.hasFile(contentId)) {
            // FileHost already has this file hash registered
            return null; // Let FileHost handle it directly
        }
        // If not a direct hash, lookup the hash by content ID
        const fileHash = this.peerDiscovery?.getHashForContent(contentId);
        if (!fileHash) {
            debug(`No file hash found for content ID: ${contentId}`);
            return null;
        }
        // Check if the optional SHA-256 hash matches our mapping
        if (sha256 && sha256 !== fileHash) {
            debug(`SHA-256 verification failed for content ID: ${contentId}`);
            return null;
        }
        debug(`Mapped content ID ${contentId} to file hash ${fileHash}`);
        // Let FileHost handle the request with the file hash
        return null; // FileHost will handle it with the file hash
    }
    /**
     * Generate a node ID
     * @private
     */
    _generateNodeId() {
        const randomBytes = new Uint8Array(16);
        for (let i = 0; i < 16; i++) {
            randomBytes[i] = Math.floor(Math.random() * 256);
        }
        return Array.from(randomBytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }
    /**
     * Initialize Gun.js
     * @private
     */
    async _initializeGun() {
        if (this.gun) {
            return; // Already initialized
        }
        try {
            // Load Gun.js
            const GunConstructor = await loadGun();
            // Configure Gun.js
            const gunOptions = this.gunOptions || {};
            // Set up Gun with options
            this.gun = new GunConstructor({
                peers: gunOptions.peers || [],
                localStorage: false, // Don't use localStorage in Node.js
                file: gunOptions.file || './.gun',
                ...gunOptions
            });
            debug('Gun.js initialized with peers:', gunOptions.peers || []);
        }
        catch (err) {
            debug(`Failed to initialize Gun.js: ${err.message}`);
            throw err;
        }
    }
}
exports.default = NetworkManager;
//# sourceMappingURL=network-manager.js.map
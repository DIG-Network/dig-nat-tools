"use strict";
/**
 * NetworkManager - Handles multi-peer file downloads
 *
 * Coordinates downloading files from multiple peers simultaneously,
 * with automatic peer selection and load balancing.
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
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const debug_1 = __importDefault(require("debug"));
const gun_1 = __importDefault(require("gun")); // Import Gun properly
const client_1 = __importDefault(require("./client"));
const nat_traversal_manager_1 = require("./utils/nat-traversal-manager");
const connection_registry_1 = require("./utils/connection-registry");
const utils_1 = require("./utils");
const debug = (0, debug_1.default)('dig-nat-tools:network-manager');
class NetworkManager {
    /**
     * Create a new NetworkManager instance
     * @param config - Configuration options
     */
    constructor(config = {}) {
        this._speedHistory = []; // Array to store recent download speeds
        // New properties for connection tracking
        this.connectionTypes = {};
        this.chunkSize = config.chunkSize || 64 * 1024; // 64KB default
        this.concurrency = config.concurrency || 3; // Default concurrent downloads
        this.peerTimeout = config.peerTimeout || 30000; // 30 seconds
        this.gunOptions = config.gunOptions || {};
        this.stunServers = config.stunServers || ['stun:stun.l.google.com:19302'];
        // Initialize NAT traversal properties
        this.localId = config.localId || crypto.randomBytes(16).toString('hex');
        this.localTCPPort = config.localTCPPort || (0, utils_1.getRandomPort)();
        this.localUDPPort = config.localUDPPort || (0, utils_1.getRandomPort)();
        this.turnServer = config.turnServer;
        this.turnUsername = config.turnUsername;
        this.turnPassword = config.turnPassword;
        // Initialize Gun instance for signaling if not provided
        if (this.gunOptions.instance) {
            this.gunInstance = this.gunOptions.instance;
        }
        else {
            this.gunInstance = new gun_1.default(this.gunOptions);
        }
        // New adaptive download settings
        this.maxConcurrency = config.maxConcurrency || 10;
        this.minConcurrency = config.minConcurrency || 1;
        this.bandwidthCheckInterval = config.bandwidthCheckInterval || 5000; // 5 seconds
        this.slowPeerThreshold = config.slowPeerThreshold || 0.5; // 50% of average speed
        this.connections = new Map();
        this.downloadStartTime = 0;
    }
    /**
     * Download a file from multiple peers
     * @param peers - Array of peer identifiers
     * @param fileHash - SHA-256 hash of the file to download
     * @param options - Download options
     * @returns Promise that resolves to download result
     */
    async downloadFile(peers, fileHash, options) {
        if (!peers || peers.length === 0) {
            throw new Error('At least one peer is required');
        }
        if (!fileHash) {
            throw new Error('File hash is required');
        }
        if (!options.savePath) {
            throw new Error('Save path is required');
        }
        const { savePath, onProgress, onPeerStatus } = options;
        this.downloadStartTime = Date.now();
        debug(`Starting multi-peer download of file ${fileHash} from ${peers.length} peers`);
        // Establish connections to peers first
        await this._connectToPeers(peers);
        // Determine file size by getting metadata from a peer
        const fileSizeAndMetadata = await this._getFileMetadata(peers, fileHash);
        const { totalChunks, totalBytes } = fileSizeAndMetadata;
        debug(`File has ${totalChunks} chunks, total size: ${totalBytes} bytes`);
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
                // If active downloads are less than concurrency and we have chunks to download, start more
                while (inProgressChunks.size < this.concurrency && chunksToDownload.length > 0) {
                    const chunkIndex = chunksToDownload.shift();
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
            // Finalize download by combining chunks and verifying integrity
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
            // Close all peer connections
            this._closeAllConnections();
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
     * Get file metadata from any available peer
     *
     * @private
     * @param peers - Array of peer IDs
     * @param fileHash - SHA-256 hash of the file
     * @returns Promise with file metadata
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
}
exports.default = NetworkManager;
//# sourceMappingURL=network-manager.js.map
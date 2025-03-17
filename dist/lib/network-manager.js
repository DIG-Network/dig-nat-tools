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
const debug_1 = __importDefault(require("debug"));
const client_1 = __importDefault(require("./client"));
const debug = (0, debug_1.default)('dig-nat-tools:network-manager');
class NetworkManager {
    /**
     * Create a new network manager instance
     *
     * @param config - Manager configuration options
     */
    constructor(config = {}) {
        this.chunkSize = config.chunkSize || 65536; // 64KB default
        this.concurrency = config.concurrency || 2;
        this.peerTimeout = config.peerTimeout || 10000; // 10 seconds
        this.gunOptions = config.gunOptions || {};
        this.stunServers = config.stunServers || ['stun:stun.l.google.com:19302'];
        this.client = new client_1.default({
            gunOptions: this.gunOptions,
            chunkSize: this.chunkSize,
            stunServers: this.stunServers
        });
        this.activePeerConnections = new Map();
    }
    /**
     * Download a file from multiple peers
     * @param peers - Array of peer IDs to download from
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
        debug(`Starting multi-peer download of file ${fileHash} from ${peers.length} peers`);
        // Establish connections to peers first
        await this._connectToPeers(peers);
        // Determine file size by getting metadata from a peer
        const fileSizeAndMetadata = await this._getFileMetadata(peers, fileHash);
        const { totalChunks, totalBytes } = fileSizeAndMetadata;
        debug(`File has ${totalChunks} chunks, total size: ${totalBytes} bytes`);
        // Setup temporary directory for chunks
        const tempDir = path.join(path.dirname(savePath), `.${path.basename(savePath)}.parts`);
        await fs.ensureDir(tempDir);
        try {
            // Set up download tracker
            const chunksToDownload = new Array(totalChunks).fill(0).map((_, idx) => idx);
            const completedChunks = new Set();
            const failedAttempts = new Map();
            // Track peer stats
            const peerStats = {};
            for (const peerId of peers) {
                peerStats[peerId] = {
                    bytesDownloaded: 0,
                    chunksDownloaded: 0,
                    connectionType: ''
                };
            }
            // Set up progress tracking
            let receivedBytes = 0;
            // Define properly typed callback functions
            const progressCallback = onProgress ?
                (receivedBytes) => onProgress(receivedBytes, totalBytes) :
                undefined;
            const peerStatusCallback = onPeerStatus ?
                (peerId, status, bytesFromPeer) => onPeerStatus(peerId, status, bytesFromPeer) :
                undefined;
            // Download chunks in parallel with limited concurrency
            // This is a simplified implementation - in the real code, we would handle
            // concurrent downloads more effectively
            while (chunksToDownload.length > 0) {
                const currentBatch = chunksToDownload.splice(0, this.concurrency);
                if (currentBatch.length === 0)
                    break;
                // Download chunks in parallel
                const results = await Promise.allSettled(currentBatch.map(chunkIndex => this._downloadChunkFromAnyPeer(peers, fileHash, chunkIndex, peerStats)
                    .then(({ chunkPath, peerId, bytes }) => {
                    // Update progress
                    receivedBytes += bytes;
                    if (progressCallback) {
                        progressCallback(receivedBytes);
                    }
                    completedChunks.add(chunkIndex);
                    // Update peer status if callback provided
                    if (peerStatusCallback) {
                        peerStatusCallback(peerId, 'chunk_downloaded', peerStats[peerId].bytesDownloaded);
                    }
                    return chunkPath;
                })
                    .catch(error => {
                    debug(`Error downloading chunk ${chunkIndex}: ${error.message}`);
                    // Put back in the queue if failed
                    const attempts = (failedAttempts.get(chunkIndex) || 0) + 1;
                    failedAttempts.set(chunkIndex, attempts);
                    // If too many attempts, give up on this chunk
                    if (attempts >= peers.length * 2) {
                        throw new Error(`Failed to download chunk ${chunkIndex} after multiple attempts`);
                    }
                    chunksToDownload.push(chunkIndex);
                    throw error;
                })));
                // Check results
                for (const result of results) {
                    if (result.status === 'rejected') {
                        // Already handled in the catch block
                    }
                }
            }
            // Verify all chunks were downloaded
            if (completedChunks.size !== totalChunks) {
                throw new Error(`Not all chunks were downloaded. Expected ${totalChunks}, got ${completedChunks.size}`);
            }
            // Merge chunks into final file and verify hash
            await this._mergeChunksAndVerify(tempDir, savePath, totalChunks, fileHash);
            // Clean up temp files
            await fs.remove(tempDir);
            debug(`Successfully downloaded file ${fileHash} to ${savePath}`);
            // Return download result
            return {
                path: savePath,
                peerStats
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
        // Connect to priority peers first
        await Promise.all(priorityPeers.map(async (peerId) => {
            try {
                // In a full implementation, we would use the actual client connection method
                // For now, just create a stub connection
                this.activePeerConnections.set(peerId, { peerId });
                debug(`Established connection to peer ${peerId}`);
            }
            catch (error) {
                debug(`Failed to connect to peer ${peerId}: ${error.message}`);
            }
        }));
        // Ensure we have at least one connection
        if (this.activePeerConnections.size === 0 && peers.length > 0) {
            throw new Error('Failed to connect to any peers');
        }
    }
    /**
     * Close all active peer connections
     *
     * @private
     */
    _closeAllConnections() {
        for (const connection of this.activePeerConnections.values()) {
            // In a full implementation, we would close each connection properly
        }
        this.activePeerConnections.clear();
    }
    /**
     * Get metadata about a file from any available peer
     *
     * @private
     * @param peers - Array of peer IDs
     * @param sha256 - SHA-256 hash of the file
     * @returns File metadata including totalChunks and totalBytes
     */
    async _getFileMetadata(peers, sha256) {
        // This is a simplified implementation
        // In a real implementation, we would try each peer until we get metadata
        // Just return dummy data for this stub
        return {
            totalChunks: 10,
            totalBytes: 10 * this.chunkSize
        };
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
        // This is a simplified implementation
        // In a real implementation, we would try each peer until one succeeds
        // Use the first peer for this stub
        const peerId = peers[0];
        const bytes = this.chunkSize;
        // Update peer stats
        peerStats[peerId].bytesDownloaded += bytes;
        peerStats[peerId].chunksDownloaded += 1;
        // For a stub, just simulate a successful download
        // In a real implementation, we would download the actual chunk
        return {
            chunkPath: `/tmp/chunk-${chunkIndex}`,
            peerId,
            bytes
        };
    }
    /**
     * Merge downloaded chunks into a single file and verify integrity
     *
     * @private
     * @param tempDir - Directory containing the chunks
     * @param savePath - Path to save the final file
     * @param totalChunks - Total number of chunks to merge
     * @param expectedSha256 - Expected SHA-256 hash of the final file
     */
    async _mergeChunksAndVerify(tempDir, savePath, totalChunks, expectedSha256) {
        debug(`Merging ${totalChunks} chunks into ${savePath}`);
        // This is a simplified implementation
        // In a real implementation, we would merge the chunks and verify the hash
        // Just simulate success for this stub
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
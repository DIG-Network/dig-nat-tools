/**
 * NetworkManager - Handles multi-peer file downloads
 *
 * Coordinates downloading files from multiple peers simultaneously,
 * with automatic peer selection and load balancing.
 */
import { MultiDownloadOptions } from './types';
/**
 * Configuration for the NetworkManager
 */
interface NetworkManagerConfig {
    chunkSize?: number;
    concurrency?: number;
    peerTimeout?: number;
    gunOptions?: Record<string, any>;
    stunServers?: string[];
}
/**
 * Statistics for a peer's contribution to a download
 */
interface PeerStats {
    bytesDownloaded: number;
    chunksDownloaded: number;
    connectionType: string;
}
/**
 * Result of a download operation
 */
interface DownloadResult {
    path: string;
    peerStats: Record<string, PeerStats>;
}
declare class NetworkManager {
    private chunkSize;
    private concurrency;
    private peerTimeout;
    private gunOptions;
    private stunServers;
    private client;
    private activePeerConnections;
    /**
     * Create a new network manager instance
     *
     * @param config - Manager configuration options
     */
    constructor(config?: NetworkManagerConfig);
    /**
     * Download a file from multiple peers
     * @param peers - Array of peer IDs to download from
     * @param fileHash - SHA-256 hash of the file to download
     * @param options - Download options
     * @returns Promise that resolves to download result
     */
    downloadFile(peers: string[], fileHash: string, options: MultiDownloadOptions): Promise<DownloadResult>;
    /**
     * Connect to multiple peers
     *
     * @private
     * @param peers - Array of peer IDs
     */
    private _connectToPeers;
    /**
     * Close all active peer connections
     *
     * @private
     */
    private _closeAllConnections;
    /**
     * Get metadata about a file from any available peer
     *
     * @private
     * @param peers - Array of peer IDs
     * @param sha256 - SHA-256 hash of the file
     * @returns File metadata including totalChunks and totalBytes
     */
    private _getFileMetadata;
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
    private _downloadChunkFromAnyPeer;
    /**
     * Merge downloaded chunks into a single file and verify integrity
     *
     * @private
     * @param tempDir - Directory containing the chunks
     * @param savePath - Path to save the final file
     * @param totalChunks - Total number of chunks to merge
     * @param expectedSha256 - Expected SHA-256 hash of the final file
     */
    private _mergeChunksAndVerify;
    /**
     * Get a shuffled copy of the peers array for load balancing
     *
     * @private
     * @param peers - Array of peer IDs
     * @returns Shuffled copy of the peers array
     */
    private _getShuffledPeers;
}
export default NetworkManager;

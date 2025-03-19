/**
 * NetworkManager - Handles multi-peer file downloads
 *
 * Coordinates downloading files from multiple peers simultaneously,
 * with automatic peer selection and load balancing.
 */
import { MultiDownloadOptions } from './types';
import { CONNECTION_TYPE } from '../types/constants';
/**
 * Configuration for the NetworkManager
 */
interface NetworkManagerConfig {
    chunkSize?: number;
    concurrency?: number;
    peerTimeout?: number;
    gunOptions?: Record<string, any>;
    stunServers?: string[];
    localId?: string;
    localTCPPort?: number;
    localUDPPort?: number;
    turnServer?: string;
    turnUsername?: string;
    turnPassword?: string;
    maxConcurrency?: number;
    minConcurrency?: number;
    bandwidthCheckInterval?: number;
    slowPeerThreshold?: number;
}
/**
 * Statistics for a peer's contribution to a download
 */
interface PeerStats {
    bytesDownloaded: number;
    chunksDownloaded: number;
    connectionType: string;
    downloadSpeed: number;
    lastChunkTime: number | null;
    lastBytesDownloaded: number;
    consecutiveFailures: number;
    active: boolean;
}
/**
 * Result of a download operation
 */
interface DownloadResult {
    path: string;
    peerStats: Record<string, PeerStats>;
    averageSpeed: number;
    totalTime: number;
    connectionTypes: Record<string, CONNECTION_TYPE>;
}
declare class NetworkManager {
    private chunkSize;
    private concurrency;
    private peerTimeout;
    private gunOptions;
    private stunServers;
    private localId;
    private localTCPPort;
    private localUDPPort;
    private turnServer?;
    private turnUsername?;
    private turnPassword?;
    private gunInstance;
    private maxConcurrency;
    private minConcurrency;
    private bandwidthCheckInterval;
    private slowPeerThreshold;
    private connections;
    private downloadStartTime;
    private _speedHistory;
    private connectionTypes;
    /**
     * Create a new NetworkManager instance
     * @param config - Configuration options
     */
    constructor(config?: NetworkManagerConfig);
    /**
     * Download a file from multiple peers
     * @param peers - Array of peer identifiers
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
     * Connect to a single peer using NAT traversal
     *
     * @private
     * @param peerId - Peer ID to connect to
     */
    private _connectToPeer;
    /**
     * Get the connection type used for a specific peer
     *
     * @param peerId - Peer ID
     * @returns The connection type or undefined if not connected
     */
    getConnectionType(peerId: string): CONNECTION_TYPE | undefined;
    /**
     * Close all peer connections
     *
     * @private
     */
    private _closeAllConnections;
    /**
     * Get file metadata from any available peer
     *
     * @private
     * @param peers - Array of peer IDs
     * @param fileHash - SHA-256 hash of the file
     * @returns Promise with file metadata
     */
    private _getFileMetadata;
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
    private _downloadChunkFromPeer;
    /**
     * Select the best peer to download from based on performance
     *
     * @private
     * @param peerStats - Record of peer statistics
     * @returns Peer ID of the selected peer
     */
    private _selectBestPeer;
    /**
     * Evaluate peer performance and mark slow peers as inactive
     *
     * @private
     * @param peerStats - Record of peer statistics
     * @param totalBytes - Total file size in bytes
     */
    private _evaluatePeerPerformance;
    /**
     * Adjust concurrency level based on file size
     *
     * @private
     * @param totalBytes - Total file size in bytes
     */
    private _adjustConcurrencyForFileSize;
    /**
     * Adjust concurrency level based on current bandwidth
     *
     * @private
     * @param currentBytes - Total bytes downloaded so far
     * @param previousBytes - Bytes downloaded as of last check
     * @param timeInterval - Time elapsed since last check in ms
     */
    private _adjustConcurrencyBasedOnBandwidth;
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
     * Combine downloaded chunks into the final file and verify integrity
     * @param tempDir - Directory containing chunk files
     * @param totalChunks - Total number of chunks
     * @param savePath - Final file path
     * @param fileHash - Expected file hash
     * @returns True if verification succeeds
     */
    private _combineChunksAndVerify;
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

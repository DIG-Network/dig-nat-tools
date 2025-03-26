/**
 * Network Manager that handles connections and file transfers
 */
import { EventEmitter } from 'events';
import { CONNECTION_TYPE } from '../types/constants';
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
    enableDHT?: boolean;
    enableLocal?: boolean;
    enablePEX?: boolean;
    enableIPv6?: boolean;
    maxPeers?: number;
    announcePort?: number;
    enableContinuousDiscovery?: boolean;
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
/**
 * Options for configuring the NetworkManager
 */
export interface NetworkManagerOptions {
    /** Enable DHT peer discovery */
    enableDHT?: boolean;
    /** Enable local network peer discovery */
    enableLocal?: boolean;
    /** Enable peer exchange (PEX) */
    enablePEX?: boolean;
    /** Enable IPv6 support */
    enableIPv6?: boolean;
    /** Enable logging */
    enableLogging?: boolean;
    /** Maximum number of simultaneous peer connections */
    maxPeers?: number;
    /** Port to announce for receiving connections */
    announcePort?: number;
}
declare class NetworkManager extends EventEmitter {
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
    private _pieceRarityMap;
    private _isInEndgameMode;
    private _endgameModeThreshold;
    private _discoveryManager;
    private _options;
    private _infoHash;
    private _isStarted;
    private _activePeers;
    private _continuousDiscoveryInterval;
    private _maxPeersToConnect;
    private _isContinuousDiscoveryEnabled;
    private _contentHashMap;
    private peerDiscovery;
    private host;
    private dht;
    private gun;
    private fileClients;
    private nodeId;
    private started;
    /**
     * Create a new NetworkManager instance
     * @param config - Configuration options
     */
    constructor(config?: NetworkManagerConfig);
    /**
     * Toggle continuous peer discovery during downloads
     * @param enabled - Whether to enable continuous peer discovery
     */
    setEnableContinuousDiscovery(enabled: boolean): void;
    /**
     * Download a file from multiple peers
     * @param peers - Array of peer IDs
     * @param contentId - Content identifier for the file
     * @param options - Download options
     * @returns Promise with download result
     */
    downloadFile(peers: string[], contentId: string, options: MultiDownloadOptions): Promise<DownloadResult>;
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
     * Get metadata about a file from any available peer
     * @private
     * @param peers - Array of peer IDs
     * @param fileHash - SHA-256 hash of the file (used for verification and content access)
     * @returns Promise with file size and chunks information
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
    /**
     * Initialize the piece rarity map by querying peers for which pieces they have
     * @private
     * @param peers - Array of peer IDs
     * @param fileHash - SHA-256 hash of the file (used for content access)
     * @param totalPieces - Total number of pieces in the file
     */
    private _initializePieceRarity;
    /**
     * Select the next piece to download using rarest-first algorithm
     * @private
     * @param completedChunks - Set of already completed chunks
     * @returns The index of the rarest piece or null if no pieces available
     */
    private _selectNextPieceRarestFirst;
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
    private _checkAndEnableEndgameMode;
    /**
     * Request a piece from multiple peers for endgame mode
     * @private
     * @param pieceIndex - Index of the piece to request
     * @param peers - Array of peer IDs
     * @param fileHash - Hash of the file
     * @param tempDir - Directory for temporary files
     * @param peerStats - Statistics for each peer
     */
    private _requestPieceFromMultiplePeers;
    /**
     * Select a random subset of peers
     * @private
     * @param peers - Array of peer IDs
     * @param count - Number of peers to select
     * @returns Array of selected peer IDs
     */
    private _selectRandomPeers;
    /**
     * Start continuous peer discovery for the current download
     * @private
     * @param fileHash - Hash of the file being downloaded
     * @param peerStats - Current peer statistics
     */
    private _startContinuousDiscovery;
    /**
     * Stop continuous peer discovery
     * @private
     */
    private _stopContinuousDiscovery;
    /**
     * Add a mapping between content ID and SHA-256 hash
     * @param contentId - Content identifier
     * @param fileHash - SHA-256 hash for verification
     */
    addContentMapping(contentId: string, fileHash: string): void;
    /**
     * Get SHA-256 hash for a content ID
     * @param contentId - Content identifier
     * @returns SHA-256 hash or undefined if not found
     */
    getHashForContent(contentId: string): string | undefined;
    /**
     * Get content ID for a SHA-256 hash (reverse lookup)
     * @param fileHash - SHA-256 hash
     * @returns Content ID or undefined if not found
     */
    getContentForHash(fileHash: string): string | undefined;
    /**
     * Start the network manager
     */
    start(): Promise<void>;
    /**
     * Stop the network manager
     */
    stop(): Promise<void>;
    /**
     * Host file callback that maps content ID to file chunks
     * @param contentId - Content ID or file hash
     * @param startChunk - Starting chunk number
     * @param chunkSize - Size of each chunk
     * @param sha256 - Optional SHA-256 hash for verification
     * @returns Promise resolving to array of chunks or null if not found
     * @private
     */
    private _hostFileCallback;
    /**
     * Generate a node ID
     * @private
     */
    private _generateNodeId;
    /**
     * Initialize Gun.js
     * @private
     */
    private _initializeGun;
}
export default NetworkManager;

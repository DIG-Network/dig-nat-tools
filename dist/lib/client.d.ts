/**
 * FileClient - Downloads files from peers in the network
 *
 * Handles downloading files from peers, verifying integrity, and
 * providing resumable download capabilities.
 */
import { ClientOptions, DownloadOptions } from './types';
/**
 * FileClient class for downloading files from peers
 */
export default class FileClient {
    private chunkSize;
    private stunServers;
    private requestTimeout;
    private gun;
    private clientId;
    private initialized;
    private activeDownloads;
    private initPromise;
    private enableWebRTC;
    private enableNATPMP;
    private externalIPv4;
    private externalIPv6;
    private portMappingLifetime;
    private portMappings;
    private existingSocket;
    private connectionType;
    private remoteAddress;
    private remotePort;
    private hasEstablishedConnection;
    private availablePieces;
    private activeRequests;
    private connections;
    private _maxOutstandingRequests;
    /**
     * Create a new file client instance
     * @param config - Client configuration
     */
    constructor(config?: ClientOptions);
    /**
     * Initialize the client
     * @returns Promise that resolves when initialization is complete
     */
    private _initialize;
    /**
     * Create port mappings for NAT traversal
     * @private
     */
    private _createPortMappings;
    /**
     * Delete all port mappings
     * @private
     */
    private _deletePortMappings;
    /**
     * Discover available hosts in the network
     * @returns Promise that resolves to an array of host IDs
     */
    discoverHosts(): Promise<string[]>;
    /**
     * Download a file from a specific host
     * @param hostId - Host identifier
     * @param sha256 - SHA-256 hash of the file to download
     * @param options - Download configuration
     * @returns Promise that resolves to the path of the downloaded file
     */
    downloadFile(hostId: string, sha256: string, options: DownloadOptions): Promise<string>;
    /**
     * Stop the client and clean up resources
     */
    stop(): Promise<void>;
    /**
     * Connect to a peer
     * @param peerId - Peer identifier
     * @param connectionOptions - Connection options
     * @returns Promise that resolves to a connection object
     */
    private _connectToPeer;
    /**
     * Create connection from an existing TCP socket from NAT traversal
     * @param peerId - Peer identifier
     * @param socket - Existing TCP socket
     * @returns Connection object
     */
    private _createConnectionFromExistingTCPSocket;
    /**
     * Create connection from an existing UDP socket from NAT traversal
     * @param peerId - Peer identifier
     * @param socket - Existing UDP socket
     * @returns Connection object
     */
    private _createConnectionFromExistingUDPSocket;
    /**
     * Try direct connection to a peer
     * @param peerId - Peer identifier
     * @returns Promise that resolves to a connection object
     */
    private _tryDirectConnection;
    /**
     * Get peer connection options
     * @param peerId - Peer identifier
     * @returns Promise that resolves to an array of connection options
     */
    private _getPeerConnectionOptions;
    /**
     * Create a TCP connection
     * @param peerId - Peer identifier
     * @param host - Host address
     * @param port - Port number
     * @returns Promise that resolves to a connection object
     */
    private _createTCPConnection;
    /**
     * Create a UDP connection
     * @param peerId - Peer identifier
     * @param host - Host address
     * @param port - Port number
     * @returns Promise that resolves to a connection object
     */
    private _createUDPConnection;
    /**
     * Create a WebRTC connection
     * @param peerId - Peer identifier
     * @returns Promise that resolves to a connection object
     */
    private _createWebRTCConnection;
    /**
     * Listen for WebRTC signals from a peer
     * @param peerId - Peer identifier
     * @param peer - WebRTC peer connection
     */
    private _listenForWebRTCSignals;
    /**
     * Create a Gun relay connection
     * @param peerId - Peer identifier
     * @returns Connection object
     */
    private _createGunRelayConnection;
    /**
     * Request file metadata from a connection
     * @param connection - Connection to the peer
     * @param sha256 - SHA-256 hash of the file
     * @returns Promise that resolves to file metadata
     */
    private _requestFileMetadata;
    /**
     * Set up the output file for download
     * @param savePath - Path to save the file
     * @param resumeFromChunk - Chunk index to resume from
     * @param chunkSize - Size of each chunk in bytes
     * @returns Promise that resolves to file handle and array of existing chunks
     */
    private _setupOutputFile;
    /**
     * Get active downloads
     * @returns Array of active download IDs
     */
    getActiveDownloads(): string[];
    /**
     * Cancel an active download
     * @param downloadId - Download identifier
     * @returns true if the download was cancelled, false if not found
     */
    cancelDownload(downloadId: string): boolean;
    /**
     * Add pieces to the available pieces set for a file
     * @param fileHash - Hash of the file
     * @param pieces - Array of piece indices
     */
    addAvailablePieces(fileHash: string, pieces: number[]): void;
    /**
     * Get the list of available pieces for a file
     * @param fileHash - Hash of the file
     * @returns Array of available piece indices or empty array if none
     */
    getAvailablePieces(fileHash: string): Promise<number[]>;
    /**
     * Track a request for a piece
     * @param fileHash - Hash of the file
     * @param pieceIndex - Index of the requested piece
     */
    private _trackRequest;
    /**
     * Cancel a request for a piece
     * @param fileHash - Hash of the file
     * @param pieceIndex - Index of the piece to cancel
     */
    cancelRequest(fileHash: string, pieceIndex: number): Promise<void>;
    /**
     * Download multiple chunks in a pipelined manner for improved performance
     * @param sha256 - SHA-256 hash of the file
     * @param pieceIndices - Array of piece indices to download
     * @param options - Download options
     * @returns Promise with array of downloaded chunks
     */
    pipelineRequests(sha256: string, pieceIndices: number[], options?: {
        timeout?: number;
    }): Promise<Buffer[]>;
    /**
     * Create a connection specifically for file transfers
     * @private
     * @param fileHash - Hash of the file to download
     * @returns Promise with a Connection object
     */
    private _createFileConnection;
}

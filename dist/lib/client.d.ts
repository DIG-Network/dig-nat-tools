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
     * Connect to a peer
     * @param peerId - Peer identifier
     * @param connectionOptions - Connection options
     * @returns Promise that resolves to a connection object
     */
    private _connectToPeer;
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
}

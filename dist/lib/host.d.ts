/**
 * FileHost - Serves files to other peers in the network
 *
 * Handles serving file chunks to requesting peers, managing connections,
 * and coordinating file serving capabilities.
 */
import { HostOptions } from './types';
/**
 * FileHost class for serving files to peers
 */
export default class FileHost {
    private hostId;
    private gun;
    private hostFileCallback;
    private chunkSize;
    private stunServers;
    private enableTCP;
    private enableUDP;
    private enableWebRTC;
    private enableNATPMP;
    private portMappingLifetime;
    private tcpPort;
    private udpPort;
    private tcpServer;
    private udpSocket;
    private activeConnections;
    private tcpSockets;
    private udpClients;
    private webrtcPeerConnections;
    private webrtcDataChannels;
    private connectionOptions;
    private isRunning;
    private portMappings;
    private externalIPv4;
    private _peerContributions;
    private _chokedPeers;
    private _maxUnchokedPeers;
    private _lastChokeUpdateTime;
    private _chokeUpdateInterval;
    private _superSeedMode;
    private directoryWatcher;
    private peerDiscoveryManager;
    private announcedFiles;
    private watchDir;
    private watchOptions;
    private dhtOptions;
    private contentHashMap;
    /**
     * Create a new FileHost instance
     * @param options Host configuration options
     */
    constructor(options: HostOptions);
    /**
     * Get the host ID
     * @returns The host ID
     */
    getHostId(): string;
    /**
     * Get the TCP port
     * @returns The TCP port number or 0 if TCP is not enabled
     */
    getTcpPort(): number;
    /**
     * Get the UDP port
     * @returns The UDP port number or 0 if UDP is not enabled
     */
    getUdpPort(): number;
    /**
     * Get all announced files
     * @returns Map of currently announced file hashes
     */
    getAnnouncedFiles(): Map<string, boolean>;
    /**
     * Start the file host
     */
    start(): Promise<void>;
    /**
     * Stop the file host
     */
    stop(): Promise<void>;
    /**
     * Start the directory watcher
     */
    private _startDirectoryWatcher;
    /**
     * Get all local IP addresses
     * @returns Array of local IP addresses
     */
    private _getLocalIPAddresses;
    /**
     * Start TCP server
     */
    private _startTCPServer;
    /**
     * Start UDP server
     */
    private _startUDPServer;
    /**
     * Add local connection options for TCP (both IPv4 and IPv6)
     * @private
     */
    private _addLocalConnectionOptions;
    /**
     * Add local connection options for UDP (both IPv4 and IPv6)
     * @private
     */
    private _addLocalUDPConnectionOptions;
    /**
     * Set up Gun message handling for discovery and relay
     */
    private _setupGunMessageHandling;
    /**
     * Handle handshake message for direct connection
     */
    private _handleHandshakeMessage;
    /**
     * Handle WebRTC signaling message
     */
    private _handleWebRTCSignal;
    /**
     * Handle Gun relay request
     */
    private _handleGunRequest;
    /**
     * Handle incoming message from any connection type
     */
    private _handleIncomingMessage;
    /**
     * Handle metadata request
     */
    private _handleMetadataRequest;
    /**
     * Handle chunk request
     */
    private _handleChunkRequest;
    /**
     * Send response to client
     */
    private _sendResponse;
    /**
     * Create a TCP connection object
     * @param clientId - Client identifier
     * @param socket - TCP socket
     * @returns TCP connection object
     */
    private _createTCPConnection;
    /**
     * Create a UDP connection object
     * @param clientId - Client identifier
     * @param remoteAddress - Remote address
     * @param remotePort - Remote port
     * @returns UDP connection object
     */
    private _createUDPConnection;
    /**
     * Create a WebRTC connection object
     * @param clientId - Client identifier
     * @param peerConnection - WebRTC peer connection
     * @param dataChannel - WebRTC data channel
     * @returns WebRTC connection object
     */
    private _createWebRTCConnection;
    /**
     * Create a Gun relay connection object
     * @param clientId - Client identifier
     * @returns Gun relay connection object
     */
    private _createGunConnection;
    /**
     * Send TCP response (fallback method)
     */
    private _sendTCPResponse;
    /**
     * Send UDP response (fallback method)
     */
    private _sendUDPResponse;
    /**
     * Send WebRTC response (fallback method)
     */
    private _sendWebRTCResponse;
    /**
     * Send Gun relay response (fallback method)
     */
    private _sendGunResponse;
    /**
     * Handle a new TCP connection
     * @param socket The TCP socket
     */
    private _handleTCPConnection;
    /**
     * Handle an incoming UDP message
     * @param msg The UDP message
     * @param rinfo The remote info (address and port)
     */
    private _handleUDPMessage;
    /**
     * Record a contribution from a peer (upload or other useful activity)
     * @param peerId - ID of the peer
     * @param bytes - Number of bytes contributed
     */
    recordPeerContribution(peerId: string, bytes: number): void;
    /**
     * Update the choked status of peers based on their contributions
     * This implements a tit-for-tat strategy to incentivize uploads
     */
    private _updatePeerChoking;
    /**
     * Special choking algorithm for super seed mode
     * In super seed mode, we want to:
     * 1. Ensure each peer gets unique pieces to spread them around
     * 2. Prioritize peers that share pieces with others
     * 3. Cycle through peers to ensure wide distribution
     */
    private _updateChokingForSuperSeed;
    /**
     * Consider unchoking a peer that has recently contributed
     * @private
     * @param peerId - ID of the peer to potentially unchoke
     */
    private _considerUnchokingPeer;
    /**
     * Choke a peer (restrict their download speed)
     * @private
     * @param peerId - ID of the peer to choke
     */
    private _chokePeer;
    /**
     * Unchoke a peer (allow normal download speed)
     * @private
     * @param peerId - ID of the peer to unchoke
     */
    private _unchokePeer;
    /**
     * Send a choke or unchoke message to a peer
     * @private
     * @param peerId - ID of the peer
     * @param choked - Whether the peer is choked
     */
    private _sendChokeToPeer;
    /**
     * Check if a peer is currently choked
     * @param peerId - ID of the peer
     * @returns true if the peer is choked, false otherwise
     */
    isPeerChoked(peerId: string): boolean;
    /**
     * Enable super seed mode for efficient initial file distribution
     * In super seed mode, this node will:
     * 1. Only send each peer very limited pieces
     * 2. Unchoke peers in a pattern that maximizes piece distribution
     * 3. Focus on new peers to ensure wide distribution
     * @param enable - Whether to enable or disable super seed mode
     */
    enableSuperSeedMode(enable?: boolean): void;
    /**
     * Get the DHT shard prefixes used by this host
     * @returns Array of shard prefixes or empty array if DHT sharding is not enabled
     */
    getShardPrefixes(): string[];
    /**
     * Add a content ID to SHA-256 hash mapping
     * @param contentId - Content identifier
     * @param sha256 - SHA-256 hash of the content
     */
    addContentMapping(contentId: string, sha256: string): void;
    /**
     * Get SHA-256 hash for a content ID
     * @param contentId - Content identifier
     * @returns SHA-256 hash or undefined if not found
     */
    getHashForContent(contentId: string): string | undefined;
    /**
     * Get content ID for a SHA-256 hash (reverse lookup)
     * @param sha256 - SHA-256 hash
     * @returns Content ID or undefined if not found
     */
    getContentForHash(sha256: string): string | undefined;
    /**
     * Update methods that call hostFileCallback to use contentId and pass sha256 as needed
     * @param contentId - Content identifier for the file
     * @param startChunk - Starting chunk index
     * @returns Promise resolving to array of buffers for the chunks or null
     */
    private getFileChunks;
}

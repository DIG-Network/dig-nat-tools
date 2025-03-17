/**
 * FileHost - Serves files to other peers in the network
 *
 * Handles serving file chunks to requesting peers, managing connections,
 * and coordinating file serving capabilities.
 */
import { HostOptions } from './types';
export interface HostConfig {
    hostFileCallback: (sha256: string, startChunk: number, chunkSize: number) => Promise<Buffer[] | null>;
    gunOptions?: Record<string, any>;
    chunkSize?: number;
    stunServers?: string[];
    tcpPort?: number;
    udpPort?: number;
    enableTCP?: boolean;
    enableUDP?: boolean;
    enableWebRTC?: boolean;
}
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
    private tcpPort;
    private udpPort;
    private tcpServer;
    private udpSocket;
    private activeConnections;
    private tcpConnections;
    private udpConnections;
    private webrtcConnections;
    private dataChannels;
    private connectionOptions;
    private isRunning;
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
     * Start the file host
     */
    start(): Promise<void>;
    /**
     * Stop the file host
     */
    stop(): Promise<void>;
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
     * Send TCP response
     */
    private _sendTCPResponse;
    /**
     * Send UDP response
     */
    private _sendUDPResponse;
    /**
     * Send WebRTC response
     */
    private _sendWebRTCResponse;
    /**
     * Send Gun relay response
     */
    private _sendGunResponse;
}

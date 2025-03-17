"use strict";
/**
 * FileHost - Serves files to other peers in the network
 *
 * Handles serving file chunks to requesting peers, managing connections,
 * and coordinating file serving capabilities.
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
const gun_1 = __importDefault(require("gun"));
const debug_1 = __importDefault(require("debug"));
const dgram = __importStar(require("dgram"));
const net = __importStar(require("net"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const uuid_1 = require("uuid");
const dc = __importStar(require("node-datachannel"));
// Import the CONNECTION_TYPE for use in the host
const constants_1 = require("../types/constants");
const debug = (0, debug_1.default)('dig-nat-tools:host');
/**
 * FileHost class for serving files to peers
 */
class FileHost {
    /**
     * Create a new FileHost instance
     * @param options Host configuration options
     */
    constructor(options) {
        this.tcpServer = null;
        this.udpSocket = null;
        this.activeConnections = new Map();
        this.tcpConnections = new Map();
        this.udpConnections = new Map();
        this.webrtcConnections = new Map();
        this.dataChannels = new Map();
        this.connectionOptions = [];
        this.isRunning = false;
        this.hostId = (0, uuid_1.v4)();
        this.hostFileCallback = options.hostFileCallback;
        this.chunkSize = options.chunkSize || 64 * 1024; // 64KB default
        this.stunServers = options.stunServers || [
            'stun:stun.l.google.com:19302',
            'stun:stun1.l.google.com:19302'
        ];
        this.enableTCP = options.enableTCP !== false;
        this.enableUDP = options.enableUDP !== false;
        this.enableWebRTC = options.enableWebRTC !== false;
        this.tcpPort = options.tcpPort || 0; // 0 = random available port
        this.udpPort = options.udpPort || 0; // 0 = random available port
        // Initialize Gun for signaling and fallback relay
        const gunOptions = options.gunOptions || {};
        this.gun = new gun_1.default({
            peers: gunOptions.peers || ['https://gun-manhattan.herokuapp.com/gun'],
            file: gunOptions.file || path.join(os.tmpdir(), `gun-${this.hostId}`),
            ...gunOptions
        });
    }
    /**
     * Get the host ID
     * @returns The host ID
     */
    getHostId() {
        return this.hostId;
    }
    /**
     * Start the file host
     */
    async start() {
        if (this.isRunning) {
            debug('Host already running');
            return;
        }
        debug(`Starting file host with ID: ${this.hostId}`);
        this.isRunning = true;
        // Initialize connection options array
        this.connectionOptions = [];
        // Start TCP server if enabled
        if (this.enableTCP) {
            await this._startTCPServer();
        }
        // Start UDP socket if enabled
        if (this.enableUDP) {
            await this._startUDPServer();
        }
        // Initialize WebRTC if enabled
        if (this.enableWebRTC) {
            // The LogLevel may not be directly available, use a string with as any type assertion
            dc.initLogger('error');
            this.connectionOptions.push({ type: constants_1.CONNECTION_TYPE.WEBRTC });
        }
        // Always add Gun relay as fallback
        this.connectionOptions.push({ type: constants_1.CONNECTION_TYPE.GUN });
        // Register host in Gun
        const hostData = {
            id: this.hostId,
            connectionOptions: this.connectionOptions,
            timestamp: Date.now()
        };
        this.gun.get('hosts').get(this.hostId).put(hostData);
        debug(`Host registered with connection options:`, this.connectionOptions);
        // Set up Gun message handling for discovery and relay
        this._setupGunMessageHandling();
    }
    /**
     * Stop the file host
     */
    async stop() {
        if (!this.isRunning) {
            debug('Host not running');
            return;
        }
        debug(`Stopping file host with ID: ${this.hostId}`);
        this.isRunning = false;
        // Close TCP server and connections
        if (this.tcpServer) {
            this.tcpServer.close();
            for (const socket of this.tcpConnections.values()) {
                socket.destroy();
            }
            this.tcpConnections.clear();
        }
        // Close UDP socket
        if (this.udpSocket) {
            this.udpSocket.close();
            this.udpConnections.clear();
        }
        // Close WebRTC connections
        for (const dataChannel of this.dataChannels.values()) {
            dataChannel.close();
        }
        for (const peerConnection of this.webrtcConnections.values()) {
            peerConnection.close();
        }
        this.dataChannels.clear();
        this.webrtcConnections.clear();
        // Remove host from Gun
        this.gun.get('hosts').get(this.hostId).put(null);
        // Clear all active connections
        this.activeConnections.clear();
    }
    /**
     * Get all local IP addresses
     * @returns Array of local IP addresses
     */
    _getLocalIPAddresses() {
        const interfaces = os.networkInterfaces();
        const addresses = [];
        // Iterate through network interfaces
        for (const name in interfaces) {
            const networkInterface = interfaces[name];
            if (!networkInterface)
                continue;
            // Get IPv4 addresses that are not internal
            for (const iface of networkInterface) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    addresses.push(iface.address);
                }
            }
        }
        return addresses;
    }
    /**
     * Start TCP server
     */
    async _startTCPServer() {
        return new Promise((resolve, reject) => {
            this.tcpServer = net.createServer((socket) => {
                const clientId = `${socket.remoteAddress}:${socket.remotePort}`;
                debug(`New TCP connection from ${clientId}`);
                this.tcpConnections.set(clientId, socket);
                socket.on('data', (data) => {
                    // Handle incoming TCP data
                    this._handleIncomingMessage(data, clientId, constants_1.CONNECTION_TYPE.TCP);
                });
                socket.on('error', (err) => {
                    debug(`TCP socket error for ${clientId}:`, err);
                    this.tcpConnections.delete(clientId);
                });
                socket.on('close', () => {
                    debug(`TCP connection closed for ${clientId}`);
                    this.tcpConnections.delete(clientId);
                });
            });
            this.tcpServer.on('error', (err) => {
                debug('TCP server error:', err);
                reject(err);
            });
            this.tcpServer.listen(this.tcpPort, () => {
                const address = this.tcpServer.address();
                this.tcpPort = address.port;
                debug(`TCP server listening on port ${this.tcpPort}`);
                // Add local addresses to connection options
                const localAddresses = this._getLocalIPAddresses();
                for (const addr of localAddresses) {
                    this.connectionOptions.push({
                        type: constants_1.CONNECTION_TYPE.TCP,
                        address: addr,
                        port: this.tcpPort
                    });
                }
                resolve();
            });
        });
    }
    /**
     * Start UDP server
     */
    async _startUDPServer() {
        return new Promise((resolve, reject) => {
            this.udpSocket = dgram.createSocket('udp4');
            this.udpSocket.on('error', (err) => {
                debug('UDP socket error:', err);
                reject(err);
            });
            this.udpSocket.on('message', (msg, rinfo) => {
                const clientId = `${rinfo.address}:${rinfo.port}`;
                debug(`Received UDP message from ${clientId}`);
                // Store client info for sending responses
                this.udpConnections.set(clientId, {
                    address: rinfo.address,
                    port: rinfo.port
                });
                // Handle incoming UDP data
                this._handleIncomingMessage(msg, clientId, constants_1.CONNECTION_TYPE.UDP);
            });
            this.udpSocket.on('listening', () => {
                const address = this.udpSocket.address();
                this.udpPort = address.port;
                debug(`UDP server listening on port ${this.udpPort}`);
                // Add local addresses to connection options
                const localAddresses = this._getLocalIPAddresses();
                for (const addr of localAddresses) {
                    this.connectionOptions.push({
                        type: constants_1.CONNECTION_TYPE.UDP,
                        address: addr,
                        port: this.udpPort
                    });
                }
                resolve();
            });
            this.udpSocket.bind(this.udpPort);
        });
    }
    /**
     * Set up Gun message handling for discovery and relay
     */
    _setupGunMessageHandling() {
        // Handle direct connection requests
        this.gun.get('hosts').get(this.hostId).get('messages').on((messages) => {
            if (!messages)
                return;
            for (const msgId in messages) {
                if (msgId === '_')
                    continue;
                const message = messages[msgId];
                if (!message || message.handled)
                    continue;
                debug(`Received Gun message: ${message.type}`);
                // Mark message as handled
                this.gun.get('hosts').get(this.hostId).get('messages').get(msgId).put({
                    ...message,
                    handled: true
                });
                // Handle message based on type
                if (message.type === 'handshake') {
                    this._handleHandshakeMessage(message, msgId);
                }
                else if (message.type === 'webrtc-signal') {
                    this._handleWebRTCSignal(message);
                }
                else if (message.type === 'request') {
                    this._handleGunRequest(message, msgId);
                }
            }
        });
    }
    /**
     * Handle handshake message for direct connection
     */
    _handleHandshakeMessage(message, msgId) {
        // Respond to handshake with connection options
        const response = {
            type: 'handshake-response',
            connectionOptions: this.connectionOptions,
            timestamp: Date.now()
        };
        this.gun.get('hosts').get(this.hostId).get('messages').get(msgId).put({
            ...message,
            response,
            handled: true
        });
        debug('Sent handshake response with connection options');
    }
    /**
     * Handle WebRTC signaling message
     */
    _handleWebRTCSignal(message) {
        if (!this.enableWebRTC)
            return;
        const { clientId, signal } = message;
        // If we don't have a peer connection for this client yet, create one
        if (!this.webrtcConnections.has(clientId)) {
            debug(`Creating new WebRTC peer connection for ${clientId}`);
            // Configure the peer connection
            const config = {
                iceServers: this.stunServers
            };
            const peer = new dc.PeerConnection(clientId, config);
            // Set up event handlers for node-datachannel
            peer.onLocalDescription((sdp, type) => {
                // Send local description back to the client
                const response = {
                    type: 'webrtc-signal',
                    clientId,
                    signal: { sdp, type },
                    timestamp: Date.now()
                };
                this.gun.get('clients').get(clientId).get('signals').set(response);
                debug(`Sent local description to ${clientId}`);
            });
            peer.onLocalCandidate((candidate, mid) => {
                // Send ICE candidate to the client
                const response = {
                    type: 'webrtc-signal',
                    clientId,
                    signal: { candidate, mid },
                    timestamp: Date.now()
                };
                this.gun.get('clients').get(clientId).get('signals').set(response);
                debug(`Sent ICE candidate to ${clientId}`);
            });
            peer.onDataChannel((channel) => {
                debug(`New data channel from ${clientId}`);
                channel.onMessage((msg) => {
                    if (typeof msg === 'string') {
                        try {
                            const data = JSON.parse(msg);
                            this._handleIncomingMessage(data, clientId, constants_1.CONNECTION_TYPE.WEBRTC);
                        }
                        catch (err) {
                            debug(`Error parsing WebRTC message: ${err}`);
                        }
                    }
                    else {
                        // Binary message handling - this should be already handled by node-datachannel
                        debug("Received non-string message which shouldn't happen with node-datachannel");
                    }
                });
                channel.onClosed(() => {
                    debug(`Data channel from ${clientId} closed`);
                    this.dataChannels.delete(clientId);
                });
                this.dataChannels.set(clientId, channel);
            });
            this.webrtcConnections.set(clientId, peer);
        }
        const peer = this.webrtcConnections.get(clientId);
        // Handle the signal
        if (signal.sdp && signal.type) {
            peer.setRemoteDescription(signal.sdp, signal.type);
            debug(`Set remote description for ${clientId}`);
            // If we received an offer, we need to create an answer
            if (signal.type === 'offer') {
                // Automatically created by node-datachannel library when remote description is set
                debug(`Remote offer processed for ${clientId}`);
            }
        }
        else if (signal.candidate && signal.mid) {
            peer.addRemoteCandidate(signal.candidate, signal.mid);
            debug(`Added remote ICE candidate for ${clientId}`);
        }
    }
    /**
     * Handle Gun relay request
     */
    _handleGunRequest(message, msgId) {
        const { clientId, request } = message;
        if (request.type === 'metadata') {
            this._handleMetadataRequest(clientId, request.sha256, msgId);
        }
        else if (request.type === 'chunk') {
            this._handleChunkRequest(clientId, request.sha256, request.startChunk, msgId);
        }
    }
    /**
     * Handle incoming message from any connection type
     */
    _handleIncomingMessage(data, clientId, connectionType) {
        let message;
        // Parse message if it's a buffer
        if (Buffer.isBuffer(data) || data instanceof Uint8Array) {
            try {
                message = JSON.parse(data.toString('utf8'));
            }
            catch (err) {
                debug(`Error parsing message from ${clientId}: ${err}`);
                return;
            }
        }
        else {
            message = data;
        }
        debug(`Received ${connectionType} message from ${clientId}: ${message.type}`);
        // Handle message based on type
        if (message.type === 'metadata') {
            this._handleMetadataRequest(clientId, message.sha256, null, connectionType);
        }
        else if (message.type === 'chunk') {
            this._handleChunkRequest(clientId, message.sha256, message.startChunk, null, connectionType);
        }
    }
    /**
     * Handle metadata request
     */
    async _handleMetadataRequest(clientId, sha256, msgId = null, connectionType = constants_1.CONNECTION_TYPE.GUN) {
        debug(`Handling metadata request for ${sha256} from ${clientId}`);
        try {
            // Get the first chunk to determine if file exists and get its size
            const firstChunk = await this.hostFileCallback(sha256, 0, this.chunkSize);
            if (!firstChunk) {
                debug(`File ${sha256} not found`);
                this._sendResponse({
                    type: 'metadata-response',
                    sha256,
                    error: 'File not found'
                }, clientId, msgId, connectionType);
                return;
            }
            // Get file size by requesting chunks until we get null
            let totalSize = 0;
            let chunkIndex = 0;
            let lastChunk = firstChunk;
            while (lastChunk) {
                for (const chunk of lastChunk) {
                    totalSize += chunk.length;
                }
                chunkIndex++;
                lastChunk = await this.hostFileCallback(sha256, chunkIndex, this.chunkSize);
            }
            // Send metadata response
            this._sendResponse({
                type: 'metadata-response',
                sha256,
                totalSize,
                chunkSize: this.chunkSize,
                totalChunks: Math.ceil(totalSize / this.chunkSize)
            }, clientId, msgId, connectionType);
        }
        catch (err) {
            debug(`Error handling metadata request: ${err}`);
            this._sendResponse({
                type: 'metadata-response',
                sha256,
                error: `Server error: ${err.message}`
            }, clientId, msgId, connectionType);
        }
    }
    /**
     * Handle chunk request
     */
    async _handleChunkRequest(clientId, sha256, startChunk, msgId = null, connectionType = constants_1.CONNECTION_TYPE.GUN) {
        debug(`Handling chunk request for ${sha256}, chunk ${startChunk} from ${clientId}`);
        try {
            // Get the requested chunk
            const chunks = await this.hostFileCallback(sha256, startChunk, this.chunkSize);
            if (!chunks) {
                debug(`Chunk ${startChunk} of file ${sha256} not found`);
                this._sendResponse({
                    type: 'chunk-response',
                    sha256,
                    startChunk,
                    error: 'Chunk not found'
                }, clientId, msgId, connectionType);
                return;
            }
            // Send chunk response
            this._sendResponse({
                type: 'chunk-response',
                sha256,
                startChunk,
                data: chunks.map(chunk => chunk.toString('base64'))
            }, clientId, msgId, connectionType);
        }
        catch (err) {
            debug(`Error handling chunk request: ${err}`);
            this._sendResponse({
                type: 'chunk-response',
                sha256,
                startChunk,
                error: `Server error: ${err.message}`
            }, clientId, msgId, connectionType);
        }
    }
    /**
     * Send response to client
     */
    _sendResponse(response, clientId, msgId = null, connectionType = constants_1.CONNECTION_TYPE.GUN) {
        debug(`Sending ${response.type} to ${clientId} via ${connectionType}`);
        // Send response based on connection type
        switch (connectionType) {
            case constants_1.CONNECTION_TYPE.TCP:
                this._sendTCPResponse(response, clientId);
                break;
            case constants_1.CONNECTION_TYPE.UDP:
                this._sendUDPResponse(response, clientId);
                break;
            case constants_1.CONNECTION_TYPE.WEBRTC:
                this._sendWebRTCResponse(response, clientId);
                break;
            case constants_1.CONNECTION_TYPE.GUN:
                this._sendGunResponse(response, clientId, msgId);
                break;
            default:
                debug(`Unknown connection type: ${connectionType}`);
        }
    }
    /**
     * Send TCP response
     */
    _sendTCPResponse(response, clientId) {
        const socket = this.tcpConnections.get(clientId);
        if (!socket) {
            debug(`TCP socket for ${clientId} not found`);
            return;
        }
        try {
            const data = JSON.stringify(response);
            socket.write(data);
        }
        catch (err) {
            debug(`Error sending TCP response: ${err}`);
        }
    }
    /**
     * Send UDP response
     */
    _sendUDPResponse(response, clientId) {
        const client = this.udpConnections.get(clientId);
        if (!client || !this.udpSocket) {
            debug(`UDP client ${clientId} not found or UDP socket not initialized`);
            return;
        }
        try {
            const data = JSON.stringify(response);
            this.udpSocket.send(data, client.port, client.address);
        }
        catch (err) {
            debug(`Error sending UDP response: ${err}`);
        }
    }
    /**
     * Send WebRTC response
     */
    _sendWebRTCResponse(response, clientId) {
        const dataChannel = this.dataChannels.get(clientId);
        if (!dataChannel) {
            debug(`WebRTC data channel for ${clientId} not found`);
            return;
        }
        try {
            const data = JSON.stringify(response);
            dataChannel.sendMessage(data);
        }
        catch (err) {
            debug(`Error sending WebRTC response: ${err}`);
        }
    }
    /**
     * Send Gun relay response
     */
    _sendGunResponse(response, clientId, msgId) {
        if (!msgId) {
            debug(`Cannot send Gun response without message ID`);
            return;
        }
        try {
            this.gun.get('hosts').get(this.hostId).get('messages').get(msgId).put({
                response,
                handled: true,
                timestamp: Date.now()
            });
        }
        catch (err) {
            debug(`Error sending Gun response: ${err}`);
        }
    }
}
exports.default = FileHost;
//# sourceMappingURL=host.js.map
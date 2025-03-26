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
// We'll use dynamic imports for node-datachannel
const dgram = __importStar(require("dgram"));
const net = __importStar(require("net"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const uuid_1 = require("uuid");
// Import the CONNECTION_TYPE for use in the host
const constants_1 = require("../types/constants");
// Import NAT-PMP/PCP utilities
const utils_1 = require("./utils");
// Import DirectoryWatcher for auto-announcing files
const directory_watcher_1 = require("./utils/directory-watcher");
// Import PeerDiscoveryManager for announcing files
const peer_discovery_manager_1 = require("./utils/peer-discovery-manager");
const peer_discovery_manager_2 = require("./utils/peer-discovery-manager");
const debug = (0, debug_1.default)('dig-nat-tools:host');
// We'll use any for now since we can't use dynamic imports directly in TypeScript
// This will be initialized in the constructor if WebRTC is enabled
let dc = null;
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
        // Store the actual connection objects now
        this.activeConnections = new Map();
        this.tcpSockets = new Map();
        this.udpClients = new Map();
        this.webrtcPeerConnections = new Map();
        this.webrtcDataChannels = new Map();
        this.connectionOptions = [];
        this.isRunning = false;
        this.portMappings = [];
        this.externalIPv4 = null;
        // Add these properties to the FileHost class
        this._peerContributions = new Map(); // peerId -> bytes contributed
        this._chokedPeers = new Set(); // Peers that are currently choked
        this._maxUnchokedPeers = 4; // Maximum number of peers that can be unchoked at once
        this._lastChokeUpdateTime = 0;
        this._chokeUpdateInterval = 10000; // 10 seconds
        this._superSeedMode = false; // Whether super seed mode is enabled
        // Directory watcher properties
        this.directoryWatcher = null;
        this.peerDiscoveryManager = null;
        this.announcedFiles = new Map(); // hash -> announced status
        this.watchDir = null;
        this.watchOptions = null;
        // New properties for shared host
        this.dhtOptions = {};
        // Also add a mapping between contentId and sha256 if they're different
        this.contentHashMap = new Map();
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
        this.enableNATPMP = options.enableNATPMP !== false; // Default to enabled
        this.portMappingLifetime = options.portMappingLifetime || 3600; // Default to 1 hour
        this.tcpPort = options.tcpPort || 0; // 0 = random available port
        this.udpPort = options.udpPort || 0; // 0 = random available port
        // Store watch directory options if provided
        if (options.watchDir) {
            this.watchDir = options.watchDir;
            this.watchOptions = {
                recursive: options.watchRecursive !== false,
                includeExtensions: options.watchIncludeExtensions,
                excludeExtensions: options.watchExcludeExtensions,
                maxFileSize: options.watchMaxFileSize,
                persistHashes: options.watchPersistHashes !== false,
                priority: options.watchAnnouncePriority === 'high'
                    ? peer_discovery_manager_2.AnnouncePriority.HIGH
                    : (options.watchAnnouncePriority === 'low'
                        ? peer_discovery_manager_2.AnnouncePriority.LOW
                        : peer_discovery_manager_2.AnnouncePriority.MEDIUM)
            };
        }
        // Prepare DHT options
        let dhtOptions = options.dhtOptions || {};
        // Handle shared host with random shard prefixes
        if (options.isShardHost) {
            // Generate random shard prefixes if not provided
            if (!dhtOptions.shardPrefixes || dhtOptions.shardPrefixes.length === 0) {
                const numPrefixes = dhtOptions.numShardPrefixes || 3;
                const prefixLength = dhtOptions.shardPrefixLength || 2;
                // Generate the specified number of random hex prefixes
                const shardPrefixes = [];
                const hexChars = '0123456789abcdef';
                // Track prefixes to ensure uniqueness
                const prefixSet = new Set();
                // Generate unique prefixes
                while (prefixSet.size < numPrefixes) {
                    let prefix = '';
                    for (let i = 0; i < prefixLength; i++) {
                        prefix += hexChars.charAt(Math.floor(Math.random() * hexChars.length));
                    }
                    prefixSet.add(prefix);
                }
                // Convert set to array
                dhtOptions.shardPrefixes = Array.from(prefixSet);
                debug(`Generated random DHT shard prefixes: ${dhtOptions.shardPrefixes.join(', ')}`);
            }
        }
        // Store DHT options for later use when initializing PeerDiscoveryManager
        this.dhtOptions = dhtOptions;
        // Initialize Gun for signaling and fallback relay
        const gunOptions = options.gunOptions || {};
        // Use type assertion to fix the constructor issue
        this.gun = new gun_1.default({
            peers: gunOptions.peers || ['https://gun-manhattan.herokuapp.com/gun'],
            file: gunOptions.file || path.join(os.tmpdir(), `gun-${this.hostId}`),
            ...gunOptions
        });
        // Dynamically import node-datachannel if WebRTC is enabled
        if (this.enableWebRTC) {
            Promise.resolve().then(() => __importStar(require('node-datachannel'))).then(module => {
                dc = module;
                debug('node-datachannel module loaded');
            }).catch(err => {
                debug(`Error loading node-datachannel: ${err}`);
                this.enableWebRTC = false;
            });
        }
    }
    /**
     * Get the host ID
     * @returns The host ID
     */
    getHostId() {
        return this.hostId;
    }
    /**
     * Get the TCP port
     * @returns The TCP port number or 0 if TCP is not enabled
     */
    getTcpPort() {
        return this.enableTCP ? this.tcpPort : 0;
    }
    /**
     * Get the UDP port
     * @returns The UDP port number or 0 if UDP is not enabled
     */
    getUdpPort() {
        return this.enableUDP ? this.udpPort : 0;
    }
    /**
     * Get all announced files
     * @returns Map of currently announced file hashes
     */
    getAnnouncedFiles() {
        return new Map(this.announcedFiles);
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
            // Make sure node-datachannel is loaded
            if (!dc) {
                try {
                    dc = await Promise.resolve().then(() => __importStar(require('node-datachannel')));
                    debug('node-datachannel module loaded');
                }
                catch (err) {
                    debug(`Error loading node-datachannel: ${err}`);
                    this.enableWebRTC = false;
                }
            }
            if (dc) {
                try {
                    dc.initLogger('error');
                    this.connectionOptions.push({ type: constants_1.CONNECTION_TYPE.WEBRTC });
                    debug('WebRTC initialized');
                }
                catch (err) {
                    debug(`Error initializing WebRTC: ${err}`);
                    this.enableWebRTC = false;
                }
            }
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
        // Initialize PeerDiscoveryManager
        if (this.tcpPort || this.udpPort) {
            const announcePort = this.tcpPort || this.udpPort;
            const nodeType = (this.watchOptions?.priority === peer_discovery_manager_2.AnnouncePriority.HIGH)
                ? constants_1.NODE_TYPE.SUPER
                : ((this.watchOptions?.priority === peer_discovery_manager_2.AnnouncePriority.LOW)
                    ? constants_1.NODE_TYPE.LIGHT
                    : constants_1.NODE_TYPE.STANDARD);
            this.peerDiscoveryManager = new peer_discovery_manager_1.PeerDiscoveryManager({
                nodeType,
                announcePort,
                enablePersistence: true,
                persistenceDir: path.join(os.tmpdir(), `dig-host-${this.hostId}`),
                dhtOptions: this.dhtOptions // Pass the DHT options including shard prefixes
            });
            await this.peerDiscoveryManager.start(announcePort);
            debug(`Peer discovery manager started on port ${announcePort}`);
        }
        // Initialize directory watcher if configured
        if (this.watchDir && this.watchOptions && this.peerDiscoveryManager) {
            await this._startDirectoryWatcher();
        }
    }
    /**
     * Stop the file host
     */
    async stop() {
        if (!this.isRunning) {
            debug('Host not running');
            return;
        }
        debug('Stopping file host');
        this.isRunning = false;
        // Stop directory watcher if running
        if (this.directoryWatcher) {
            await this.directoryWatcher.stop();
            this.directoryWatcher = null;
        }
        // Stop peer discovery manager if running
        if (this.peerDiscoveryManager) {
            await this.peerDiscoveryManager.stop();
            this.peerDiscoveryManager = null;
        }
        // Close all active connections
        for (const connection of this.activeConnections.values()) {
            connection.close();
        }
        this.activeConnections.clear();
        // Close TCP server if it exists
        if (this.tcpServer) {
            this.tcpServer.close();
            this.tcpServer = null;
        }
        // Close UDP socket if it exists
        if (this.udpSocket) {
            this.udpSocket.close();
            this.udpSocket = null;
        }
        // Remove port mappings if they exist
        if (this.enableNATPMP && this.portMappings.length > 0) {
            debug('Removing port mappings');
            for (const mapping of this.portMappings) {
                try {
                    await (0, utils_1.deletePortMapping)({
                        externalPort: mapping.externalPort,
                        protocol: mapping.protocol
                    });
                    debug(`Removed port mapping for ${mapping.protocol} port ${mapping.externalPort}`);
                }
                catch (err) {
                    debug(`Error removing port mapping: ${err.message}`);
                }
            }
            this.portMappings = [];
        }
        // Unregister host from Gun
        this.gun.get('hosts').get(this.hostId).put(null);
        debug('Host unregistered');
    }
    /**
     * Start the directory watcher
     */
    async _startDirectoryWatcher() {
        if (!this.watchDir || !this.watchOptions || !this.peerDiscoveryManager) {
            debug('Cannot start directory watcher - missing configuration');
            return;
        }
        try {
            // Create directory watcher
            this.directoryWatcher = new directory_watcher_1.DirectoryWatcher({
                directory: this.watchDir,
                recursive: this.watchOptions.recursive,
                includeExtensions: this.watchOptions.includeExtensions,
                excludeExtensions: this.watchOptions.excludeExtensions,
                maxFileSize: this.watchOptions.maxFileSize,
                persistHashes: this.watchOptions.persistHashes,
                persistenceDir: path.join(os.tmpdir(), `dig-host-${this.hostId}`)
            });
            // Handle file discovery events
            this.directoryWatcher.on('file:discovered', async (event) => {
                const { hash, filePath, size } = event;
                debug(`Discovered file: ${filePath} (${hash}) - ${size} bytes`);
                // Announce the file if not already announced
                if (!this.announcedFiles.has(hash) && this.peerDiscoveryManager) {
                    await this.peerDiscoveryManager.addInfoHash(hash, this.watchOptions.priority);
                    this.announcedFiles.set(hash, true);
                    debug(`Announced file: ${filePath} with hash ${hash}`);
                }
            });
            // Handle file removal events
            this.directoryWatcher.on('file:removed', async (event) => {
                const { hash, filePath } = event;
                debug(`Removed file: ${filePath} (${hash})`);
                // Stop announcing the file
                if (this.announcedFiles.has(hash) && this.peerDiscoveryManager) {
                    await this.peerDiscoveryManager.removeInfoHash(hash);
                    this.announcedFiles.delete(hash);
                    debug(`Stopped announcing file: ${filePath} with hash ${hash}`);
                }
            });
            // Start watching
            await this.directoryWatcher.start();
            debug(`Directory watcher started for ${this.watchDir}`);
            // Get currently tracked files and announce them
            const trackedFiles = this.directoryWatcher.getTrackedFiles();
            debug(`Found ${trackedFiles.size} existing files to announce`);
            for (const [filePath, hash] of trackedFiles.entries()) {
                if (!this.announcedFiles.has(hash) && this.peerDiscoveryManager) {
                    await this.peerDiscoveryManager.addInfoHash(hash, this.watchOptions.priority);
                    this.announcedFiles.set(hash, true);
                    debug(`Announced existing file: ${filePath} with hash ${hash}`);
                }
            }
        }
        catch (error) {
            debug(`Error starting directory watcher: ${error}`);
        }
    }
    /**
     * Get all local IP addresses
     * @returns Array of local IP addresses
     */
    _getLocalIPAddresses() {
        const interfaces = os.networkInterfaces();
        const addresses = { v4: [], v6: [] };
        // Iterate through network interfaces
        for (const name in interfaces) {
            const networkInterface = interfaces[name];
            if (!networkInterface)
                continue;
            // Get IPv4 addresses that are not internal
            for (const iface of networkInterface) {
                // Support both string and number for the family property
                // Different Node.js versions might return different types
                const family = iface.family;
                if ((typeof family === 'string' && family === 'IPv4') ||
                    (typeof family === 'number' && family === 4)) {
                    if (!iface.internal) {
                        addresses.v4.push(iface.address);
                    }
                }
            }
            // Get IPv6 addresses that are not internal
            for (const iface of networkInterface) {
                // Support both string and number for the family property
                // Different Node.js versions might return different types
                const family = iface.family;
                if ((typeof family === 'string' && family === 'IPv6') ||
                    (typeof family === 'number' && family === 6)) {
                    if (!iface.internal) {
                        addresses.v6.push(iface.address);
                    }
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
            // Create a TCP server that can handle both IPv4 and IPv6
            this.tcpServer = net.createServer();
            this.tcpServer.on('error', (err) => {
                debug(`TCP server error: ${err}`);
                reject(err);
            });
            this.tcpServer.on('connection', (socket) => {
                this._handleTCPConnection(socket);
            });
            // Listen on :: address to bind to all interfaces (both IPv4 and IPv6)
            this.tcpServer.listen(this.tcpPort, '::', async () => {
                const address = this.tcpServer?.address();
                this.tcpPort = address.port;
                debug(`TCP server listening on [::]:${this.tcpPort} (IPv4/IPv6 dual-stack)`);
                // Create port mapping if NAT-PMP/PCP is enabled (for IPv4 only)
                if (this.enableNATPMP) {
                    try {
                        const result = await (0, utils_1.createPortMapping)({
                            internalPort: this.tcpPort,
                            protocol: 'TCP',
                            lifetime: this.portMappingLifetime
                        });
                        if (result.success) {
                            debug(`Created TCP port mapping: internal ${this.tcpPort} -> external ${result.externalPort}`);
                            // Store the external IP address if available
                            if (result.externalAddress) {
                                this.externalIPv4 = result.externalAddress;
                                debug(`External IPv4 address: ${this.externalIPv4}`);
                            }
                            // Add to connection options with external port (IPv4)
                            this.connectionOptions.push({
                                type: constants_1.CONNECTION_TYPE.TCP,
                                address: result.externalAddress || undefined,
                                port: result.externalPort
                            });
                            // Store the mapping for cleanup
                            if (result.externalPort) {
                                this.portMappings.push({
                                    protocol: 'TCP',
                                    externalPort: result.externalPort
                                });
                            }
                        }
                        else {
                            debug(`Failed to create TCP port mapping: ${result.error}`);
                            // Fall back to local port
                            this._addLocalConnectionOptions();
                        }
                    }
                    catch (err) {
                        debug(`Error creating TCP port mapping: ${err.message}`);
                        // Fall back to local port
                        this._addLocalConnectionOptions();
                    }
                }
                else {
                    // Just use local port if NAT-PMP/PCP is disabled
                    this._addLocalConnectionOptions();
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
            // Create a dual-stack UDP socket that supports both IPv4 and IPv6
            // Using udp6 with appropriate socket options enables dual-stack mode
            this.udpSocket = dgram.createSocket({
                type: 'udp6', // Use IPv6 UDP socket
                ipv6Only: false, // Enable dual-stack mode
                reuseAddr: true // Allow address reuse
            });
            this.udpSocket.on('error', (err) => {
                debug(`UDP socket error: ${err}`);
                reject(err);
            });
            this.udpSocket.on('message', (msg, rinfo) => {
                this._handleUDPMessage(msg, rinfo);
            });
            // Bind to :: to listen on all interfaces (both IPv4 and IPv6)
            this.udpSocket.bind(this.udpPort, '::', async () => {
                this.udpPort = this.udpSocket?.address().port || 0;
                debug(`UDP socket listening on [::]:${this.udpPort} (IPv4/IPv6 dual-stack)`);
                // Create port mapping if NAT-PMP/PCP is enabled (for IPv4 only)
                if (this.enableNATPMP) {
                    try {
                        const result = await (0, utils_1.createPortMapping)({
                            internalPort: this.udpPort,
                            protocol: 'UDP',
                            lifetime: this.portMappingLifetime
                        });
                        if (result.success) {
                            debug(`Created UDP port mapping: internal ${this.udpPort} -> external ${result.externalPort}`);
                            // Store the external IP address if available
                            if (result.externalAddress && !this.externalIPv4) {
                                this.externalIPv4 = result.externalAddress;
                                debug(`External IPv4 address: ${this.externalIPv4}`);
                            }
                            // Add to connection options with external port (IPv4)
                            this.connectionOptions.push({
                                type: constants_1.CONNECTION_TYPE.UDP,
                                address: result.externalAddress || undefined,
                                port: result.externalPort
                            });
                            // Store the mapping for cleanup
                            if (result.externalPort) {
                                this.portMappings.push({
                                    protocol: 'UDP',
                                    externalPort: result.externalPort
                                });
                            }
                        }
                        else {
                            debug(`Failed to create UDP port mapping: ${result.error}`);
                            // Fall back to local port
                            this._addLocalUDPConnectionOptions();
                        }
                    }
                    catch (err) {
                        debug(`Error creating UDP port mapping: ${err.message}`);
                        // Fall back to local port
                        this._addLocalUDPConnectionOptions();
                    }
                }
                else {
                    // Just use local port if NAT-PMP/PCP is disabled
                    this._addLocalUDPConnectionOptions();
                }
                resolve();
            });
        });
    }
    /**
     * Add local connection options for TCP (both IPv4 and IPv6)
     * @private
     */
    _addLocalConnectionOptions() {
        // Get all local IP addresses, including both IPv4 and IPv6
        const localIPs = this._getLocalIPAddresses();
        // Add IPv4 addresses
        for (const ip of localIPs.v4) {
            this.connectionOptions.push({
                type: constants_1.CONNECTION_TYPE.TCP,
                address: ip,
                port: this.tcpPort
            });
        }
        // Add IPv6 addresses
        for (const ip of localIPs.v6) {
            this.connectionOptions.push({
                type: constants_1.CONNECTION_TYPE.IPV6, // Use IPv6-specific connection type
                address: ip,
                port: this.tcpPort
            });
        }
    }
    /**
     * Add local connection options for UDP (both IPv4 and IPv6)
     * @private
     */
    _addLocalUDPConnectionOptions() {
        // Get all local IP addresses, including both IPv4 and IPv6
        const localIPs = this._getLocalIPAddresses();
        // Add IPv4 addresses
        for (const ip of localIPs.v4) {
            this.connectionOptions.push({
                type: constants_1.CONNECTION_TYPE.UDP,
                address: ip,
                port: this.udpPort
            });
        }
        // Add IPv6 addresses
        for (const ip of localIPs.v6) {
            this.connectionOptions.push({
                type: constants_1.CONNECTION_TYPE.IPV6, // Use IPv6-specific connection type for UDP over IPv6
                address: ip,
                port: this.udpPort
            });
        }
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
                // Create GUN connection if it doesn't exist yet
                const clientId = message.clientId;
                if (clientId && !this.activeConnections.has(`gun:${clientId}`)) {
                    const gunConnection = this._createGunConnection(clientId);
                    this.activeConnections.set(`gun:${clientId}`, gunConnection);
                }
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
        if (!this.enableWebRTC || !dc)
            return;
        const { clientId, signal } = message;
        // If we don't have a peer connection for this client yet, create one
        if (!this.webrtcPeerConnections.has(clientId)) {
            debug(`Creating new WebRTC peer connection for ${clientId}`);
            // Configure the peer connection
            const config = {
                iceServers: this.stunServers
            };
            // Use any type for node-datachannel
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
            // Use any for DataChannel for now
            peer.onDataChannel((channel) => {
                debug(`New data channel from ${clientId}`);
                // Create WebRTC connection object when data channel is established
                const webrtcConnection = this._createWebRTCConnection(clientId, peer, channel);
                this.activeConnections.set(`webrtc:${clientId}`, webrtcConnection);
                // Store data channel for direct access if needed
                this.webrtcDataChannels.set(clientId, channel);
                channel.onMessage((msg) => {
                    if (typeof msg === 'string') {
                        try {
                            const data = JSON.parse(msg);
                            this._handleIncomingMessage(data, `webrtc:${clientId}`, constants_1.CONNECTION_TYPE.WEBRTC);
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
                    this.webrtcDataChannels.delete(clientId);
                    this.activeConnections.delete(`webrtc:${clientId}`);
                });
            });
            // Store peer connection for direct access if needed
            this.webrtcPeerConnections.set(clientId, peer);
        }
        const peer = this.webrtcPeerConnections.get(clientId);
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
            // Use sha256 as the contentId initially - in a full implementation, 
            // we might have a reverse lookup from sha256 to contentId
            const contentId = sha256;
            // Get the first chunk to determine if file exists and get its size
            const firstChunk = await this.getFileChunks(contentId, 0);
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
                lastChunk = await this.getFileChunks(contentId, chunkIndex);
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
            // Use sha256 as the contentId initially - in a full implementation, 
            // we might have a reverse lookup from sha256 to contentId
            const contentId = sha256;
            // Get the requested chunk
            const chunks = await this.getFileChunks(contentId, startChunk);
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
        // Get connection object based on connection type prefix
        let connectionIdPrefix = clientId;
        // Adjust client ID for non-Gun connections which might have prefixes
        if (connectionType === constants_1.CONNECTION_TYPE.WEBRTC && !clientId.startsWith('webrtc:')) {
            connectionIdPrefix = `webrtc:${clientId}`;
        }
        else if (connectionType === constants_1.CONNECTION_TYPE.GUN && !clientId.startsWith('gun:')) {
            connectionIdPrefix = `gun:${clientId}`;
        }
        // Get connection object
        const connection = this.activeConnections.get(connectionIdPrefix);
        if (connection) {
            // If we have a proper connection object, use it to send the response
            connection.send(response.type, response);
        }
        else {
            // Fall back to direct sending methods if no connection object is available
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
    }
    /**
     * Create a TCP connection object
     * @param clientId - Client identifier
     * @param socket - TCP socket
     * @returns TCP connection object
     */
    _createTCPConnection(clientId, socket) {
        const connection = {
            type: constants_1.CONNECTION_TYPE.TCP,
            clientId,
            socket,
            messageHandlers: new Map(),
            send: (messageType, data) => {
                try {
                    const message = JSON.stringify(data);
                    socket.write(message);
                }
                catch (err) {
                    debug(`Error sending TCP message: ${err}`);
                }
            },
            on: (messageType, handler) => {
                connection.messageHandlers.set(messageType, handler);
            },
            close: () => {
                socket.destroy();
                this.tcpSockets.delete(clientId);
                this.activeConnections.delete(clientId);
            }
        };
        return connection;
    }
    /**
     * Create a UDP connection object
     * @param clientId - Client identifier
     * @param remoteAddress - Remote address
     * @param remotePort - Remote port
     * @returns UDP connection object
     */
    _createUDPConnection(clientId, remoteAddress, remotePort) {
        const connection = {
            type: constants_1.CONNECTION_TYPE.UDP,
            clientId,
            remoteAddress,
            remotePort,
            messageHandlers: new Map(),
            send: (messageType, data) => {
                if (!this.udpSocket) {
                    debug('UDP socket not initialized');
                    return;
                }
                try {
                    const message = JSON.stringify(data);
                    this.udpSocket.send(message, remotePort, remoteAddress);
                }
                catch (err) {
                    debug(`Error sending UDP message: ${err}`);
                }
            },
            on: (messageType, handler) => {
                connection.messageHandlers.set(messageType, handler);
            },
            close: () => {
                this.udpClients.delete(clientId);
                this.activeConnections.delete(clientId);
            }
        };
        return connection;
    }
    /**
     * Create a WebRTC connection object
     * @param clientId - Client identifier
     * @param peerConnection - WebRTC peer connection
     * @param dataChannel - WebRTC data channel
     * @returns WebRTC connection object
     */
    _createWebRTCConnection(clientId, peerConnection, dataChannel) {
        const connection = {
            type: constants_1.CONNECTION_TYPE.WEBRTC,
            clientId,
            peerConnection,
            dataChannel,
            messageHandlers: new Map(),
            send: (messageType, data) => {
                try {
                    const message = JSON.stringify(data);
                    dataChannel.sendMessage(message);
                }
                catch (err) {
                    debug(`Error sending WebRTC message: ${err}`);
                }
            },
            on: (messageType, handler) => {
                connection.messageHandlers.set(messageType, handler);
            },
            close: () => {
                if (dataChannel) {
                    dataChannel.close();
                }
                if (peerConnection) {
                    peerConnection.close();
                }
                this.webrtcDataChannels.delete(clientId);
                this.webrtcPeerConnections.delete(clientId);
                this.activeConnections.delete(`webrtc:${clientId}`);
            }
        };
        return connection;
    }
    /**
     * Create a Gun relay connection object
     * @param clientId - Client identifier
     * @returns Gun relay connection object
     */
    _createGunConnection(clientId) {
        const connection = {
            type: constants_1.CONNECTION_TYPE.GUN,
            clientId,
            messageHandlers: new Map(),
            send: (messageType, data) => {
                // Note: For Gun, the actual message sending is done in _sendGunResponse
                // because it needs the message ID, which isn't known here
                // This is just a placeholder
                debug(`(Gun send placeholder) Sending ${messageType} to ${clientId}`);
            },
            on: (messageType, handler) => {
                connection.messageHandlers.set(messageType, handler);
            },
            close: () => {
                this.activeConnections.delete(`gun:${clientId}`);
            }
        };
        return connection;
    }
    /**
     * Send TCP response (fallback method)
     */
    _sendTCPResponse(response, clientId) {
        const socket = this.tcpSockets.get(clientId);
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
     * Send UDP response (fallback method)
     */
    _sendUDPResponse(response, clientId) {
        const client = this.udpClients.get(clientId);
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
     * Send WebRTC response (fallback method)
     */
    _sendWebRTCResponse(response, clientId) {
        const dataChannel = this.webrtcDataChannels.get(clientId);
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
     * Send Gun relay response (fallback method)
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
    /**
     * Handle a new TCP connection
     * @param socket The TCP socket
     */
    _handleTCPConnection(socket) {
        const clientId = `${socket.remoteAddress}:${socket.remotePort}`;
        debug(`New TCP connection from ${clientId}`);
        // Store socket for direct access if needed
        this.tcpSockets.set(clientId, socket);
        // Create TCP connection object
        const tcpConnection = this._createTCPConnection(clientId, socket);
        // Store connection
        this.activeConnections.set(clientId, tcpConnection);
        socket.on('data', (data) => {
            // Handle incoming TCP data
            this._handleIncomingMessage(data, clientId, constants_1.CONNECTION_TYPE.TCP);
        });
        socket.on('error', (err) => {
            debug(`TCP socket error for ${clientId}: ${err.message}`);
            this.tcpSockets.delete(clientId);
            this.activeConnections.delete(clientId);
        });
        socket.on('close', () => {
            debug(`TCP connection closed for ${clientId}`);
            this.tcpSockets.delete(clientId);
            this.activeConnections.delete(clientId);
        });
    }
    /**
     * Handle an incoming UDP message
     * @param msg The UDP message
     * @param rinfo The remote info (address and port)
     */
    _handleUDPMessage(msg, rinfo) {
        const clientId = `${rinfo.address}:${rinfo.port}`;
        debug(`Received UDP message from ${clientId}`);
        // Store client info for direct access if needed
        this.udpClients.set(clientId, {
            address: rinfo.address,
            port: rinfo.port
        });
        // Create UDP connection if it doesn't exist yet
        if (!this.activeConnections.has(clientId)) {
            const udpConnection = this._createUDPConnection(clientId, rinfo.address, rinfo.port);
            this.activeConnections.set(clientId, udpConnection);
        }
        // Handle incoming UDP data
        this._handleIncomingMessage(msg, clientId, constants_1.CONNECTION_TYPE.UDP);
    }
    /**
     * Record a contribution from a peer (upload or other useful activity)
     * @param peerId - ID of the peer
     * @param bytes - Number of bytes contributed
     */
    recordPeerContribution(peerId, bytes) {
        const currentContribution = this._peerContributions.get(peerId) || 0;
        this._peerContributions.set(peerId, currentContribution + bytes);
        // If the peer is choked but has contributed enough, consider unchoking
        if (this._chokedPeers.has(peerId) && bytes > 0) {
            this._considerUnchokingPeer(peerId);
        }
    }
    /**
     * Update the choked status of peers based on their contributions
     * This implements a tit-for-tat strategy to incentivize uploads
     */
    _updatePeerChoking() {
        const now = Date.now();
        // Only update every _chokeUpdateInterval milliseconds
        if (now - this._lastChokeUpdateTime < this._chokeUpdateInterval) {
            return;
        }
        this._lastChokeUpdateTime = now;
        // Sort peers by their contribution
        const peersByContribution = Array.from(this._peerContributions.entries())
            .sort(([, contribA], [, contribB]) => contribB - contribA);
        // In super seed mode, we handle things differently
        if (this._superSeedMode) {
            this._updateChokingForSuperSeed(peersByContribution);
            return;
        }
        // Determine which peers to unchoke
        const peersToUnchoke = new Set();
        // Top contributors get unchoked (minus one slot for optimistic unchoking)
        const topCount = Math.max(1, this._maxUnchokedPeers - 1);
        peersByContribution.slice(0, topCount).forEach(([peerId]) => {
            peersToUnchoke.add(peerId);
        });
        // Reserve one slot for optimistic unchoking
        const remainingPeers = peersByContribution
            .slice(topCount)
            .map(([peerId]) => peerId)
            .filter(peerId => this._chokedPeers.has(peerId));
        if (remainingPeers.length > 0) {
            // Randomly select one peer for optimistic unchoking
            const randomIndex = Math.floor(Math.random() * remainingPeers.length);
            const optimisticPeer = remainingPeers[randomIndex];
            peersToUnchoke.add(optimisticPeer);
            debug(`Optimistically unchoking peer ${optimisticPeer}`);
        }
        // Apply the new choke/unchoke status
        for (const [peerId] of peersByContribution) {
            if (peersToUnchoke.has(peerId)) {
                if (this._chokedPeers.has(peerId)) {
                    this._unchokePeer(peerId);
                }
            }
            else {
                if (!this._chokedPeers.has(peerId)) {
                    this._chokePeer(peerId);
                }
            }
        }
        debug(`Updated peer choking: ${this._chokedPeers.size} choked, ${peersToUnchoke.size} unchoked`);
    }
    /**
     * Special choking algorithm for super seed mode
     * In super seed mode, we want to:
     * 1. Ensure each peer gets unique pieces to spread them around
     * 2. Prioritize peers that share pieces with others
     * 3. Cycle through peers to ensure wide distribution
     */
    _updateChokingForSuperSeed(peersByContribution) {
        // In super seed mode we work differently:
        // - We unchoke peers that don't have any of our pieces yet
        // - Once they download a piece, we choke them and unchoke someone else
        const peersToUnchoke = new Set();
        // Find peers that haven't downloaded anything yet
        const newPeers = peersByContribution
            .filter(([peerId, contribution]) => contribution === 0)
            .map(([peerId]) => peerId);
        // Find peers that have downloaded something and shared it
        const sharingPeers = peersByContribution
            .filter(([peerId, contribution]) => contribution > 0)
            .map(([peerId]) => peerId);
        // Blend the two groups, prioritizing new peers but keeping some sharing peers
        // This ensures both piece distribution and continuing distribution
        for (let i = 0; i < this._maxUnchokedPeers; i++) {
            if (i < Math.ceil(this._maxUnchokedPeers / 2) && i < newPeers.length) {
                // First half slots reserved for new peers
                peersToUnchoke.add(newPeers[i]);
            }
            else if (sharingPeers.length > 0) {
                // Remaining slots for sharing peers
                const index = i % sharingPeers.length;
                peersToUnchoke.add(sharingPeers[index]);
            }
        }
        // Apply the choking
        for (const [peerId] of peersByContribution) {
            if (peersToUnchoke.has(peerId)) {
                if (this._chokedPeers.has(peerId)) {
                    this._unchokePeer(peerId);
                }
            }
            else {
                if (!this._chokedPeers.has(peerId)) {
                    this._chokePeer(peerId);
                }
            }
        }
    }
    /**
     * Consider unchoking a peer that has recently contributed
     * @private
     * @param peerId - ID of the peer to potentially unchoke
     */
    _considerUnchokingPeer(peerId) {
        // If we already have max unchoked peers, don't do anything
        const unchokedCount = this._peerContributions.size - this._chokedPeers.size;
        if (unchokedCount >= this._maxUnchokedPeers) {
            return;
        }
        // Otherwise, unchoke this peer if it's currently choked
        if (this._chokedPeers.has(peerId)) {
            this._unchokePeer(peerId);
        }
    }
    /**
     * Choke a peer (restrict their download speed)
     * @private
     * @param peerId - ID of the peer to choke
     */
    _chokePeer(peerId) {
        if (this._chokedPeers.has(peerId))
            return;
        this._chokedPeers.add(peerId);
        debug(`Choking peer ${peerId}`);
        // Notify the peer they are choked if we have a connection
        this._sendChokeToPeer(peerId, true);
    }
    /**
     * Unchoke a peer (allow normal download speed)
     * @private
     * @param peerId - ID of the peer to unchoke
     */
    _unchokePeer(peerId) {
        if (!this._chokedPeers.has(peerId))
            return;
        this._chokedPeers.delete(peerId);
        debug(`Unchoking peer ${peerId}`);
        // Notify the peer they are unchoked if we have a connection
        this._sendChokeToPeer(peerId, false);
    }
    /**
     * Send a choke or unchoke message to a peer
     * @private
     * @param peerId - ID of the peer
     * @param choked - Whether the peer is choked
     */
    _sendChokeToPeer(peerId, choked) {
        // This is a placeholder - you would implement based on your connection system
        // It should send a message to the peer indicating their choke status
        // Example:
        //    if (this.connections.has(peerId)) {
        //      const connection = this.connections.get(peerId);
        //      connection.send(choked ? 'choke' : 'unchoke', {});
        //    }
        debug(`Sent ${choked ? 'choke' : 'unchoke'} message to peer ${peerId}`);
    }
    /**
     * Check if a peer is currently choked
     * @param peerId - ID of the peer
     * @returns true if the peer is choked, false otherwise
     */
    isPeerChoked(peerId) {
        return this._chokedPeers.has(peerId);
    }
    /**
     * Enable super seed mode for efficient initial file distribution
     * In super seed mode, this node will:
     * 1. Only send each peer very limited pieces
     * 2. Unchoke peers in a pattern that maximizes piece distribution
     * 3. Focus on new peers to ensure wide distribution
     * @param enable - Whether to enable or disable super seed mode
     */
    enableSuperSeedMode(enable = true) {
        this._superSeedMode = enable;
        debug(`Super seed mode ${enable ? 'enabled' : 'disabled'}`);
        // Force a choking update
        this._lastChokeUpdateTime = 0;
        this._updatePeerChoking();
    }
    /**
     * Get the DHT shard prefixes used by this host
     * @returns Array of shard prefixes or empty array if DHT sharding is not enabled
     */
    getShardPrefixes() {
        return this.dhtOptions?.shardPrefixes || [];
    }
    /**
     * Add a content ID to SHA-256 hash mapping
     * @param contentId - Content identifier
     * @param sha256 - SHA-256 hash of the content
     */
    addContentMapping(contentId, sha256) {
        debug(`Adding content mapping: ${contentId} -> ${sha256}`);
        this.contentHashMap.set(contentId, sha256);
        // If we have a peer discovery manager, also add the mapping there for consistency
        if (this.peerDiscoveryManager && typeof this.peerDiscoveryManager.addContentMapping === 'function') {
            this.peerDiscoveryManager.addContentMapping(contentId, sha256);
        }
    }
    /**
     * Get SHA-256 hash for a content ID
     * @param contentId - Content identifier
     * @returns SHA-256 hash or undefined if not found
     */
    getHashForContent(contentId) {
        // First check our local map
        const hash = this.contentHashMap.get(contentId);
        if (hash) {
            return hash;
        }
        // If not found locally, check the discovery manager if available
        if (this.peerDiscoveryManager && typeof this.peerDiscoveryManager.getHashForContent === 'function') {
            return this.peerDiscoveryManager.getHashForContent(contentId);
        }
        return undefined;
    }
    /**
     * Get content ID for a SHA-256 hash (reverse lookup)
     * @param sha256 - SHA-256 hash
     * @returns Content ID or undefined if not found
     */
    getContentForHash(sha256) {
        // Check our local map first with a reverse lookup
        for (const [contentId, hash] of this.contentHashMap.entries()) {
            if (hash === sha256) {
                return contentId;
            }
        }
        // If not found locally, check the discovery manager if available
        if (this.peerDiscoveryManager && typeof this.peerDiscoveryManager.getContentForHash === 'function') {
            return this.peerDiscoveryManager.getContentForHash(sha256);
        }
        return undefined;
    }
    /**
     * Update methods that call hostFileCallback to use contentId and pass sha256 as needed
     * @param contentId - Content identifier for the file
     * @param startChunk - Starting chunk index
     * @returns Promise resolving to array of buffers for the chunks or null
     */
    async getFileChunks(contentId, startChunk) {
        // Try to get the verification hash if it exists
        const sha256 = this.getHashForContent(contentId);
        // If contentId looks like a hash (and we don't have a mapping), it might be the hash itself
        if (!sha256 && contentId.length >= 40) {
            debug(`No mapping found for ${contentId}, using it directly as both contentId and hash`);
            return this.hostFileCallback(contentId, startChunk, this.chunkSize, contentId);
        }
        // If we have a mapping, pass both contentId and sha256 to the callback
        if (sha256) {
            debug(`Found hash ${sha256} for contentId ${contentId}, using both in callback`);
            return this.hostFileCallback(contentId, startChunk, this.chunkSize, sha256);
        }
        // Fall back to just using contentId
        debug(`No hash found for contentId ${contentId}, using only contentId in callback`);
        return this.hostFileCallback(contentId, startChunk, this.chunkSize);
    }
}
exports.default = FileHost;
//# sourceMappingURL=host.js.map
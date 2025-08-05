/**
 * Common connection types for the Dig NAT Tools system
 */

import type * as net from 'net';
import type * as dgram from 'dgram';
import type { FileHandle } from 'fs/promises';
import type { Hash } from 'crypto';
import type { CONNECTION_TYPE } from './constants';
import type { PeerConnection, DataChannel } from 'node-datachannel';

/**
 * Gun types
 */
export interface GunInstance {
  get(key: string): GunChain;
}

export interface GunChain {
  get(key: string): GunChain;
  set(data: unknown): void;
  put(data: unknown): void;
  on(callback: (data: unknown, key: string) => void): void;
  off(): void;
}

/**
 * WebRTC types
 */
export interface RTCPeerConnection {
  createOffer(): Promise<RTCSessionDescription>;
  createAnswer(): Promise<RTCSessionDescription>;
  setLocalDescription(description: RTCSessionDescription): Promise<void>;
  setRemoteDescription(description: RTCSessionDescription): Promise<void>;
  addIceCandidate(candidate: RTCIceCandidate): Promise<void>;
  close(): void;
  onicecandidate: ((event: { candidate: RTCIceCandidate }) => void) | null;
  ondatachannel: ((event: { channel: RTCDataChannel }) => void) | null;
  createDataChannel(label: string, options?: RTCDataChannelInit): RTCDataChannel;
}

export interface RTCSessionDescription {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp: string;
}

export interface RTCIceCandidate {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment: string | null;
}

export interface RTCDataChannelInit {
  ordered?: boolean;
  maxPacketLifeTime?: number;
  maxRetransmits?: number;
  protocol?: string;
  negotiated?: boolean;
  id?: number;
  priority?: 'very-low' | 'low' | 'medium' | 'high';
}

export interface RTCDataChannel {
  label: string;
  ordered: boolean;
  maxPacketLifeTime: number | null;
  maxRetransmits: number | null;
  protocol: string;
  negotiated: boolean;
  id: number | null;
  priority: string;
  readyState: 'connecting' | 'open' | 'closing' | 'closed';
  bufferedAmount: number;
  bufferedAmountLowThreshold: number;
  onopen: ((event: Event) => void) | null;
  onclose: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  close(): void;
  send(data: string | Blob | ArrayBuffer | ArrayBufferView): void;
}

/**
 * Message data type
 */
export interface MessageData {
  [key: string]: unknown;
}

/**
 * Interface for a message handler function
 */
export interface MessageHandler {
  (data: unknown): void;
}

/**
 * Interface for a client message handler map
 */
export interface ClientMessageHandlerMap extends Map<string, MessageHandler[]> {}

/**
 * Base interface for a connection object
 */
export interface Connection {
  /** Type of connection */
  type: CONNECTION_TYPE;
  /** Client identifier */
  clientId: string;
  /** Map of message type to handler */
  messageHandlers: Map<string, MessageHandler>;
  /** Send a message */
  send: (messageType: string, data: unknown) => void | Promise<void>;
  /** Register a message handler */
  on: (messageType: string, handler: MessageHandler) => void;
  /** Close the connection */
  close: () => void;
  /** Remove a message handler */
  removeListener?: (messageType: string, handler: MessageHandler) => void;
}

/**
 * Interface for TCP connection
 */
export interface TCPConnection extends Connection {
  /** TCP socket */
  socket: net.Socket;
}

/**
 * Interface for UDP connection
 */
export interface UDPConnection extends Connection {
  /** Remote address */
  remoteAddress: string;
  /** Remote port */
  remotePort: number;
  /** UDP socket */
  socket: dgram.Socket;
}

/**
 * Interface for WebRTC connection
 */
export interface WebRTCConnection extends Connection {
  /** WebRTC peer connection */
  peerConnection: PeerConnection;
  /** WebRTC data channel */
  dataChannel: DataChannel;
}

/**
 * Interface for Gun relay connection
 */
export interface GunRelayConnection extends Connection {
  // No additional properties needed
}

/**
 * Interface for WebRTC connection info
 */
export interface WebRTCConnectionInfo {
  /** Client identifier */
  clientId: string;
  /** Request identifier */
  requestId: string;
  /** WebRTC peer connection */
  peerConnection: PeerConnection;
  /** WebRTC data channel */
  dataChannel: DataChannel | null;
}

/**
 * Active download tracking interface
 */
export interface ActiveDownload {
  hostId: string;
  sha256: string;
  savePath: string;
  connection: Connection;
  fileHandle: FileHandle | null;
  receivedChunks: Set<number>;
  totalChunks: number;
  totalBytes: number;
  receivedBytes: number;
  chunkSize: number;
  onProgress?: (receivedBytes: number, totalBytes: number) => void;
  aborted: boolean;
  hashCalculator: Hash;
  portMappings: { protocol: 'TCP' | 'UDP', externalPort: number }[];
}

/**
 * Client connection options
 */
export interface ClientConnectionOptions {
  type: CONNECTION_TYPE;
  address?: string;
  port?: number;
}

/**
 * ICE connection result
 */
export interface ICEResult {
  success: boolean;
  connectionType: CONNECTION_TYPE.ICE;
  socket?: dgram.Socket | net.Socket;
  localCandidate?: ICECandidate;
  remoteCandidate?: ICECandidate;
  error?: string;
}

/**
 * ICE candidate types
 */
export enum ICECandidateType {
  HOST = 'host',         // Local address
  SRFLX = 'srflx',       // Server reflexive (from STUN)
  PRFLX = 'prflx',       // Peer reflexive (from peer)
  RELAY = 'relay'        // Relayed address (from TURN)
}

/**
 * ICE candidate
 */
export interface ICECandidate {
  type: ICECandidateType;
  protocol: 'udp' | 'tcp';
  address: string;
  port: number;
  priority: number;
  foundation: string;     // Identifier for the source of this candidate
  relatedAddress?: string; // Related address for reflexive/relay candidates
  relatedPort?: number;    // Related port for reflexive/relay candidates
  tcpType?: 'active' | 'passive' | 'so'; // For TCP candidates
}

/**
 * ICE options
 */
export interface ICEOptions {
  stunServers?: string[]; // Array of STUN server URLs
  turnServer?: string;    // TURN server URL
  turnUsername?: string;  // TURN server username
  turnCredential?: string; // TURN server credential
  localPort?: number;     // Local UDP port to bind to
  localPorts?: number[];  // Array of local ports to try binding to
  useIPv6?: boolean;      // Whether to use IPv6
  connectTimeout?: number; // Connection timeout in milliseconds
  gun: GunInstance;       // Gun.js instance for signaling
  localId: string;        // Local peer ID
  remoteId: string;       // Remote peer ID
}

/**
 * ICE message
 */
export interface ICEMessage {
  type: ICEMessageType;
  sessionId: string;
  senderId: string;
  receiverId: string;
  timestamp: number;
  candidates?: ICECandidate[];
  selectedCandidate?: ICECandidate;
  sdp?: string; // For compatibility with WebRTC
}

/**
 * ICE message types
 */
export enum ICEMessageType {
  CANDIDATE = 'candidate',
  OFFER = 'offer',
  ANSWER = 'answer',
  START = 'start',
  END = 'end',
  PING = 'ping',
  PONG = 'pong'
}

/**
 * Message types used for hole punching
 */
export enum HolePunchMessageType {
  START_PUNCH = 'start_punch',
  PUNCH_REQUEST = 'punch_request',
  PUNCH_RESPONSE = 'punch_response',
  PUNCH_ACK = 'punch_ack'
}

/**
 * Result of a hole punching operation
 */
export interface HolePunchResult {
  success: boolean;
  connectionType?: CONNECTION_TYPE;
  socket?: dgram.Socket | net.Socket;
  remoteAddress?: string;
  remotePort?: number;
  error?: string;
}

/**
 * Basic hole punching message structure
 */
export interface HolePunchMessage {
  type: HolePunchMessageType;
  punchId: string;
  senderId: string;
  receiverId: string;
  timestamp: number;
  address?: string;
  port?: number;
  data?: MessageData;
}

/**
 * Options for UDP hole punching
 */
export interface UDPHolePunchOptions {
  /** Local port to bind to (0 for random) */
  localPort?: number;
  /** Timeout for the entire punch operation */
  punchTimeout?: number;
  /** Timeout for waiting for the initial signal */
  signalTimeout?: number;
  /** Number of punch attempts to make */
  punchAttempts?: number;
  /** Gun instance for signaling */
  gun: GunInstance;
  /** Local peer ID */
  localId: string;
  /** Remote peer ID */
  remoteId: string;
}

/**
 * Options for TCP hole punching
 */
export interface TCPHolePunchOptions extends UDPHolePunchOptions {
  /** List of local ports to try binding to */
  localPorts?: number[];
}

/**
 * Options for TCP simultaneous open
 */
export interface TCPSimultaneousOpenOptions extends TCPHolePunchOptions {
  /** Timeout for SYN packet */
  synTimeout?: number;
}

/**
 * Port mapping result
 */
export interface PortMappingResult {
  success: boolean;
  externalPort?: number;
  externalAddress?: string;
  lifetime?: number;
  error?: string;
  protocol?: 'NAT-PMP' | 'PCP' | 'STUN';
  description?: string;  // Optional mapping description (supported by PCP)
}

/**
 * Network interface information (extended os.NetworkInterfaceInfo)
 */
export interface NetworkInterfaceInfo {
  address: string;
  netmask: string;
  family: string | number;
  mac: string;
  internal: boolean;
  cidr: string | null;
  scopeid?: number;
} 
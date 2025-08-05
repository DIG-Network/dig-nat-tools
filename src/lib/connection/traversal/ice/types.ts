/**
 * ICE Types
 * 
 * Type definitions for Interactive Connectivity Establishment functionality.
 */

import type { SignedData } from '../../../crypto/identity';
import type { IGunInstance } from 'gun';


// WebRTC types
export type RTCIceCredentialType = 'password' | 'oauth';
export type RTCBundlePolicy = 'balanced' | 'max-bundle' | 'max-compat';
export type RTCIceTransportPolicy = 'relay' | 'all';
export type RTCRtcpMuxPolicy = 'negotiate' | 'require';
export type RTCIceTcpCandidateType = 'active' | 'passive' | 'so';
export type RTCPeerConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';
export type RTCSignalingState = 'stable' | 'have-local-offer' | 'have-remote-offer' | 'have-local-pranswer' | 'have-remote-pranswer' | 'closed';

export interface RTCIceServer {
  urls: string[];
  username?: string;
  credential?: string;
  credentialType?: RTCIceCredentialType;
}

export interface RTCConfiguration {
  iceServers?: RTCIceServer[];
  iceTransportPolicy?: RTCIceTransportPolicy;
  bundlePolicy?: RTCBundlePolicy;
  rtcpMuxPolicy?: RTCRtcpMuxPolicy;
  iceCandidatePoolSize?: number;
}

// Gun types
export interface IGunChain {
  get(key: string): IGunChain;
  put(data: any, cb?: (ack: any) => void): IGunChain;
  on(cb: (data: any, key: string) => void, option?: { change: boolean }): () => void;
  off(): void;
}

export type IGun = IGunChain;

/**
 * ICE signaling options
 */
export interface ICESignalingOptions {
  gunInstance: IGunInstance;
  room?: string;
  channelPrefix?: string;
}

/**
 * ICE security options
 */
export interface ICESecurityOptions {
  allowLoopback: boolean;
  allowPrivateNetwork: boolean;
  minPort: number;
  maxPort: number;
  requireEncryption: boolean;
  validateSignature: boolean;
  channelPrefix: string;
}

/**
 * ICE connection options
 */
export interface ICEOptions {
  peerId: string;
  servers: RTCIceServer[];
  rtcConfig?: RTCConfiguration;
  trickle?: boolean;
  timeout?: number;
  preferredFamily?: 'IPv6' | 'IPv4';
  security?: ICESecurityOptions;
  signaling?: ICESignalingOptions;
  timestamp: number;
}

/**
 * ICE candidate type
 */
export enum ICECandidateType {
  HOST = 'host',
  SRFLX = 'srflx',
  PRFLX = 'prflx',
  RELAY = 'relay'
}

/**
 * ICE candidate interface
 */
export interface ICECandidate {
  type: ICECandidateType;
  address: string;
  port: number;
  protocol: 'UDP' | 'TCP';
  priority: number;
  foundation: string;
  relatedAddress?: string;
  relatedPort?: number;
  tcpType?: RTCIceTcpCandidateType;
  usernameFragment?: string;
  family?: 'IPv6' | 'IPv4';
}

/**
 * ICE signaling message payload
 */
export interface ICESignalingPayload {
  encrypted?: string;
  iv?: string;
  tag?: string;
  sdp?: string;
  candidate?: ICECandidate;
  connectionId?: string;
  [key: string]: any;
}

/**
 * ICE signaling message
 */
export interface ICESignalingMessage {
  type: 'offer' | 'answer' | 'candidate';
  from: string;
  to: string;
  timestamp: number;
  encrypted?: boolean;
  signature?: string;
  payload: ICESignalingPayload;
}

export type SignedICEMessage = SignedData<ICESignalingMessage>;

/**
 * ICE connection result
 */
export interface ICEResult {
  success: boolean;
  localCandidate?: ICECandidate;
  connection?: RTCPeerConnection;
  dataChannel?: RTCDataChannel;
  error?: string;
  details?: {
    rtt: number;
    protocol: 'UDP' | 'TCP';
    secure: boolean;
    signaling: {
      channel: string;
      latency: number;
    };
  };
}

/**
 * ICE connection state
 */
export enum ICEConnectionState {
  NEW = 'new',
  CHECKING = 'checking',
  CONNECTED = 'connected',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DISCONNECTED = 'disconnected',
  CLOSED = 'closed'
}

/**
 * ICE gathering state
 */
export enum ICEGatheringState {
  NEW = 'new',
  GATHERING = 'gathering',
  COMPLETE = 'complete'
}

/**
 * ICE events
 */
export interface ICEEvents {
  connectionState: (state: ICEConnectionState) => void;
  gatheringState: (state: ICEGatheringState) => void;
  candidate: (candidate: ICECandidate) => void;
  signaling: (message: ICESignalingMessage) => void;
  security: (warning: string) => void;
  error: (error: Error) => void;
  connected: (result: ICEResult) => void;
}

/**
 * ICE client interface
 */
export interface ICEClient {
  connect(options: ICEOptions): Promise<ICEResult>;
  close(): void;
  on<E extends keyof ICEEvents>(event: E, listener: ICEEvents[E]): void;
  off<E extends keyof ICEEvents>(event: E, listener: ICEEvents[E]): void;
} 
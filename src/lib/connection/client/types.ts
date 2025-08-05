/**
 * Client Module Types
 * 
 * Type definitions for the connection client module.
 */

import type { Socket } from 'net';
import type { Socket as DgramSocket } from 'dgram';
import type { CONNECTION_TYPE } from '../../../types/constants';
import type { PeerConnection, DataChannel } from 'node-datachannel';
import type { GunInstance } from '../../../types/gun';

/**
 * Base connection interface
 */
export interface Connection {
  id: string;
  type: CONNECTION_TYPE;
  peerId: string;
  isConnected: boolean;
  close: () => void;
  on: (event: string, handler: (...args: any[]) => void) => void;
  off: (event: string, handler: (...args: any[]) => void) => void;
}

/**
 * TCP connection interface
 */
export interface TCPConnection extends Connection {
  type: CONNECTION_TYPE.TCP;
  socket: Socket;
}

/**
 * UDP connection interface
 */
export interface UDPConnection extends Connection {
  type: CONNECTION_TYPE.UDP;
  socket: DgramSocket;
  remoteAddress: string;
  remotePort: number;
}

/**
 * WebRTC connection interface
 */
export interface WebRTCConnection extends Connection {
  type: CONNECTION_TYPE.WEBRTC;
  peerConnection: PeerConnection;
  dataChannel: DataChannel;
}

/**
 * Gun relay connection interface
 */
export interface GunRelayConnection extends Connection {
  type: CONNECTION_TYPE.GUN_RELAY;
  gun: GunInstance;
}

/**
 * Message handler type
 */
export type MessageHandler = (data: Buffer | string) => void; 
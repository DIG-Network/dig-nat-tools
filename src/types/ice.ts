/**
 * ICE protocol related types
 */

import type { Socket } from 'net';
import type { Socket as DgramSocket } from 'dgram';

/**
 * ICE candidate types as defined in RFC 5245
 */
export enum ICECandidateType {
  HOST = 'host',      // Local interface
  SRFLX = 'srflx',    // Server reflexive (from STUN)
  PRFLX = 'prflx',    // Peer reflexive (from peer)
  RELAY = 'relay'     // Relayed address (from TURN)
}

/**
 * ICE candidate information
 */
export interface ICECandidate {
  address: string;
  port: number;
  type: ICECandidateType;
  protocol: 'udp' | 'tcp';
  priority: number;
}

/**
 * Result of an ICE connection attempt
 */
export interface ICEResult {
  success: boolean;
  socket?: Socket | DgramSocket;
  localCandidate?: ICECandidate;
  remoteCandidate?: ICECandidate;
  error?: string;
} 
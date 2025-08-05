/**
 * WebRTC Types and Utilities
 * 
 * Type definitions and utility functions for WebRTC functionality.
 */

import { ICE_CONSTANTS } from './constants';
import type { 
  RTCIceServer,
  RTCConfiguration,
  RTCIceCredentialType
} from './types';

export interface RTCCertificate {
  expires: number;
  getFingerprints(): any[];
}

/**
 * WebRTC Utilities
 * 
 * Utility functions for WebRTC functionality.
 */

/**
 * Validate ICE servers configuration
 */
export function validateICEServers(servers: RTCIceServer[]): void {
  if (!Array.isArray(servers) || servers.length === 0) {
    throw new Error('ICE servers must be a non-empty array');
  }

  for (const server of servers) {
    if (!server.urls || !Array.isArray(server.urls) || server.urls.length === 0) {
      throw new Error('Each ICE server must have a non-empty urls array');
    }

    for (const url of server.urls) {
      if (!url.startsWith('stun:') && !url.startsWith('turn:') && !url.startsWith('turns:')) {
        throw new Error('Invalid ICE server URL scheme');
      }
    }

    if (server.username && typeof server.username !== 'string') {
      throw new Error('ICE server username must be a string');
    }

    if (server.credential && typeof server.credential !== 'string') {
      throw new Error('ICE server credential must be a string');
    }

    const validCredentialTypes: RTCIceCredentialType[] = ['password', 'oauth'];
    if (server.credentialType && !validCredentialTypes.includes(server.credentialType)) {
      throw new Error('Invalid ICE server credential type');
    }
  }
}

/**
 * Create secure RTCConfiguration
 */
export function createSecureRTCConfig(servers: RTCIceServer[]): RTCConfiguration {
  return {
    iceServers: servers,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceTransportPolicy: 'all',
    iceCandidatePoolSize: ICE_CONSTANTS.CANDIDATE_POOL_SIZE
  };
}

/**
 * Validate SDP
 */
export function validateSDP(sdp: string): void {
  if (!sdp || typeof sdp !== 'string') {
    throw new Error('Invalid SDP');
  }

  // Validate SDP format
  if (!sdp.includes('v=0')) {
    throw new Error('Invalid SDP format');
  }

  // Check for required fields
  if (!sdp.includes('m=')) {
    throw new Error('SDP must contain media description');
  }

  if (!sdp.includes('a=ice-ufrag:')) {
    throw new Error('SDP must contain ICE username fragment');
  }

  if (!sdp.includes('a=ice-pwd:')) {
    throw new Error('SDP must contain ICE password');
  }

  // Check for security-related fields
  if (!sdp.includes('a=fingerprint:')) {
    throw new Error('SDP must contain DTLS fingerprint');
  }

  if (!sdp.includes('a=setup:')) {
    throw new Error('SDP must contain DTLS setup attribute');
  }
}

/**
 * Create a secure data channel configuration
 */
export function createSecureDataChannelConfig(): RTCDataChannelInit {
  return {
    ordered: true,
    maxRetransmits: 0,
    maxPacketLifeTime: undefined,
    protocol: 'sctp',
    negotiated: false
  };
} 
/**
 * Base ICE Client Implementation
 * 
 * Core implementation of Interactive Connectivity Establishment functionality.
 */

import Debug from 'debug';
import { EventEmitter } from 'events';
import { ICE_CONSTANTS } from './constants';
import { ICESignaling, createSignalingChannel } from './signaling';
import { validateICEServers, createSecureRTCConfig, validateSDP } from './webrtc';
import { 
  ICEConnectionState, 
  ICEGatheringState, 
  ICECandidateType
} from './types';
import type { 
  ICECandidate,
  ICESignalingMessage,
  ICESecurityOptions,
  ICEOptions,
  ICEResult,
  ICESignalingOptions
} from './types';

const debug = Debug(ICE_CONSTANTS.DEBUG_NAMESPACE);

export class BaseICEClient extends EventEmitter {
  private connection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private signaling: ICESignaling | null = null;
  private connectionState: ICEConnectionState = ICEConnectionState.NEW;
  private gatheringState: ICEGatheringState = ICEGatheringState.NEW;
  private candidates: Set<string> = new Set();
  private security: Partial<ICESecurityOptions> = {};
  private connectionTimeout: NodeJS.Timeout | null = null;
  private gatheringTimeout: NodeJS.Timeout | null = null;
  private preferredFamily: 'IPv6' | 'IPv4' = 'IPv6';

  constructor() {
    super();
  }

  private setConnectionState(state: ICEConnectionState): void {
    this.connectionState = state;
    this.emit('connectionState', state);
    debug(`Connection state changed to: ${state}`);
  }

  private setGatheringState(state: ICEGatheringState): void {
    this.gatheringState = state;
    this.emit('gatheringState', state);
    debug(`Gathering state changed to: ${state}`);
  }

  private createCandidate(rtcCandidate: RTCIceCandidate): ICECandidate {
    const family = rtcCandidate.address?.includes(':') ? 'IPv6' : 'IPv4';
    return {
      type: rtcCandidate.type as ICECandidateType,
      address: rtcCandidate.address || '',
      port: rtcCandidate.port || 0,
      protocol: rtcCandidate.protocol as 'UDP' | 'TCP',
      priority: rtcCandidate.priority || 0,
      foundation: rtcCandidate.foundation || '',
      relatedAddress: rtcCandidate.relatedAddress || undefined,
      relatedPort: rtcCandidate.relatedPort || undefined,
      tcpType: rtcCandidate.tcpType || undefined,
      usernameFragment: rtcCandidate.usernameFragment || undefined,
      family
    };
  }

  private validateEndpoint(address: string, port: number): boolean {
    if (!this.security.allowLoopback && address === '127.0.0.1') {
      this.emit('security', 'Loopback address not allowed');
      return false;
    }

    if (!this.security.allowPrivateNetwork) {
      const ipParts = address.split('.');
      if (
        ipParts[0] === '10' ||
        (ipParts[0] === '172' && parseInt(ipParts[1]) >= 16 && parseInt(ipParts[1]) <= 31) ||
        (ipParts[0] === '192' && ipParts[1] === '168')
      ) {
        this.emit('security', 'Private network addresses not allowed');
        return false;
      }
    }

    if (port < (this.security.minPort || ICE_CONSTANTS.DEFAULT_SECURITY_OPTIONS.minPort) || 
        port > (this.security.maxPort || ICE_CONSTANTS.DEFAULT_SECURITY_OPTIONS.maxPort)) {
      this.emit('security', 'Port number out of allowed range');
      return false;
    }

    return true;
  }

  private setupDataChannel(): void {
    if (!this.connection) return;

    this.dataChannel = this.connection.createDataChannel('ice-check', {
      ordered: true,
      maxRetransmits: 0
    });

    this.dataChannel.onopen = () => {
      debug('Data channel opened');
      if (this.connectionState === ICEConnectionState.CHECKING) {
        this.setConnectionState(ICEConnectionState.CONNECTED);
      }
    };

    this.dataChannel.onclose = () => {
      debug('Data channel closed');
      if (this.connectionState === ICEConnectionState.CONNECTED) {
        this.setConnectionState(ICEConnectionState.DISCONNECTED);
      }
    };

    this.dataChannel.onerror = (error) => {
      debug(`Data channel error: ${error.toString()}`);
      this.emit('error', new Error('Data channel error'));
    };
  }

  private setupConnection(options: ICEOptions): void {
    if (this.connection) return;

    // Validate ICE servers
    validateICEServers(options.servers);

    // Set preferred family
    this.preferredFamily = options.preferredFamily || 'IPv6';

    // Create RTCPeerConnection with secure configuration
    const rtcConfig: RTCConfiguration = {
      ...createSecureRTCConfig(options.servers),
      ...options.rtcConfig,
      rtcpMuxPolicy: 'require', // Required for modern WebRTC
      bundlePolicy: 'max-bundle', // Optimize for bundle
      iceTransportPolicy: this.security.allowPrivateNetwork ? 'all' : 'relay'
    };

    this.connection = new RTCPeerConnection(rtcConfig);

    // Set up event handlers
    this.connection.oniceconnectionstatechange = () => {
      switch (this.connection?.iceConnectionState) {
        case 'new':
          this.setConnectionState(ICEConnectionState.NEW);
          break;
        case 'checking':
          this.setConnectionState(ICEConnectionState.CHECKING);
          break;
        case 'connected':
          this.setConnectionState(ICEConnectionState.CONNECTED);
          break;
        case 'completed':
          this.setConnectionState(ICEConnectionState.COMPLETED);
          break;
        case 'failed':
          this.setConnectionState(ICEConnectionState.FAILED);
          break;
        case 'disconnected':
          this.setConnectionState(ICEConnectionState.DISCONNECTED);
          break;
        case 'closed':
          this.setConnectionState(ICEConnectionState.CLOSED);
          break;
      }
    };

    this.connection.onicegatheringstatechange = () => {
      switch (this.connection?.iceGatheringState) {
        case 'new':
          this.setGatheringState(ICEGatheringState.NEW);
          break;
        case 'gathering':
          this.setGatheringState(ICEGatheringState.GATHERING);
          break;
        case 'complete':
          this.setGatheringState(ICEGatheringState.COMPLETE);
          break;
      }
    };

    this.connection.onicecandidate = (event) => {
      if (event.candidate) {
        const candidate = this.createCandidate(event.candidate);
        
        // Prefer IPv6 candidates
        if (this.preferredFamily === 'IPv6' && candidate.family === 'IPv4' && this.candidates.size > 0) {
          debug('Skipping IPv4 candidate due to IPv6 preference');
          return;
        }

        // Validate candidate endpoint
        if (!this.validateEndpoint(candidate.address, candidate.port)) {
          debug(`Candidate ${candidate.address}:${candidate.port} rejected by security policy`);
          return;
        }

        // Enforce candidate limit
        if (this.candidates.size >= ICE_CONSTANTS.MAX_CANDIDATES) {
          debug('Maximum number of candidates reached');
          return;
        }

        const candidateKey = `${candidate.address}:${candidate.port}`;
        if (!this.candidates.has(candidateKey)) {
          this.candidates.add(candidateKey);
          this.emit('candidate', candidate);

          // Send candidate through signaling if trickle ICE is enabled
          if (options.trickle && this.signaling) {
            const message: ICESignalingMessage = {
              type: 'candidate',
              from: options.peerId,
              to: options.peerId,
              timestamp: Date.now(),
              payload: { candidate }
            };
            this.signaling.send(message).catch(err => {
              debug(`Failed to send candidate: ${err.message}`);
            });
          }
        }
      }
    };

    this.setupDataChannel();
  }

  private setupTimeouts(options: ICEOptions): void {
    // Connection timeout
    const connectionTimeout = options.timeout || ICE_CONSTANTS.CONNECTION_TIMEOUT;
    this.connectionTimeout = setTimeout(() => {
      if (this.connectionState !== ICEConnectionState.CONNECTED) {
        debug('Connection timeout');
        this.setConnectionState(ICEConnectionState.FAILED);
        this.emit('error', new Error('Connection timeout'));
      }
    }, connectionTimeout);

    // Gathering timeout
    const gatheringTimeout = options.timeout || ICE_CONSTANTS.GATHERING_TIMEOUT;
    this.gatheringTimeout = setTimeout(() => {
      if (this.gatheringState === ICEGatheringState.GATHERING) {
        debug('Gathering timeout');
        this.setGatheringState(ICEGatheringState.COMPLETE);
      }
    }, gatheringTimeout);
  }

  private setupSignaling(options: ICEOptions): void {
    const signalingOptions = options.signaling;
    if (!signalingOptions?.gunInstance) return;

    const channel = createSignalingChannel(options.peerId, this.security);
    this.signaling = new ICESignaling(signalingOptions.gunInstance, channel, this.security);

    // Listen for incoming candidates
    this.signaling.listen(async (message: ICESignalingMessage) => {
      if (message.type === 'candidate' && message.payload.candidate) {
        const candidate = message.payload.candidate;
        
        // Validate candidate
        if (!this.validateEndpoint(candidate.address, candidate.port)) {
          debug(`Remote candidate ${candidate.address}:${candidate.port} rejected by security policy`);
          return;
        }

        try {
          // Create and add the RTCIceCandidate
          const rtcCandidate = new RTCIceCandidate({
            candidate: `candidate:${candidate.foundation} 1 ${candidate.protocol.toLowerCase()} ${candidate.priority} ${candidate.address} ${candidate.port} typ ${candidate.type}${candidate.relatedAddress ? ` raddr ${candidate.relatedAddress} rport ${candidate.relatedPort}` : ''}`,
            sdpMid: '0',
            sdpMLineIndex: 0,
            usernameFragment: candidate.usernameFragment
          });

          await this.connection?.addIceCandidate(rtcCandidate);
          debug(`Added remote candidate: ${candidate.address}:${candidate.port}`);
        } catch (error) {
          debug(`Failed to add remote candidate: ${(error as Error).message}`);
        }
      }
    });
  }

  async connect(options: ICEOptions): Promise<ICEResult> {
    if (this.connection) {
      throw new Error('Connection already exists');
    }

    try {
      // Initialize security options
      this.security = options.security || {};

      // Set up connection
      this.setupConnection(options);

      // Set up signaling if available
      this.setupSignaling(options);

      // Set up timeouts
      this.setupTimeouts(options);

      // Create signaling channel
      const channel = createSignalingChannel(options.peerId, this.security);
      const signalingOptions = options.signaling;
      if (signalingOptions?.gunInstance) {
        this.signaling = new ICESignaling(signalingOptions.gunInstance, channel, this.security);
      }

      // Create and set local description
      const offer = await this.connection!.createOffer();
      
      // Validate SDP
      validateSDP(offer.sdp!);
      
      await this.connection!.setLocalDescription(offer);

      // Send offer through signaling if available
      if (this.signaling) {
        await this.signaling.send({
          type: 'offer',
          from: options.peerId,
          to: options.peerId,
          timestamp: Date.now(),
          payload: {
            sdp: offer.sdp,
            connectionId: channel
          }
        });
      }

      // Wait for connection or gathering completion
      const result = await new Promise<ICEResult>((resolve, reject) => {
        const cleanup = () => {
          if (this.connectionTimeout) clearTimeout(this.connectionTimeout);
          if (this.gatheringTimeout) clearTimeout(this.gatheringTimeout);
        };

        const onConnected = () => {
          cleanup();
          const candidates = [...this.candidates].map(key => {
            const [address, port] = key.split(':');
            return {
              address,
              port: parseInt(port),
              type: ICECandidateType.HOST,
              protocol: 'UDP',
              priority: 0,
              foundation: '',
              family: address.includes(':') ? 'IPv6' : 'IPv4'
            } as ICECandidate;
          });

          const localCandidate = candidates.find(c => c.family === this.preferredFamily) || candidates[0];

          resolve({
            success: true,
            localCandidate,
            connection: this.connection!,
            dataChannel: this.dataChannel!,
            details: {
              rtt: Date.now() - options.timestamp,
              protocol: localCandidate.protocol,
              secure: this.security.requireEncryption || false,
              signaling: {
                channel,
                latency: Date.now() - options.timestamp
              }
            }
          });
        };

        const onFailed = (error: Error) => {
          cleanup();
          reject(error);
        };

        this.once('connected', onConnected);
        this.once('error', onFailed);
      });

      return result;

    } catch (error: any) {
      this.setConnectionState(ICEConnectionState.FAILED);
      this.emit('error', error);
      return {
        success: false,
        error: error?.message || 'Unknown error'
      };
    }
  }

  close(): void {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    if (this.gatheringTimeout) {
      clearTimeout(this.gatheringTimeout);
      this.gatheringTimeout = null;
    }

    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch (err) {
        debug(`Error closing data channel: ${(err as Error).message}`);
      }
      this.dataChannel = null;
    }

    if (this.connection) {
      try {
        this.connection.close();
      } catch (err) {
        debug(`Error closing connection: ${(err as Error).message}`);
      }
      this.connection = null;
    }

    if (this.signaling) {
      this.signaling.close();
      this.signaling = null;
    }

    this.candidates.clear();
    this.setConnectionState(ICEConnectionState.CLOSED);
    this.setGatheringState(ICEGatheringState.COMPLETE);
  }
} 
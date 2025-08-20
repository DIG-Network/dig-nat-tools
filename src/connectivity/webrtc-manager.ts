import { EventEmitter } from 'events';
import wrtc, { RTCPeerConnection, RTCDataChannel, RTCPeerConnectionIceEvent, RTCDataChannelEvent, RTCIceCandidate } from '@roamhq/wrtc';
import Gun from 'gun';

export interface WebRTCManagerOptions {
  peers?: string[];
  namespace?: string;
  stunServers?: string[];
}

export interface WebRTCOffer {
  type: 'offer';
  sdp: string;
  fromPeer: string;
  toPeer: string;
}

export interface WebRTCAnswer {
  type: 'answer';
  sdp: string;
  fromPeer: string;
  toPeer: string;
}

export interface WebRTCIceCandidate {
  type: 'ice';
  candidate: string;
  sdpMLineIndex: number | null;
  sdpMid: string | null;
  fromPeer: string;
  toPeer: string;
}

interface GunRegistryLike {
  get: (key: string) => {
    get: (key: string) => {
      get: (key: string) => {
        put: (data: Record<string, unknown>) => void;
        on: (callback: (data: Record<string, unknown>) => void) => void;
      };
    };
  };
}

export class WebRTCManager extends EventEmitter {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private gunRegistry: GunRegistryLike | null = null; // Gun.js instance
  private options: WebRTCManagerOptions;
  private storeId: string;
  private isListening: boolean = false;
  private webRTCAvailable: boolean = false;

  constructor(options: WebRTCManagerOptions = {}) {
    super();
    this.options = {
      peers: options.peers || ['http://localhost:8765/gun'],
      namespace: options.namespace || 'dig-nat-tools',
      stunServers: options.stunServers || ['stun:stun.l.google.com:19302']
    };
    this.storeId = '';
    
    // Initialize WebRTC availability
    this.webRTCAvailable = typeof wrtc !== 'undefined';
    
    // Initialize Gun.js
    if (this.webRTCAvailable) {
      this.gunRegistry = Gun(this.options.peers) as unknown as GunRegistryLike;
    }
  }

  private createPeerConnection(): RTCPeerConnection {
    if (!this.webRTCAvailable) {
      throw new Error('WebRTC not available in this environment');
    }

    const pc = new wrtc.RTCPeerConnection({
      iceServers: [{ urls: this.options.stunServers! }]
    });

    pc.onicecandidate = (event: RTCPeerConnectionIceEvent): void => {
      if (event.candidate && this.gunRegistry) {
        this.sendIceCandidate(event.candidate);
      }
    };

    pc.ondatachannel = (event: RTCDataChannelEvent): void => {
      const channel = event.channel;
      this.setupDataChannel(channel);
      this.emit('connection', channel);
    };

    return pc;
  }

  public async startListening(storeId: string): Promise<void> {
    if (!this.gunRegistry) {
      throw new Error('Gun.js registry not available');
    }

    if (!this.webRTCAvailable) {
      throw new Error('WebRTC not available in this environment');
    }

    this.storeId = storeId;
    this.isListening = true;

    // Listen for incoming offers
    this.gunRegistry.get(this.options.namespace!).get('offers').get(storeId).on((data: Record<string, unknown>) => {
      if (data && data.type === 'offer' && data.fromPeer !== storeId) {
        void this.handleOffer(data as unknown as WebRTCOffer);
      }
    });

    // Listen for answers
    this.gunRegistry.get(this.options.namespace!).get('answers').get(storeId).on((data: Record<string, unknown>) => {
      if (data && data.type === 'answer' && data.fromPeer !== storeId) {
        void this.handleAnswer(data as unknown as WebRTCAnswer);
      }
    });

    // Listen for ICE candidates
    this.gunRegistry.get(this.options.namespace!).get('ice').get(storeId).on((data: Record<string, unknown>) => {
      if (data && data.type === 'ice' && data.fromPeer !== storeId) {
        void this.handleIceCandidate(data as unknown as WebRTCIceCandidate);
      }
    });
  }

  public async connectTo(peerId: string): Promise<RTCDataChannel> {
    if (!this.gunRegistry) {
      throw new Error('Gun.js registry not available');
    }

    if (!this.webRTCAvailable) {
      throw new Error('WebRTC not available in this environment');
    }

    this.peerConnection = this.createPeerConnection();
    
    // Create data channel
    this.dataChannel = this.peerConnection.createDataChannel('http-tunnel', {
      ordered: true
    });
    
    this.setupDataChannel(this.dataChannel);

    // Create offer
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    // Send offer via Gun.js
    this.gunRegistry.get(this.options.namespace!).get('offers').get(peerId).put({
      type: 'offer',
      sdp: offer.sdp!,
      fromPeer: this.storeId,
      toPeer: peerId,
      timestamp: Date.now()
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebRTC connection timeout'));
      }, 30000);

      this.dataChannel!.onopen = (): void => {
        clearTimeout(timeout);
        resolve(this.dataChannel!);
      };

      this.dataChannel!.onerror = (error: unknown): void => {
        clearTimeout(timeout);
        reject(error);
      };
    });
  }

  private async handleOffer(offer: WebRTCOffer): Promise<void> {
    this.peerConnection = this.createPeerConnection();
    
    await this.peerConnection.setRemoteDescription({
      type: 'offer',
      sdp: offer.sdp
    });

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    // Send answer via Gun.js
    this.gunRegistry!.get(this.options.namespace!).get('answers').get(offer.fromPeer).put({
      type: 'answer',
      sdp: answer.sdp!,
      fromPeer: this.storeId,
      toPeer: offer.fromPeer,
      timestamp: Date.now()
    });
  }

  private async handleAnswer(answer: WebRTCAnswer): Promise<void> {
    if (this.peerConnection) {
      await this.peerConnection.setRemoteDescription({
        type: 'answer',
        sdp: answer.sdp
      });
    }
  }

  private async handleIceCandidate(ice: WebRTCIceCandidate): Promise<void> {
    if (this.peerConnection && ice.sdpMLineIndex !== null && ice.sdpMid !== null) {
      await this.peerConnection.addIceCandidate({
        candidate: ice.candidate,
        sdpMLineIndex: ice.sdpMLineIndex,
        sdpMid: ice.sdpMid
      });
    }
  }

  private sendIceCandidate(candidate: RTCIceCandidate): void {
    // Note: We need to know which peer to send this to
    // This is a simplified implementation - in practice you'd track active connections
    if (this.gunRegistry) {
      this.gunRegistry.get(this.options.namespace!).get('ice').get(this.storeId).put({
        type: 'ice',
        candidate: candidate.candidate,
        sdpMLineIndex: candidate.sdpMLineIndex,
        sdpMid: candidate.sdpMid,
        fromPeer: this.storeId,
        timestamp: Date.now()
      });
    }
  }

  private setupDataChannel(channel: RTCDataChannel): void {
    channel.onopen = (): void => {
      console.log('WebRTC DataChannel opened');
    };

    channel.onclose = (): void => {
      console.log('WebRTC DataChannel closed');
    };

    channel.onerror = (error: unknown): void => {
      console.error('WebRTC DataChannel error:', error);
    };
  }

  public isWebRTCAvailable(): boolean {
    return this.webRTCAvailable;
  }

  public stop(): void {
    this.isListening = false;
    
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }
}

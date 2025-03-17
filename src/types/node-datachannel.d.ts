declare module 'node-datachannel' {
  export function initLogger(level: string): void;
  
  export interface PeerConnectionOptions {
    iceServers: string[];
    [key: string]: any;
  }
  
  export class PeerConnection {
    constructor(id: string, options?: PeerConnectionOptions);
    onLocalDescription(callback: (sdp: string, type: string) => void): void;
    onLocalCandidate(callback: (candidate: string, mid: string) => void): void;
    onDataChannel(callback: (dataChannel: DataChannel) => void): void;
    setRemoteDescription(sdp: string, type: string): Promise<void>;
    addRemoteCandidate(candidate: string, mid: string): Promise<void>;
    close(): void;
    createDataChannel(label: string): DataChannel;
  }
  
  export class DataChannel {
    onMessage(callback: (message: string) => void): void;
    onClosed(callback: () => void): void;
    sendMessage(message: string): void;
    close(): void;
  }
} 
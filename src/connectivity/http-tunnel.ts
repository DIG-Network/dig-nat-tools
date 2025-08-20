export interface TunneledRequest {
  id: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: Buffer;
}

export interface TunneledResponse {
  id: string;
  statusCode: number;
  headers: Record<string, string>;
  body: Buffer;
}

interface MessageEvent {
  data: ArrayBuffer;
}

interface DataChannel {
  onmessage: ((event: MessageEvent) => void) | null;
  send: (data: ArrayBuffer) => void;
  close: () => void;
}

export class HttpTunnel {
  private dataChannel: DataChannel;
  private pendingRequests: Map<string, (response: TunneledResponse) => void> = new Map();
  private requestCounter: number = 0;

  constructor(dataChannel: DataChannel) {
    this.dataChannel = dataChannel;
    this.setupMessageHandling();
  }

  private setupMessageHandling(): void {
    this.dataChannel.onmessage = (event: MessageEvent): void => {
      try {
        const data = new Uint8Array(event.data);
        const message = this.parseMessage(data);
        
        if (message.type === 'request') {
          this.handleIncomingRequest(message.data as TunneledRequest);
        } else if (message.type === 'response') {
          this.handleIncomingResponse(message.data as TunneledResponse);
        }
      } catch (error) {
        console.error('Error handling WebRTC message:', error);
      }
    };
  }

  private parseMessage(data: Uint8Array): { type: string; data: TunneledRequest | TunneledResponse } {
    const decoder = new globalThis.TextDecoder();
    const jsonString = decoder.decode(data);
    return JSON.parse(jsonString);
  }

  private serializeMessage(type: string, data: TunneledRequest | TunneledResponse): ArrayBuffer {
    const encoder = new globalThis.TextEncoder();
    const jsonString = JSON.stringify({ type, data });
    return encoder.encode(jsonString).buffer;
  }

  public async sendRequest(method: string, path: string, headers: Record<string, string> = {}, body?: Buffer): Promise<TunneledResponse> {
    const id = `req_${++this.requestCounter}_${Date.now()}`;
    
    const request: TunneledRequest = {
      id,
      method,
      path,
      headers,
      body
    };

    return new Promise((resolve, reject) => {
      // Set timeout for request
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }, 30000);

      this.pendingRequests.set(id, (response: TunneledResponse) => {
        clearTimeout(timeout);
        resolve(response);
      });

      // Send request over WebRTC
      const message = this.serializeMessage('request', request);
      this.dataChannel.send(message);
    });
  }

  public sendResponse(requestId: string, statusCode: number, headers: Record<string, string> = {}, body: Buffer = Buffer.alloc(0)): void {
    const response: TunneledResponse = {
      id: requestId,
      statusCode,
      headers,
      body
    };

    const message = this.serializeMessage('response', response);
    this.dataChannel.send(message);
  }

  private handleIncomingRequest(request: TunneledRequest): void {
    // Emit request event for the host to handle
    this.emit('request', request);
  }

  private handleIncomingResponse(response: TunneledResponse): void {
    const resolver = this.pendingRequests.get(response.id);
    if (resolver) {
      this.pendingRequests.delete(response.id);
      resolver(response);
    }
  }

  private emit(event: string, data: TunneledRequest): void {
    // Simple event emitter implementation
    if (event === 'request' && this.onRequest) {
      this.onRequest(data);
    }
  }

  public onRequest?: (request: TunneledRequest) => void;

  public close(): void {
    this.pendingRequests.clear();
    if (this.dataChannel) {
      this.dataChannel.close();
    }
  }
}

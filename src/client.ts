// client.ts
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { Readable } from 'stream';
import { IFileClient, DownloadOptions, HostCapabilities } from './interfaces';
import { GunRegistry } from './registry/gun-registry';

export interface FileClientOptions {
  peers?: string[];       // Gun.js peer URLs
  namespace?: string;     // Gun.js namespace
  timeout?: number;       // Download timeout
}

export class FileClient implements IFileClient {
  private gunRegistry: GunRegistry;
  private options: FileClientOptions;

  constructor(options: FileClientOptions = {}) {
    this.options = {
      peers: options.peers || ['http://localhost:8765/gun'],
      namespace: options.namespace || 'dig-nat-tools',
      timeout: options.timeout || 30000
    };

    this.gunRegistry = new GunRegistry({
      peers: this.options.peers,
      namespace: this.options.namespace
    });
  }
  
  /**
   * Download a file from a peer and return it as a buffer
   * @param url The URL of the file to download (can be http://, https://, or webrtc://)
   * @param options Download options
   * @returns A promise that resolves to the file content as a Buffer
   */
  public async downloadAsBuffer(url: string, options: DownloadOptions = {}): Promise<Buffer> {
    // Check if this is a WebRTC URL
    if (url.startsWith('webrtc://')) {
      return this.downloadViaWebRTC(url);
    }
    
    // For HTTP/HTTPS URLs, use direct download
    return FileClient.downloadAsBufferStatic(url, options);
  }

  /**
   * Download a file by automatically finding the best connection method
   * @param storeId The store ID of the host
   * @param fileHash The SHA256 hash of the file
   * @param options Download options
   * @returns A promise that resolves to the file content as a Buffer
   */
  public async downloadFile(storeId: string, fileHash: string, options: DownloadOptions = {}): Promise<Buffer> {
    // 1. Look up peer in Gun.js registry
    const peer = await this.gunRegistry.findPeer(storeId);
    
    if (!peer) {
      throw new Error(`Peer ${storeId} not found in registry`);
    }

    // 2. Try connection methods in order of preference: Direct HTTP > UPnP > WebRTC
    
    // Method 1: Try direct HTTP connection (fastest, no NAT traversal needed)
    if (peer.externalIp && peer.port) {
      try {
        console.log(`Attempting direct HTTP connection to ${peer.externalIp}:${peer.port}`);
        return await this.downloadViaHttp(peer.externalIp, peer.port, fileHash, options);
      } catch (error) {
        console.warn(`Direct HTTP connection failed:`, error);
      }
    }

    // Method 2: Try UPnP connection (if available)
    if (peer.upnp?.ok && peer.upnp.externalIp && peer.upnp.externalPort) {
      try {
        console.log(`Attempting UPnP connection to ${peer.upnp.externalIp}:${peer.upnp.externalPort}`);
        return await this.downloadViaHttp(peer.upnp.externalIp, peer.upnp.externalPort, fileHash, options);
      } catch (error) {
        console.warn(`UPnP connection failed:`, error);
      }
    }

    // Method 3: Fall back to WebRTC (if available)
    if (peer.webrtc?.ok) {
      try {
        console.log(`Attempting WebRTC connection to ${storeId}`);
        return await this.downloadViaWebRTCDirect(storeId, fileHash);
      } catch (error) {
        console.warn(`WebRTC connection failed:`, error);
      }
    }
    
    throw new Error(`No viable connection method available for peer ${storeId}. Tried: ${
      [
        peer.externalIp && peer.port ? 'Direct HTTP' : null,
        peer.upnp?.ok ? 'UPnP' : null,
        peer.webrtc?.ok ? 'WebRTC' : null
      ].filter(Boolean).join(', ') || 'None'
    }`);
  }

  /**
   * Download a file via WebRTC URL parsing
   * @param webrtcUrl WebRTC URL in format: webrtc://storeId/files/hash
   */
  private async downloadViaWebRTC(webrtcUrl: string): Promise<Buffer> {
    // Parse WebRTC URL: webrtc://storeId/files/hash
    const urlParts = webrtcUrl.replace('webrtc://', '').split('/');
    if (urlParts.length !== 3 || urlParts[1] !== 'files') {
      throw new Error('Invalid WebRTC URL format. Expected: webrtc://storeId/files/hash');
    }
    
    const storeId = urlParts[0];
    const fileHash = urlParts[2];
    
    return this.downloadViaWebRTCDirect(storeId, fileHash);
  }

  /**
   * Download a file directly via WebRTC
   */
  private async downloadViaWebRTCDirect(_storeId: string, _fileHash: string): Promise<Buffer> {
    // This is a simplified implementation
    // In a full implementation, you would:
    // 1. Create WebRTC connection to the peer
    // 2. Establish data channel
    // 3. Send HTTP request over data channel
    // 4. Receive HTTP response over data channel
    
    throw new Error('WebRTC file download not yet implemented - this requires the full WebRTC tunnel infrastructure');
  }

  /**
   * Download a file via HTTP
   */
  private async downloadViaHttp(host: string, port: number, fileHash: string, options: DownloadOptions = {}): Promise<Buffer> {
    const url = `http://${host}:${port}/files/${fileHash}`;
    return FileClient.downloadAsBufferStatic(url, options);
  }

  /**
   * Download a file from a peer and return it as a readable stream
   * @param url The URL of the file to download
   * @param options Download options
   * @returns A promise that resolves to a readable stream
   */
  public async downloadAsStream(url: string, options: DownloadOptions = {}): Promise<Readable> {
    return FileClient.downloadAsStreamStatic(url, options);
  }

  /**
   * Check if a P2P server is online
   * @param baseUrl The base URL of the P2P server
   * @returns A promise that resolves to a boolean indicating server status
   */
  public async isServerOnline(baseUrl: string): Promise<boolean> {
    return FileClient.isServerOnlineStatic(baseUrl);
  }

  /**
   * Find all available peers in the Gun.js registry
   * @returns A promise that resolves to an array of host capabilities
   */
  public async findAvailablePeers(): Promise<HostCapabilities[]> {
    return this.gunRegistry.findAvailablePeers();
  }

  /**
   * Check the capabilities of a specific peer
   * @param storeId The store ID of the peer
   * @returns A promise that resolves to the peer's capabilities or null if not found
   */
  public async checkPeerCapabilities(storeId: string): Promise<HostCapabilities | null> {
    return this.gunRegistry.findPeer(storeId);
  }

  /**
   * Download a file from a peer and return it as a buffer (static version)
   * @param url The URL of the file to download
   * @param options Download options
   * @returns A promise that resolves to the file buffer
   */
  public static async downloadAsBufferStatic(url: string, options: DownloadOptions = {}): Promise<Buffer> {
    const { timeout = 30000, onProgress } = options;

    return new Promise<Buffer>((resolve, reject) => {
      // Parse the URL
      const parsedUrl = new URL(url);
      
      // Select the appropriate protocol
      const protocol = parsedUrl.protocol === 'https:' ? https : http;
      
      const req = protocol.get(url, { timeout }, (res: http.IncomingMessage) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Failed to download file: ${res.statusCode} ${res.statusMessage}`));
        }

        const contentLength = parseInt(res.headers['content-length'] || '0', 10);
        const chunks: Buffer[] = [];
        let downloadedBytes = 0;

        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
          downloadedBytes += chunk.length;

          if (onProgress && contentLength > 0) {
            onProgress(downloadedBytes, contentLength);
          }
        });

        res.on('end', () => {
          resolve(Buffer.concat(chunks));
        });
      });

      req.on('error', (err: Error) => {
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Download timed out'));
      });
    });
  }

  /**
   * Download a file from a peer and return it as a readable stream (static version)
   * @param url The URL of the file to download
   * @param options Download options
   * @returns A promise that resolves to a readable stream
   */
  public static async downloadAsStreamStatic(url: string, options: DownloadOptions = {}): Promise<Readable> {
    const { timeout = 30000 } = options;

    return new Promise<Readable>((resolve, reject) => {
      // Parse the URL
      const parsedUrl = new URL(url);
      
      // Select the appropriate protocol
      const protocol = parsedUrl.protocol === 'https:' ? https : http;
      
      const req = protocol.get(url, { timeout }, (res: http.IncomingMessage) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Failed to download file: ${res.statusCode} ${res.statusMessage}`));
        }

        // Resolve with the response stream directly
        resolve(res);
      });

      req.on('error', (err: Error) => {
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Download timed out'));
      });
    });
  }

  /**
   * Check if a P2P server is online (static version)
   * @param baseUrl The base URL of the P2P server (e.g., http://192.168.1.100:30780)
   * @returns A promise that resolves to a boolean indicating whether the server is online
   */
  public static async isServerOnlineStatic(baseUrl: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      try {
        // Parse the URL and add the status path
        const parsedUrl = new URL('/status', baseUrl);
        
        // Select the appropriate protocol
        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        
        const req = protocol.get(parsedUrl.toString(), { timeout: 5000 }, (res: http.IncomingMessage) => {
          if (res.statusCode !== 200) {
            return resolve(false);
          }
          
          let data = '';
          res.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });
          
          res.on('end', () => {
            try {
              const parsedData = JSON.parse(data);
              resolve(parsedData && parsedData.status === 'online');
            } catch {
              resolve(false);
            }
          });
        });
        
        req.on('error', () => {
          resolve(false);
        });
        
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
      } catch {
        resolve(false);
      }
    });
  }
}

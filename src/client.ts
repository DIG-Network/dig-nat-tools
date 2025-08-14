// client.ts
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { Readable } from 'stream';
import { IFileClient, DownloadOptions } from './interfaces';

export class FileClient implements IFileClient {
  
  /**
   * Download a file from a peer and return it as a buffer
   * @param url The URL of the file to download
   * @param options Download options
   * @returns A promise that resolves to the file content as a Buffer
   */
  public async downloadAsBuffer(url: string, options: DownloadOptions = {}): Promise<Buffer> {
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

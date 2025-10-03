// Mock http module
const mockRequest = {
  on: jest.fn(),
  destroy: jest.fn()
};

const mockResponse = {
  statusCode: 200,
  statusMessage: 'OK',
  headers: { 'content-length': '1024' },
  on: jest.fn()
};

const mockHttp = {
  get: jest.fn()
};

const mockHttps = {
  get: jest.fn()
};

jest.mock('node:http', () => mockHttp);
jest.mock('node:https', () => mockHttps);

// Mock URL
jest.mock('node:url', () => ({
  URL: jest.fn()
}));

import { FileClient } from '../src/client';
import { URL } from 'node:url';

// Get the mocked versions
const mockURL = URL as jest.MockedClass<typeof URL>;

describe('FileClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset mockResponse to default successful state
    mockResponse.statusCode = 200;
    mockResponse.statusMessage = 'OK';
    mockResponse.headers = { 'content-length': '1024' };
    
    // Reset mock implementations
    mockHttp.get.mockImplementation((url, options, callback) => {
      if (typeof options === 'function') {
        callback = options;
      }
      callback(mockResponse);
      return mockRequest;
    });
    
    mockHttps.get.mockImplementation((url, options, callback) => {
      if (typeof options === 'function') {
        callback = options;
      }
      callback(mockResponse);
      return mockRequest;
    });
    
    mockRequest.on.mockImplementation((_event, _handler) => {
      // Don't trigger any events by default
      return mockRequest;
    });
    
    mockResponse.on.mockImplementation((event, handler) => {
      if (event === 'data') {
        // Simulate receiving data chunks
        setTimeout(() => handler(Buffer.from('test data chunk')), 10);
      } else if (event === 'end') {
        // Simulate end of response
        setTimeout(() => handler(), 20);
      }
      return mockResponse;
    });
  });

  describe('downloadAsBuffer', () => {
    it('should download file as buffer successfully with HTTP', async () => {
      mockURL.mockImplementation((url) => ({
        protocol: 'http:',
        toString: () => url
      }) as any);

      const promise = FileClient.downloadAsBufferStatic('http://example.com/file.txt');
      
      // Wait for the promise to resolve
      const result = await promise;
      
      expect(result).toBeInstanceOf(Buffer);
      expect(result.toString()).toBe('test data chunk');
      expect(mockHttp.get).toHaveBeenCalledWith(
        'http://example.com/file.txt',
        expect.any(Function)
      );
    });

    it('should download file as buffer successfully with HTTPS', async () => {
      mockURL.mockImplementation((url) => ({
        protocol: 'https:',
        toString: () => url
      }) as any);

      const promise = FileClient.downloadAsBufferStatic('https://example.com/file.txt');
      
      const result = await promise;
      
      expect(result).toBeInstanceOf(Buffer);
      expect(mockHttps.get).toHaveBeenCalledWith(
        'https://example.com/file.txt',
        expect.any(Function)
      );
    });



    it('should call onProgress callback when content-length is available', async () => {
      const onProgress = jest.fn();
      
      mockURL.mockImplementation((url) => ({
        protocol: 'http:',
        toString: () => url
      }) as any);

      mockResponse.headers = { 'content-length': '15' }; // Length of "test data chunk"
      
      const promise = FileClient.downloadAsBufferStatic('http://example.com/file.txt', { onProgress });
      
      await promise;
      
      expect(onProgress).toHaveBeenCalledWith(15, 15);
    });

    it('should not call onProgress when content-length is missing', async () => {
      const onProgress = jest.fn();
      
      mockURL.mockImplementation((url) => ({
        protocol: 'http:',
        toString: () => url
      }) as any);

      mockResponse.headers = { 'content-length': '0' }; // No content-length effectively
      
      const promise = FileClient.downloadAsBufferStatic('http://example.com/file.txt', { onProgress });
      
      await promise;
      
      expect(onProgress).not.toHaveBeenCalled();
    });

    it('should handle multiple data chunks', async () => {
      mockURL.mockImplementation((url) => ({
        protocol: 'http:',
        toString: () => url
      }) as any);

      mockResponse.on.mockImplementation((event, handler) => {
        if (event === 'data') {
          setTimeout(() => handler(Buffer.from('chunk1')), 10);
          setTimeout(() => handler(Buffer.from('chunk2')), 15);
        } else if (event === 'end') {
          setTimeout(() => handler(), 20);
        }
        return mockResponse;
      });

      const result = await FileClient.downloadAsBufferStatic('http://example.com/file.txt');
      
      expect(result.toString()).toBe('chunk1chunk2');
    });

    it('should reject when response status is not 200', async () => {
      mockURL.mockImplementation((url) => ({
        protocol: 'http:',
        toString: () => url
      }) as any);

      mockResponse.statusCode = 404;
      mockResponse.statusMessage = 'Not Found';

      mockHttp.get.mockImplementation((url, options, callback) => {
        if (typeof options === 'function') {
          callback = options;
        }
        callback(mockResponse);
        return mockRequest;
      });

      await expect(FileClient.downloadAsBufferStatic('http://example.com/file.txt'))
        .rejects.toThrow('Failed to download file: 404 Not Found');
    });

    it('should reject on request error', async () => {
      mockURL.mockImplementation((url) => ({
        protocol: 'http:',
        toString: () => url
      }) as any);

      // Override the mock to trigger error instead of calling callback with response
      mockHttp.get.mockImplementation((_url, _options, _callback) => {
        // Don't call the callback, just return request that will trigger error
        return mockRequest;
      });

      mockRequest.on.mockImplementation((event, handler) => {
        if (event === 'error') {
          setTimeout(() => handler(new Error('Network error')), 10);
        }
        return mockRequest;
      });

      await expect(FileClient.downloadAsBufferStatic('http://example.com/file.txt'))
        .rejects.toThrow('Network error');
    });


  });

  describe('downloadAsStream', () => {
    it('should download file as stream successfully with HTTP', async () => {
      mockURL.mockImplementation((url) => ({
        protocol: 'http:',
        toString: () => url
      }) as any);

      const result = await FileClient.downloadAsStreamStatic('http://example.com/file.txt');
      
      expect(result).toBe(mockResponse);
      expect(mockHttp.get).toHaveBeenCalledWith(
        'http://example.com/file.txt',
        expect.any(Function)
      );
    });

    it('should download file as stream successfully with HTTPS', async () => {
      mockURL.mockImplementation((url) => ({
        protocol: 'https:',
        toString: () => url
      }) as any);

      const result = await FileClient.downloadAsStreamStatic('https://example.com/file.txt');
      
      expect(result).toBe(mockResponse);
      expect(mockHttps.get).toHaveBeenCalledWith(
        'https://example.com/file.txt',
        expect.any(Function)
      );
    });



    it('should reject when response status is not 200', async () => {
      mockURL.mockImplementation((url) => ({
        protocol: 'http:',
        toString: () => url
      }) as any);

      mockResponse.statusCode = 500;
      mockResponse.statusMessage = 'Internal Server Error';

      await expect(FileClient.downloadAsStreamStatic('http://example.com/file.txt'))
        .rejects.toThrow('Failed to download file: 500 Internal Server Error');
    });

    it('should reject on request error', async () => {
      mockURL.mockImplementation((url) => ({
        protocol: 'http:',
        toString: () => url
      }) as any);

      // Override the mock to trigger error instead of calling callback with response
      mockHttp.get.mockImplementation((_url, _options, _callback) => {
        // Don't call the callback, just return request that will trigger error
        return mockRequest;
      });

      mockRequest.on.mockImplementation((event, handler) => {
        if (event === 'error') {
          setTimeout(() => handler(new Error('Connection refused')), 10);
        }
        return mockRequest;
      });

      await expect(FileClient.downloadAsStreamStatic('http://example.com/file.txt'))
        .rejects.toThrow('Connection refused');
    });


  });

  describe('isServerOnline', () => {
    beforeEach(() => {
      // Reset response for status endpoint tests
      mockResponse.statusCode = 200;
      mockResponse.statusMessage = 'OK';
    });

    it('should return true when server responds with online status (HTTP)', async () => {
      mockURL.mockImplementation((path, baseUrl) => ({
        protocol: 'http:',
        toString: () => `${baseUrl}/status`
      }) as any);

      mockResponse.on.mockImplementation((event, handler) => {
        if (event === 'data') {
          setTimeout(() => handler(Buffer.from('{"status":"online"}')), 10);
        } else if (event === 'end') {
          setTimeout(() => handler(), 20);
        }
        return mockResponse;
      });

      const result = await FileClient.isServerOnlineStatic('http://example.com:3000');
      
      expect(result).toBe(true);
      expect(mockHttp.get).toHaveBeenCalledWith(
        'http://example.com:3000/status',
        { timeout: 5000 },
        expect.any(Function)
      );
    });

    it('should return true when server responds with online status (HTTPS)', async () => {
      mockURL.mockImplementation((path, baseUrl) => ({
        protocol: 'https:',
        toString: () => `${baseUrl}/status`
      }) as any);

      mockResponse.on.mockImplementation((event, handler) => {
        if (event === 'data') {
          setTimeout(() => handler(Buffer.from('{"status":"online"}')), 10);
        } else if (event === 'end') {
          setTimeout(() => handler(), 20);
        }
        return mockResponse;
      });

      const result = await FileClient.isServerOnlineStatic('https://example.com:3000');
      
      expect(result).toBe(true);
      expect(mockHttps.get).toHaveBeenCalled();
    });

    it('should return false when server responds with non-online status', async () => {
      mockURL.mockImplementation((path, baseUrl) => ({
        protocol: 'http:',
        toString: () => `${baseUrl}/status`
      }) as any);

      mockResponse.on.mockImplementation((event, handler) => {
        if (event === 'data') {
          setTimeout(() => handler(Buffer.from('{"status":"offline"}')), 10);
        } else if (event === 'end') {
          setTimeout(() => handler(), 20);
        }
        return mockResponse;
      });

      const result = await FileClient.isServerOnlineStatic('http://example.com:3000');
      
      expect(result).toBe(false);
    });

    it('should return false when response status is not 200', async () => {
      mockURL.mockImplementation((path, baseUrl) => ({
        protocol: 'http:',
        toString: () => `${baseUrl}/status`
      }) as any);

      mockResponse.statusCode = 404;

      const result = await FileClient.isServerOnlineStatic('http://example.com:3000');
      
      expect(result).toBe(false);
    });

    it('should return false when response JSON is invalid', async () => {
      mockURL.mockImplementation((path, baseUrl) => ({
        protocol: 'http:',
        toString: () => `${baseUrl}/status`
      }) as any);

      mockResponse.on.mockImplementation((event, handler) => {
        if (event === 'data') {
          setTimeout(() => handler(Buffer.from('invalid json')), 10);
        } else if (event === 'end') {
          setTimeout(() => handler(), 20);
        }
        return mockResponse;
      });

      const result = await FileClient.isServerOnlineStatic('http://example.com:3000');
      
      expect(result).toBe(false);
    });

    it('should return false when response has no status field', async () => {
      mockURL.mockImplementation((path, baseUrl) => ({
        protocol: 'http:',
        toString: () => `${baseUrl}/status`
      }) as any);

      mockResponse.on.mockImplementation((event, handler) => {
        if (event === 'data') {
          setTimeout(() => handler(Buffer.from('{"message":"hello"}')), 10);
        } else if (event === 'end') {
          setTimeout(() => handler(), 20);
        }
        return mockResponse;
      });

      const result = await FileClient.isServerOnlineStatic('http://example.com:3000');
      
      expect(result).toBe(false);
    });

    it('should return false on request error', async () => {
      mockURL.mockImplementation((path, baseUrl) => ({
        protocol: 'http:',
        toString: () => `${baseUrl}/status`
      }) as any);

      mockRequest.on.mockImplementation((event, handler) => {
        if (event === 'error') {
          setTimeout(() => handler(new Error('Connection error')), 10);
        }
        return mockRequest;
      });

      const result = await FileClient.isServerOnlineStatic('http://example.com:3000');
      
      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockURL.mockImplementation((path, baseUrl) => ({
        protocol: 'http:',
        toString: () => `${baseUrl}/status`
      }) as any);

      mockRequest.on.mockImplementation((event, handler) => {
        if (event === 'error') {
          // Call the error handler immediately for testing
          handler(new Error('Network error'));
        }
        return mockRequest;
      });

      const result = await FileClient.isServerOnlineStatic('http://example.com:3000');
      
      expect(result).toBe(false);
    });

    it('should return false when URL constructor throws error', async () => {
      mockURL.mockImplementation(() => {
        throw new Error('Invalid URL');
      });

      const result = await FileClient.isServerOnlineStatic('invalid-url');
      
      expect(result).toBe(false);
    });

    it('should handle multiple data chunks in status response', async () => {
      mockURL.mockImplementation((path, baseUrl) => ({
        protocol: 'http:',
        toString: () => `${baseUrl}/status`
      }) as any);

      mockResponse.on.mockImplementation((event, handler) => {
        if (event === 'data') {
          setTimeout(() => handler(Buffer.from('{"stat')), 10);
          setTimeout(() => handler(Buffer.from('us":"online"}')), 15);
        } else if (event === 'end') {
          setTimeout(() => handler(), 20);
        }
        return mockResponse;
      });

      const result = await FileClient.isServerOnlineStatic('http://example.com:3000');
      
      expect(result).toBe(true);
    });
  });

  describe('File Size Limit', () => {
    it('should reject WebTorrent downloads exceeding maxFileSizeBytes', async () => {
      const client = new FileClient();
      
      // Mock WebTorrent client and torrent
      const mockTorrent = {
        name: 'large-file.txt',
        length: 2048, // 2KB file
        files: [{ 
          name: 'large-file.txt',
          createReadStream: jest.fn().mockReturnValue({
            on: jest.fn()
          })
        }],
        on: jest.fn(),
        destroy: jest.fn()
      };

      const mockWebTorrentClient = {
        add: jest.fn().mockReturnValue(mockTorrent),
        destroy: jest.fn(),
        on: jest.fn()
      };

      // Set up torrent 'ready' event to trigger immediately with file size check
      mockTorrent.on.mockImplementation((event, handler) => {
        if (event === 'ready') {
          setTimeout(() => handler(), 10);
        }
        return mockTorrent;
      });

      // Inject mocked WebTorrent client
      (client as any).webTorrentClient = mockWebTorrentClient;

      // Test: File size (2048 bytes) exceeds limit (1024 bytes)
      await expect(
        client.downloadAsBuffer('magnet:?xt=urn:btih:test&dn=large-file.txt', {
          maxFileSizeBytes: 1024 // 1KB limit
        })
      ).rejects.toThrow('File size (0.00 MB) exceeds maximum allowed size (0.00 MB)');

      expect(mockTorrent.destroy).toHaveBeenCalled();
    });

    it('should allow WebTorrent downloads within maxFileSizeBytes', async () => {
      const client = new FileClient();
      
      // Mock WebTorrent client and torrent
      const mockStream = {
        on: jest.fn()
      };

      const mockTorrent = {
        name: 'small-file.txt',
        length: 512, // 512 bytes file
        files: [{ 
          name: 'small-file.txt',
          createReadStream: jest.fn().mockReturnValue(mockStream)
        }],
        on: jest.fn(),
        destroy: jest.fn()
      };

      const mockWebTorrentClient = {
        add: jest.fn().mockReturnValue(mockTorrent),
        destroy: jest.fn(),
        on: jest.fn()
      };

      // Set up torrent 'ready' event and stream events
      mockTorrent.on.mockImplementation((event, handler) => {
        if (event === 'ready') {
          setTimeout(() => handler(), 10);
        }
        return mockTorrent;
      });

      mockStream.on.mockImplementation((event, handler) => {
        if (event === 'data') {
          setTimeout(() => handler(Buffer.from('test content')), 20);
        } else if (event === 'end') {
          setTimeout(() => handler(), 30);
        }
        return mockStream;
      });

      // Inject mocked WebTorrent client
      (client as any).webTorrentClient = mockWebTorrentClient;

      // Test: File size (512 bytes) is within limit (1024 bytes)
      const result = await client.downloadAsBuffer('magnet:?xt=urn:btih:test&dn=small-file.txt', {
        maxFileSizeBytes: 1024 // 1KB limit
      });

      expect(result).toBeInstanceOf(Buffer);
      expect(result.toString()).toBe('test content');
      expect(mockTorrent.destroy).toHaveBeenCalled();
    });

    it('should not apply size limit to HTTP downloads', async () => {
      // Mock large response
      const largeContent = 'X'.repeat(2048); // 2KB content
      mockResponse.headers = { 'content-length': '2048' };
      mockResponse.on.mockImplementation((event, handler) => {
        if (event === 'data') {
          setTimeout(() => handler(Buffer.from(largeContent)), 10);
        } else if (event === 'end') {
          setTimeout(() => handler(), 20);
        }
        return mockResponse;
      });

      const client = new FileClient();
      
      // Test: HTTP download should ignore maxFileSizeBytes
      const result = await client.downloadAsBuffer('http://example.com/large-file.txt', {
        maxFileSizeBytes: 1024 // 1KB limit - should be ignored for HTTP
      });

      expect(result.toString()).toBe(largeContent);
    });
  });
});

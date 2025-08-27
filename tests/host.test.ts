// Mock modules before importing
jest.mock('node:fs');
jest.mock('node:crypto'); 
jest.mock('node:os');
jest.mock('express');
jest.mock('webtorrent');
jest.mock('nat-upnp');
jest.mock('public-ip');
jest.mock('../src/registry/gun-registry');

import { FileHost, ConnectionMode } from '../src/host';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import * as os from 'node:os';
import express from 'express';
import WebTorrent from 'webtorrent';
import { GunRegistry } from '../src/registry/gun-registry';

// Mock implementations
const mockFs = fs as jest.Mocked<typeof fs>;
const mockCrypto = crypto as jest.Mocked<typeof crypto>;
const mockOs = os as jest.Mocked<typeof os>;
const mockExpress = express as jest.MockedFunction<typeof express>;
const MockWebTorrent = WebTorrent as jest.MockedClass<typeof WebTorrent>;
const MockGunRegistry = GunRegistry as jest.MockedClass<typeof GunRegistry>;

// Mock express app
const mockApp = {
  get: jest.fn(),
  listen: jest.fn(),
  use: jest.fn()
};

// Mock server
const mockServer = {
  address: jest.fn(),
  close: jest.fn(),
  on: jest.fn()
};

// Mock WebTorrent instance
const mockWebTorrentInstance = {
  seed: jest.fn(),
  get: jest.fn(),
  destroy: jest.fn(),
  on: jest.fn()
};

// Mock torrent
const mockTorrent = {
  magnetURI: 'magnet:?xt=urn:btih:test-hash&dn=test-file',
  destroy: jest.fn()
};

// Mock GunRegistry instance
const mockGunRegistryInstance = {
  register: jest.fn(),
  unregister: jest.fn(),
  isAvailable: jest.fn().mockReturnValue(true)
};

// Mock hash instance
const mockHash = {
  update: jest.fn().mockReturnThis(),
  digest: jest.fn().mockReturnValue('test-file-hash-123456789abcdef')
};

// Mock stream
const createMockStream = (): any => ({
  on: jest.fn((event: string, callback: any): any => {
    if (event === 'data') {
      setTimeout(() => callback(Buffer.from('test content')), 0);
    } else if (event === 'end') {
      setTimeout(() => callback(), 5);
    }
    return createMockStream();
  }),
  pipe: jest.fn()
});

describe('FileHost', () => {
  let fileHost: FileHost;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup express mocks
    mockExpress.mockReturnValue(mockApp as any);
    mockServer.address.mockReturnValue({ port: 3000 });
    
    // Mock listen to call callback immediately
    mockApp.listen.mockImplementation((port: any, host: any, callback: any) => {
      setTimeout(() => callback(), 0);
      return mockServer;
    });
    
    // Setup WebTorrent mocks
    MockWebTorrent.mockImplementation(() => mockWebTorrentInstance as any);
    mockWebTorrentInstance.seed.mockImplementation((file: any, callback: any) => {
      setTimeout(() => callback(mockTorrent), 0);
    });
    
    // Setup fs mocks
    mockFs.existsSync.mockReturnValue(true);
    mockFs.createReadStream.mockImplementation(() => createMockStream() as any);
    mockFs.statSync.mockReturnValue({ size: 1024 } as any);
    
    // Setup crypto mocks
    mockCrypto.createHash.mockReturnValue(mockHash as any);
    
    // Setup os mocks
    mockOs.networkInterfaces.mockReturnValue({
      'Wi-Fi': [{
        family: 'IPv4' as any,
        address: '192.168.1.100',
        internal: false,
        netmask: '255.255.255.0',
        mac: '00:00:00:00:00:00',
        cidr: '192.168.1.100/24'
      }]
    });
    
    // Setup GunRegistry mocks
    MockGunRegistry.mockImplementation(() => mockGunRegistryInstance as any);
    
    fileHost = new FileHost({ port: 3000 });
  });

  describe('Constructor', () => {
    it('should initialize with default options', () => {
      const host = new FileHost();
      expect(host).toBeInstanceOf(FileHost);
    });

    it('should initialize with custom options', () => {
      const host = new FileHost({
        port: 8080,
        connectionMode: ConnectionMode.HTTP_ONLY,
        ttl: 7200,
        storeId: 'custom-store-id'
      });
      expect(host).toBeInstanceOf(FileHost);
    });

    it('should initialize with gun registry when gun options provided', () => {
      new FileHost({
        gun: {
          peers: ['http://example.com:8080/gun'],
          namespace: 'test-namespace'
        }
      });
      expect(MockGunRegistry).toHaveBeenCalledWith({
        peers: ['http://example.com:8080/gun'],
        namespace: 'test-namespace'
      });
    });

    it('should setup express routes', () => {
      new FileHost();
      expect(mockApp.get).toHaveBeenCalledWith('/files/:hash', expect.any(Function));
      expect(mockApp.get).toHaveBeenCalledWith('/status', expect.any(Function));
    });
  });

  describe('Route Handlers', () => {
    let fileRouteHandler: any;
    let statusRouteHandler: any;

    beforeEach(() => {
      const getCalls = mockApp.get.mock.calls;
      fileRouteHandler = getCalls.find(call => call[0] === '/files/:hash')?.[1];
      statusRouteHandler = getCalls.find(call => call[0] === '/status')?.[1];
    });

    describe('/files/:hash route', () => {
      it('should return 404 when file not found', () => {
        const mockReq = { params: { hash: 'non-existent-hash' } };
        const mockRes = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn()
        };

        fileRouteHandler(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(404);
        expect(mockRes.json).toHaveBeenCalledWith({ error: 'File not found' });
      });

      it('should return 404 when file no longer exists on disk', async () => {
        // Share a file first
        const hash = await fileHost.shareFile('/test/file.txt');
        
        // Mock file no longer existing
        mockFs.existsSync.mockReturnValueOnce(false);
        
        const mockReq = { params: { hash } };
        const mockRes = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn()
        };

        fileRouteHandler(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(404);
        expect(mockRes.json).toHaveBeenCalledWith({ error: 'File no longer exists' });
      });

      it('should serve file successfully', async () => {
        // Share a file first
        const hash = await fileHost.shareFile('/test/file.txt');
        
        const mockReq = { params: { hash } };
        const mockRes = {
          setHeader: jest.fn(),
          status: jest.fn().mockReturnThis(),
          json: jest.fn()
        };

        const mockStream = { pipe: jest.fn() };
        mockFs.createReadStream.mockReturnValueOnce(mockStream as any);

        fileRouteHandler(mockReq, mockRes);

        expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Length', 1024);
        expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');
        expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Disposition', `attachment; filename=${hash}`);
        expect(mockStream.pipe).toHaveBeenCalledWith(mockRes);
      });
    });

    describe('/status route', () => {
      it('should return server status', async () => {
        // Share some files
        await fileHost.shareFile('/test/file1.txt');
        await fileHost.shareFile('/test/file2.txt');

        const mockReq = {};
        const mockRes = { json: jest.fn() };

        statusRouteHandler(mockReq, mockRes);

        expect(mockRes.json).toHaveBeenCalledWith({
          status: 'online',
          availableFiles: expect.any(Array)
        });
      });
    });
  });

  describe('Server Lifecycle', () => {
    describe('start()', () => {
      it('should start HTTP server in HTTP_ONLY mode', async () => {
        const host = new FileHost({ connectionMode: ConnectionMode.HTTP_ONLY, port: 3000 });
        
        const capabilities = await host.start();

        expect(mockApp.listen).toHaveBeenCalledWith(3000, '0.0.0.0', expect.any(Function));
        expect(capabilities.storeId).toBeDefined();
        expect(capabilities.directHttp).toBeDefined();
        expect(capabilities.directHttp?.available).toBe(true);
      }, 10000);

      it('should start WebTorrent in WEBTORRENT_ONLY mode', async () => {
        const host = new FileHost({ connectionMode: ConnectionMode.WEBTORRENT_ONLY });
        
        const capabilities = await host.start();

        expect(MockWebTorrent).toHaveBeenCalled();
        expect(capabilities.webTorrent).toBeDefined();
        expect(capabilities.webTorrent?.available).toBe(true);
      }, 10000);

      it('should start both HTTP and WebTorrent in AUTO mode', async () => {
        const host = new FileHost({ connectionMode: ConnectionMode.AUTO, port: 3000 });
        
        const capabilities = await host.start();

        expect(mockApp.listen).toHaveBeenCalled();
        expect(MockWebTorrent).toHaveBeenCalled();
        expect(capabilities.directHttp?.available).toBeUndefined(); // UPnP fails so directHttp is not set
        expect(capabilities.webTorrent?.available).toBe(true);
      }, 10000);

      it('should throw error when HTTP fails in HTTP_ONLY mode', async () => {
        mockApp.listen.mockImplementation(() => {
          throw new Error('Port in use');
        });

        const host = new FileHost({ connectionMode: ConnectionMode.HTTP_ONLY });
        
        await expect(host.start()).rejects.toThrow('HTTP-only mode requested but HTTP server failed');
      });

      it('should throw error when WebTorrent fails in WEBTORRENT_ONLY mode', async () => {
        MockWebTorrent.mockImplementation(() => {
          throw new Error('WebTorrent init failed');
        });

        const host = new FileHost({ connectionMode: ConnectionMode.WEBTORRENT_ONLY });
        
        await expect(host.start()).rejects.toThrow('WebTorrent-only mode requested but WebTorrent failed');
      });

      it('should register with gun registry when available', async () => {
        const host = new FileHost({
          connectionMode: ConnectionMode.HTTP_ONLY,
          gun: { peers: ['http://test.com/gun'] }
        });
        
        await host.start();

        expect(mockGunRegistryInstance.register).toHaveBeenCalledWith(
          expect.objectContaining({
            storeId: expect.any(String)
          })
        );
      }, 10000);
    });

    describe('stop()', () => {
      it('should stop HTTP server', async () => {
        await fileHost.start();
        mockServer.close.mockImplementation((callback: any) => callback());
        
        await fileHost.stop();

        expect(mockServer.close).toHaveBeenCalled();
      }, 10000);

      it('should stop WebTorrent client', async () => {
        const host = new FileHost({ connectionMode: ConnectionMode.WEBTORRENT_ONLY });
        await host.start();
        
        await host.stop();

        expect(mockWebTorrentInstance.destroy).toHaveBeenCalled();
      }, 10000);

      it('should unregister from gun registry', async () => {
        const host = new FileHost({
          gun: { peers: ['http://test.com/gun'] }
        });
        await host.start();
        
        await host.stop();

        expect(mockGunRegistryInstance.unregister).toHaveBeenCalledWith(
          expect.any(String)
        );
      }, 10000);

      it('should handle server close errors', async () => {
        await fileHost.start();
        mockServer.close.mockImplementation((callback: any) => 
          callback(new Error('Close failed'))
        );
        
        await expect(fileHost.stop()).rejects.toThrow('Close failed');
      }, 10000);
    });
  });

  describe('File Management', () => {
    describe('shareFile()', () => {
      it('should share a file successfully', async () => {
        // Mock file exists but hash file doesn't exist initially
        mockFs.existsSync.mockReturnValueOnce(true);  // Original file exists
        mockFs.existsSync.mockReturnValueOnce(false); // Hash file doesn't exist
        
        const hash = await fileHost.shareFile('/test/file.txt');

        expect(hash).toBe('test-file-hash-123456789abcdef');
        expect(mockFs.copyFileSync).toHaveBeenCalledWith('/test/file.txt', hash);
        expect(fileHost.getSharedFiles()).toContain(hash);
      });

      it('should throw error when file does not exist', async () => {
        mockFs.existsSync.mockReturnValueOnce(false);

        await expect(fileHost.shareFile('/non-existent.txt'))
          .rejects.toThrow('File not found: /non-existent.txt');
      });

      it('should not copy file if hash file already exists', async () => {
        mockFs.existsSync.mockReturnValueOnce(true); // Original file exists
        mockFs.existsSync.mockReturnValueOnce(true); // Hash file already exists

        await fileHost.shareFile('/test/file.txt');

        expect(mockFs.copyFileSync).not.toHaveBeenCalled();
      });

      it('should seed file with WebTorrent when available', async () => {
        const host = new FileHost({ connectionMode: ConnectionMode.AUTO });
        await host.start();

        await host.shareFile('/test/file.txt');

        expect(mockWebTorrentInstance.seed).toHaveBeenCalled();
      }, 10000);

      it('should update gun registry with magnet URIs', async () => {
        const host = new FileHost({
          connectionMode: ConnectionMode.AUTO,
          gun: { peers: ['http://test.com/gun'] }
        });
        await host.start();

        await host.shareFile('/test/file.txt');

        expect(mockGunRegistryInstance.register).toHaveBeenCalledTimes(2); // Once on start, once after sharing
      }, 10000);
    });

    describe('unshareFile()', () => {
      it('should unshare a file', async () => {
        const hash = await fileHost.shareFile('/test/file.txt');
        
        const result = fileHost.unshareFile(hash);

        expect(result).toBe(true);
        expect(fileHost.getSharedFiles()).not.toContain(hash);
      });

      it('should return false for non-existent file', () => {
        const result = fileHost.unshareFile('non-existent-hash');
        expect(result).toBe(false);
      });

      it('should delete file when deleteFile is true', async () => {
        const hash = await fileHost.shareFile('/test/file.txt');
        
        fileHost.unshareFile(hash, true);

        expect(mockFs.unlinkSync).toHaveBeenCalledWith(hash);
      });

      it('should stop WebTorrent seeding', async () => {
        const host = new FileHost({ connectionMode: ConnectionMode.AUTO });
        await host.start();
        
        const hash = await host.shareFile('/test/file.txt');
        
        const mockTorrentInstance = { destroy: jest.fn() };
        mockWebTorrentInstance.get.mockReturnValue(mockTorrentInstance as any);
        
        host.unshareFile(hash);

        expect(mockWebTorrentInstance.get).toHaveBeenCalledWith(mockTorrent.magnetURI);
        expect(mockTorrentInstance.destroy).toHaveBeenCalled();
      }, 10000);
    });

    describe('getSharedFiles()', () => {
      it('should return empty array when no files shared', () => {
        expect(fileHost.getSharedFiles()).toEqual([]);
      });

      it('should return array of shared file hashes', async () => {
        // Use different hashes for different files by modifying the mock
        let callCount = 0;
        mockHash.digest.mockImplementation(() => {
          callCount++;
          return `test-file-hash-${callCount}23456789abcdef`;
        });
        
        const hash1 = await fileHost.shareFile('/test/file1.txt');
        const hash2 = await fileHost.shareFile('/test/file2.txt');

        const sharedFiles = fileHost.getSharedFiles();
        expect(sharedFiles).toContain(hash1);
        expect(sharedFiles).toContain(hash2);
        expect(sharedFiles).toHaveLength(2);
      });
    });

    describe('getMagnetUris()', () => {
      it('should return magnet URIs for shared files', async () => {
        const host = new FileHost({ connectionMode: ConnectionMode.AUTO });
        await host.start();
        
        await host.shareFile('/test/file.txt');

        const magnetUris = host.getMagnetUris();
        expect(magnetUris).toContain(mockTorrent.magnetURI);
      }, 10000);
    });

    describe('getFileUrl()', () => {
      it('should return HTTP URL when HTTP server is available', async () => {
        // Create fresh mock server for this test with proper event handling
        const freshMockServer = {
          close: jest.fn().mockImplementation((callback: any) => callback()),
          listen: jest.fn(),
          on: jest.fn().mockImplementation((event, callback) => {
            if (event === 'listening') {
              setTimeout(() => callback(), 0); // Trigger listening event
            }
          }),
          address: jest.fn().mockReturnValue({ port: 3000 })
        };
        
        // Mock the app.listen to return our fresh server and call the callback
        mockApp.listen.mockImplementation((port: any, host: any, callback: any) => {
          setTimeout(() => callback(), 0);
          return freshMockServer;
        });
        
        // Create a new instance with HTTP_ONLY mode to avoid UPnP failures
        const hostWithHttp = new FileHost({ 
          port: 3000, 
          connectionMode: ConnectionMode.HTTP_ONLY 
        });
        
        await hostWithHttp.start();
        const hash = await hostWithHttp.shareFile('/test/file.txt');

        const url = await hostWithHttp.getFileUrl(hash);

        expect(url).toBe(`http://192.168.1.100:3000/files/${hash}`);
        
        await hostWithHttp.stop();
      }, 15000);

      it('should return magnet URI when only WebTorrent is available', async () => {
        const host = new FileHost({ connectionMode: ConnectionMode.WEBTORRENT_ONLY });
        await host.start();
        const hash = await host.shareFile('/test/file.txt');

        const url = await host.getFileUrl(hash);

        expect(url).toBe(mockTorrent.magnetURI);
      }, 10000);

      it('should throw error when file not shared', async () => {
        await expect(fileHost.getFileUrl('non-existent-hash'))
          .rejects.toThrow('No file with hash: non-existent-hash');
      });

      it('should throw error when no connection methods available', async () => {
        const hash = await fileHost.shareFile('/test/file.txt');

        await expect(fileHost.getFileUrl(hash))
          .rejects.toThrow('is not available via any connection method');
      });
    });
  });

  describe('Network Detection', () => {
    it('should detect local IP from Wi-Fi interface', () => {
      const result = (fileHost as any).detectLocalIp();
      expect(result).toBe('192.168.1.100');
    });

    it('should detect local IP from Ethernet interface', () => {
      mockOs.networkInterfaces.mockReturnValue({
        'Ethernet': [{
          family: 'IPv4' as any,
          address: '10.0.0.50',
          internal: false,
          netmask: '255.255.255.0',
          mac: '00:00:00:00:00:00',
          cidr: '10.0.0.50/24'
        }]
      });

      const result = (fileHost as any).detectLocalIp();
      expect(result).toBe('10.0.0.50');
    });

    it('should return null when no valid interfaces found', () => {
      mockOs.networkInterfaces.mockReturnValue({});

      const result = (fileHost as any).detectLocalIp();
      expect(result).toBeNull();
    });

    it('should skip internal interfaces', () => {
      mockOs.networkInterfaces.mockReturnValue({
        'lo': [{
          family: 'IPv4' as any,
          address: '127.0.0.1',
          internal: true,
          netmask: '255.0.0.0',
          mac: '00:00:00:00:00:00',
          cidr: '127.0.0.1/8'
        }],
        'eth0': [{
          family: 'IPv4' as any,
          address: '192.168.1.200',
          internal: false,
          netmask: '255.255.255.0',
          mac: '00:00:00:00:00:00',
          cidr: '192.168.1.200/24'
        }]
      });

      const result = (fileHost as any).detectLocalIp();
      expect(result).toBe('192.168.1.200');
    });
  });

  describe('Utility Methods', () => {
    it('should generate unique store IDs', () => {
      const id1 = (fileHost as any).generateUniqueId();
      const id2 = (fileHost as any).generateUniqueId();

      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
    });

    it('should calculate file hash correctly', async () => {
      // Reset the hash counter for this specific test
      let currentHashCounter = 1;
      mockHash.digest.mockReturnValue(`test-file-hash-${currentHashCounter}23456789abcdef`);
      
      const result = await (fileHost as any).calculateFileHash('/test/file.txt');

      expect(result).toBe('test-file-hash-123456789abcdef');
      expect(mockCrypto.createHash).toHaveBeenCalledWith('sha256');
      expect(mockHash.digest).toHaveBeenCalledWith('hex');
    });
  });
});

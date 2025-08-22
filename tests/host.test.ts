// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  statSync: jest.fn(),
  createReadStream: jest.fn(),
  copyFileSync: jest.fn(),
  unlinkSync: jest.fn()
}));

// Mock nat-upnp
jest.mock('nat-upnp', () => ({
  createClient: jest.fn(() => ({
    portMapping: jest.fn(),
    portUnmapping: jest.fn(),
    externalIp: jest.fn()
  }))
}));

// Mock express
const mockApp = {
  get: jest.fn(),
  listen: jest.fn()
};
jest.mock('express', () => jest.fn(() => mockApp));

// Mock os module
jest.mock('os', () => ({
  networkInterfaces: jest.fn(),
  default: {
    networkInterfaces: jest.fn()
  }
}));

import { FileHost, ConnectionMode } from '../src/host';
import * as fs from 'fs';
import os from 'os';

// Get the mocked versions
const mockFs = fs as jest.Mocked<typeof fs>;
const mockOs = os as jest.Mocked<typeof os>;

describe('FileHost - Comprehensive Coverage', () => {
  let fileHost: FileHost;
  let mockServer: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock server
    mockServer = {
      address: jest.fn(),
      close: jest.fn()
    };
    
    mockApp.listen.mockReturnValue(mockServer);
    
    // Mock createReadStream to simulate a stream with events for calculateFileHash
    mockFs.createReadStream.mockImplementation((filePath: any) => {
      const mockStream: any = {
        on: jest.fn((event: string, callback: any) => {
          if (event === 'data') {
            // Simulate different data for different files to get different hashes
            const fileContent = `test file content for ${filePath}`;
            setTimeout(() => callback(Buffer.from(fileContent)), 0);
          } else if (event === 'end') {
            // Simulate stream end
            setTimeout(() => callback(), 10);
          } else if (event === 'error') {
            // Don't call error callback in normal case
          }
          return mockStream;
        }),
        pipe: jest.fn()
      };
      return mockStream;
    });
    
    fileHost = new FileHost({ port: 3000, ttl: 1800 });
  });

  describe('Constructor and Setup', () => {
    it('should initialize with default options', () => {
      const defaultHost = new FileHost();
      expect(defaultHost).toBeInstanceOf(FileHost);
    });

    it('should initialize with custom options', () => {
      const customHost = new FileHost({ port: 8080, ttl: 7200 });
      expect(customHost).toBeInstanceOf(FileHost);
    });

    it('should initialize with plain connection mode enabled', () => {
      const plainHost = new FileHost({ connectionMode: ConnectionMode.HTTP_ONLY, port: 8080 });
      expect(plainHost).toBeInstanceOf(FileHost);
      expect((plainHost as any).connectionMode).toBe(ConnectionMode.HTTP_ONLY);
      expect((plainHost as any).webTorrentClient).toBeNull();
    });

    it('should setup routes correctly', () => {
      // Verify that routes are set up
      expect(mockApp.get).toHaveBeenCalledWith('/files/:hash', expect.any(Function));
      expect(mockApp.get).toHaveBeenCalledWith('/status', expect.any(Function));
    });
  });

  describe('Route Handlers', () => {
    let fileRouteHandler: any;
    let statusRouteHandler: any;
    let mockReq: any;
    let mockRes: any;

    beforeEach(() => {
      // Get the route handlers from the mock calls
      const routeCalls = mockApp.get.mock.calls;
      fileRouteHandler = routeCalls.find(call => call[0] === '/files/:hash')?.[1];
      statusRouteHandler = routeCalls.find(call => call[0] === '/status')?.[1];

      mockReq = {
        params: { hash: 'test-hash' }
      };

      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
        pipe: jest.fn()
      };
    });

    describe('/files/:hash route', () => {
      it('should return 404 when file hash not found', () => {
        fileRouteHandler(mockReq, mockRes);
        
        expect(mockRes.status).toHaveBeenCalledWith(404);
        expect(mockRes.json).toHaveBeenCalledWith({ error: 'File not found' });
      });

      it('should return 404 when file no longer exists', async () => {
        // First share a file to add to mappings
        const testFilePath = '/test/file.txt';
        mockFs.existsSync.mockReturnValueOnce(true); // For shareFile
        const fileHash = await fileHost.shareFile(testFilePath);
        
        // Now simulate file not existing for the route
        mockFs.existsSync.mockReturnValueOnce(false);
        
        mockReq.params.hash = fileHash;
        fileRouteHandler(mockReq, mockRes);
        
        expect(mockRes.status).toHaveBeenCalledWith(404);
        expect(mockRes.json).toHaveBeenCalledWith({ error: 'File no longer exists' });
      });

      it('should serve file when it exists', async () => {
        // Setup mocks
        const testFilePath = '/test/file.txt';
        const fileStats = { size: 1024 };
        const mockStreamForRoute = { pipe: jest.fn() };

        mockFs.existsSync.mockReturnValue(true);
        mockFs.statSync.mockReturnValue(fileStats as any);

        // Share a file first (this will use the global createReadStream mock)
        const fileHash = await fileHost.shareFile(testFilePath);
        
        // Now override the mock for the route handling
        mockFs.createReadStream.mockReturnValue(mockStreamForRoute as any);
        
        mockReq.params.hash = fileHash;
        fileRouteHandler(mockReq, mockRes);
        
        expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Length', 1024);
        expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');
        expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Disposition', `attachment; filename=${fileHash}`);
        expect(mockStreamForRoute.pipe).toHaveBeenCalledWith(mockRes);
      });
    });

    describe('/status route', () => {
      it('should return server status with available files', async () => {
        // Add some files to the mappings
        mockFs.existsSync.mockReturnValue(true);
        const hash1 = await fileHost.shareFile('/test/file1.txt');
        const hash2 = await fileHost.shareFile('/test/file2.txt');

        statusRouteHandler(mockReq, mockRes);
        
        expect(mockRes.json).toHaveBeenCalledWith({
          status: 'online',
          availableFiles: expect.arrayContaining([hash1, hash2])
        });
      });
    });
  });

  describe('File Management', () => {
    describe('shareFile', () => {
      it('should throw error when file does not exist', async () => {
        mockFs.existsSync.mockReturnValue(false);
        
        await expect(async () => {
          await fileHost.shareFile('/non/existent/file.txt');
        }).rejects.toThrow('File not found: /non/existent/file.txt');
      });

      it('should return unique hash when file exists', async () => {
        mockFs.existsSync.mockReturnValue(true);
        
        const hash1 = await fileHost.shareFile('/test/file1.txt');
        const hash2 = await fileHost.shareFile('/test/file2.txt');
        
        expect(hash1).toBeTruthy();
        expect(hash2).toBeTruthy();
        expect(hash1).not.toBe(hash2);
        expect(typeof hash1).toBe('string');
        expect(hash1).toHaveLength(64); // SHA256 hash length
      });

      it('should copy file to hash-named location', async () => {
        mockFs.existsSync.mockReturnValueOnce(true); // Original file exists
        mockFs.existsSync.mockReturnValueOnce(false); // Hash file doesn't exist yet
        
        const hash = await fileHost.shareFile('/test/file.txt');
        
        expect(mockFs.copyFileSync).toHaveBeenCalledWith('/test/file.txt', hash);
        expect(hash).toBeTruthy();
      });

      it('should not copy file if hash-named file already exists', async () => {
        mockFs.existsSync.mockReturnValue(true); // Both original and hash files exist
        
        await fileHost.shareFile('/test/file.txt');
        
        expect(mockFs.copyFileSync).not.toHaveBeenCalled();
      });
    });

    describe('unshareFile', () => {
      it('should return false for non-existent file ID', () => {
        const result = fileHost.unshareFile('non-existent-id');
        expect(result).toBe(false);
      });

      it('should return true and remove existing file', async () => {
        mockFs.existsSync.mockReturnValue(true);
        const fileHash = await fileHost.shareFile('/test/file.txt');
        
        const result = fileHost.unshareFile(fileHash);
        expect(result).toBe(true);
        
        // Verify it's removed
        const sharedFiles = fileHost.getSharedFiles();
        expect(sharedFiles.includes(fileHash)).toBe(false);
      });

      it('should delete hash-named file when deleteFile is true', async () => {
        mockFs.existsSync.mockReturnValue(true);
        const fileHash = await fileHost.shareFile('/test/file.txt');
        
        // Mock file exists for deletion
        mockFs.existsSync.mockReturnValue(true);
        
        const result = fileHost.unshareFile(fileHash, true);
        expect(result).toBe(true);
        expect(mockFs.unlinkSync).toHaveBeenCalledWith(fileHash);
      });

      it('should handle file deletion errors gracefully', async () => {
        mockFs.existsSync.mockReturnValue(true);
        const fileHash = await fileHost.shareFile('/test/file.txt');
        
        // Mock file exists but deletion fails
        mockFs.existsSync.mockReturnValue(true);
        mockFs.unlinkSync.mockImplementation(() => {
          throw new Error('Permission denied');
        });
        
        // Should still return true (file removed from tracking)
        const result = fileHost.unshareFile(fileHash, true);
        expect(result).toBe(true);
      });
    });

    describe('getSharedFiles', () => {
      it('should return empty array when no files are shared', () => {
        const sharedFiles = fileHost.getSharedFiles();
        expect(sharedFiles).toEqual([]);
      });

      it('should return array of shared files', async () => {
        mockFs.existsSync.mockReturnValue(true);
        const hash1 = await fileHost.shareFile('/test/file1.txt');
        const hash2 = await fileHost.shareFile('/test/file2.txt');
        
        const sharedFiles = fileHost.getSharedFiles();
        expect(sharedFiles).toHaveLength(2);
        expect(sharedFiles).toContain(hash1);
        expect(sharedFiles).toContain(hash2);
      });
    });
  });

  describe('Server Lifecycle', () => {
    describe('start', () => {
      it('should reject when server fails to start', async () => {
        // Use HTTP_ONLY mode to force failure when HTTP server fails
        const httpOnlyHost = new FileHost({ connectionMode: ConnectionMode.HTTP_ONLY });
        
        mockApp.listen.mockImplementation((port, host, callback) => {
          // Simulate server not being created
          (httpOnlyHost as any).server = null;
          callback();
          return null;
        });

        await expect(httpOnlyHost.start()).rejects.toThrow('HTTP-only mode requested but HTTP server failed');
      });

      it('should reject when server address is invalid', async () => {
        // Use HTTP_ONLY mode to force failure when HTTP server fails
        const httpOnlyHost = new FileHost({ connectionMode: ConnectionMode.HTTP_ONLY });
        
        mockServer.address.mockReturnValue('string-address');
        
        mockApp.listen.mockImplementation((port, host, callback) => {
          // Properly set the server reference
          (httpOnlyHost as any).server = mockServer;
          callback();
          return mockServer;
        });

        await expect(httpOnlyHost.start()).rejects.toThrow('HTTP-only mode requested but HTTP server failed');
      });

      it('should reject when HTTP setup fails in HTTP_ONLY mode', async () => {
        // Use HTTP_ONLY mode to force failure when HTTP server setup fails
        const httpOnlyHost = new FileHost({ connectionMode: ConnectionMode.HTTP_ONLY });
        
        mockApp.listen.mockImplementation((port, host, callback) => {
          callback(new Error('Port binding failed'));
          return mockServer;
        });

        await expect(httpOnlyHost.start()).rejects.toThrow('HTTP-only mode requested but HTTP server failed');
      });

      it('should start successfully with plain connection mode', async () => {
        const plainHost = new FileHost({ connectionMode: ConnectionMode.HTTP_ONLY, port: 8080 });
        mockServer.address.mockReturnValue({ port: 8080 });
        
        // Mock os.networkInterfaces to return local IP
        mockOs.networkInterfaces.mockReturnValue({
          'Ethernet': [{
            family: 'IPv4',
            address: '192.168.1.100',
            internal: false,
            netmask: '255.255.255.0',
            mac: '00:00:00:00:00:00',
            cidr: '192.168.1.100/24'
          }]
        });

        mockApp.listen.mockImplementation((port, host, callback) => {
          (plainHost as any).server = mockServer;
          callback();
          return mockServer;
        });

        const result = await plainHost.start();
        expect(result).toEqual(expect.objectContaining({
          directHttp: expect.objectContaining({
            available: true,
            ip: '192.168.1.100',
            port: 8080
          }),
          storeId: expect.any(String)
        }));
        expect(result.storeId).toBeDefined();
        expect((plainHost as any).port).toBe(8080);
      });

      it('should reject when plain connection mode is enabled but local IP cannot be determined', async () => {
        const plainHost = new FileHost({ connectionMode: ConnectionMode.HTTP_ONLY, port: 8080 });
        mockServer.address.mockReturnValue({ port: 8080 });
        
        // Mock os.networkInterfaces to return no interfaces
        mockOs.networkInterfaces.mockReturnValue({});

        mockApp.listen.mockImplementation((port, host, callback) => {
          (plainHost as any).server = mockServer;
          callback();
          return mockServer;
        });

        await expect(plainHost.start()).rejects.toThrow('No connection methods available. Both HTTP and WebTorrent failed to initialize.');
      });
    });

    describe('stop', () => {
      it('should resolve immediately when no server is running', async () => {
        (fileHost as any).server = null;
        await expect(fileHost.stop()).resolves.toBeUndefined();
      });

      it('should reject when server.close fails', async () => {
        (fileHost as any).server = mockServer;
        mockServer.close.mockImplementation((callback: any) => {
          callback(new Error('Close failed'));
        });

        await expect(fileHost.stop()).rejects.toThrow('Close failed');
      });

      it('should resolve successfully when server closes', async () => {
        (fileHost as any).server = mockServer;
        (fileHost as any).externalPort = 3000;
        
        // Mock successful unmap
        const mockNatClient = {
          portMapping: jest.fn(),
          portUnmapping: jest.fn((options, callback) => {
            callback();
          }),
          externalIp: jest.fn()
        };
        (fileHost as any).upnpClient = mockNatClient;

        mockServer.close.mockImplementation((callback: any) => {
          callback(null);
        });

        await expect(fileHost.stop()).resolves.toBeUndefined();
        expect((fileHost as any).server).toBeNull();
      });

      it('should resolve successfully when plain connection mode is enabled', async () => {
        const plainHost = new FileHost({ connectionMode: ConnectionMode.HTTP_ONLY, port: 8080 });
        (plainHost as any).server = mockServer;

        mockServer.close.mockImplementation((callback: any) => {
          callback(null);
        });

        await expect(plainHost.stop()).resolves.toBeUndefined();
      });
    });
  });

  describe('UPnP and NAT-PMP Port Mapping', () => {
    it('should handle UPnP mapping failure gracefully', async () => {
      const mockNatClient = {
        portMapping: jest.fn((options, callback) => {
          callback(new Error('UPnP mapping failed'), null);
        }),
        portUnmapping: jest.fn(),
        externalIp: jest.fn()
      };
      (fileHost as any).upnpClient = mockNatClient;

      await (fileHost as any).mapPort();
      expect((fileHost as any).externalPort).toBe((fileHost as any).port);
    });

    it('should handle successful UPnP mapping with port info', async () => {
      const mockNatClient = {
        portMapping: jest.fn((options, callback) => {
          callback(null, { public: 8080 });
        }),
        portUnmapping: jest.fn(),
        externalIp: jest.fn()
      };
      (fileHost as any).upnpClient = mockNatClient;

      await (fileHost as any).mapPort();
      expect((fileHost as any).externalPort).toBe(8080);
    });

    it('should handle successful UPnP mapping without port info', async () => {
      const mockNatClient = {
        portMapping: jest.fn((options, callback) => {
          callback(null, {});
        }),
        portUnmapping: jest.fn(),
        externalIp: jest.fn()
      };
      (fileHost as any).upnpClient = mockNatClient;

      await (fileHost as any).mapPort();
      expect((fileHost as any).externalPort).toBe((fileHost as any).port);
    });

    it('should handle unmapPort when no external port is set', async () => {
      (fileHost as any).externalPort = null;
      await expect((fileHost as any).unmapPort()).resolves.toBeUndefined();
    });
  });

  describe('Local IP Detection', () => {
    it('should return null when no network interfaces found', () => {
      mockOs.networkInterfaces.mockReturnValue({});
      
      const result = (fileHost as any).detectLocalIp();
      expect(result).toBeNull();
    });

    it('should find IP from Wi-Fi interface', () => {
      mockOs.networkInterfaces.mockReturnValue({
        'Wi-Fi': [
          { 
            family: 'IPv4' as any, 
            internal: false, 
            address: '192.168.1.100',
            netmask: '255.255.255.0',
            mac: '00:00:00:00:00:00',
            cidr: '192.168.1.100/24'
          }
        ]
      });
      
      const result = (fileHost as any).detectLocalIp();
      expect(result).toBe('192.168.1.100');
    });

    it('should find IP from Ethernet interface', () => {
      mockOs.networkInterfaces.mockReturnValue({
        'Ethernet': [
          { 
            family: 'IPv4' as any, 
            internal: false, 
            address: '192.168.1.200',
            netmask: '255.255.255.0',
            mac: '00:00:00:00:00:00',
            cidr: '192.168.1.200/24'
          }
        ]
      });
      
      const result = (fileHost as any).detectLocalIp();
      expect(result).toBe('192.168.1.200');
    });

    it('should fallback to any non-internal IPv4', () => {
      mockOs.networkInterfaces.mockReturnValue({
        'Some Other Interface': [
          { 
            family: 'IPv4' as any, 
            internal: false, 
            address: '10.0.0.50',
            netmask: '255.255.255.0',
            mac: '00:00:00:00:00:00',
            cidr: '10.0.0.50/24'
          }
        ]
      });
      
      const result = (fileHost as any).detectLocalIp();
      expect(result).toBe('10.0.0.50');
    });

    it('should skip internal interfaces', () => {
      mockOs.networkInterfaces.mockReturnValue({
        'lo': [
          { 
            family: 'IPv4' as any, 
            internal: true, 
            address: '127.0.0.1',
            netmask: '255.0.0.0',
            mac: '00:00:00:00:00:00',
            cidr: '127.0.0.1/8'
          }
        ],
        'eth0': [
          { 
            family: 'IPv4' as any, 
            internal: false, 
            address: '192.168.1.100',
            netmask: '255.255.255.0',
            mac: '00:00:00:00:00:00',
            cidr: '192.168.1.100/24'
          }
        ]
      });
      
      const result = (fileHost as any).detectLocalIp();
      expect(result).toBe('192.168.1.100');
    });

    it('should skip IPv6 interfaces', () => {
      mockOs.networkInterfaces.mockReturnValue({
        'eth0': [
          { 
            family: 'IPv6' as any, 
            internal: false, 
            address: '::1',
            netmask: 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
            mac: '00:00:00:00:00:00',
            cidr: '::1/128',
            scopeid: 0
          },
          { 
            family: 'IPv4' as any, 
            internal: false, 
            address: '192.168.1.100',
            netmask: '255.255.255.0',
            mac: '00:00:00:00:00:00',
            cidr: '192.168.1.100/24'
          }
        ]
      });
      
      const result = (fileHost as any).detectLocalIp();
      expect(result).toBe('192.168.1.100');
    });
  });

  describe('getFileUrl', () => {
    it('should throw error when file hash does not exist', async () => {
      await expect(fileHost.getFileUrl('non-existent-hash'))
        .rejects.toThrow('No file with hash: non-existent-hash');
    });

    it('should throw error when server is not started', async () => {
      mockFs.existsSync.mockReturnValue(true);
      const fileHash = await fileHost.shareFile('/test/file.txt');
      
      await expect(fileHost.getFileUrl(fileHash))
        .rejects.toThrow('File 7603d73072ff1525fdd48d695b2be5b00d8fe20bc79778575b8f514d282f1978 is not available via any connection method');
    });

    it('should return correct URL with local IP when plain connection mode is enabled', async () => {
      const plainHost = new FileHost({ connectionMode: ConnectionMode.HTTP_ONLY, port: 8080 });
      mockFs.existsSync.mockReturnValue(true);
      const fileHash = await plainHost.shareFile('/test/file.txt');
      
      // Set up server mock and capabilities manually
      mockServer.address.mockReturnValue({ port: 8080 });
      (plainHost as any).server = mockServer;
      (plainHost as any).capabilities = {
        directHttp: {
          available: true,
          ip: '192.168.1.50',
          port: 8080
        }
      };
      
      // Mock os.networkInterfaces to return local IP
      mockOs.networkInterfaces.mockReturnValue({
        'Wi-Fi': [{
          family: 'IPv4',
          address: '192.168.1.50',
          internal: false,
          netmask: '255.255.255.0',
          mac: '00:00:00:00:00:00',
          cidr: '192.168.1.50/24'
        }]
      });
      
      const url = await plainHost.getFileUrl(fileHash);
      expect(url).toBe(`http://192.168.1.50:8080/files/${fileHash}`);
    });

    it('should throw error when plain connection mode is enabled but local IP cannot be determined', async () => {
      const plainHost = new FileHost({ connectionMode: ConnectionMode.HTTP_ONLY, port: 8080 });
      mockFs.existsSync.mockReturnValue(true);
      const fileHash = await plainHost.shareFile('/test/file.txt');
      
      // Mock os.networkInterfaces to return no valid interfaces
      mockOs.networkInterfaces.mockReturnValue({});
      
      await expect(plainHost.getFileUrl(fileHash))
        .rejects.toThrow('File 7603d73072ff1525fdd48d695b2be5b00d8fe20bc79778575b8f514d282f1978 is not available via any connection method');
    });
  });

  describe('Utility Methods', () => {
    it('should generate unique IDs', () => {
      const id1 = (fileHost as any).generateUniqueId();
      const id2 = (fileHost as any).generateUniqueId();
      
      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(typeof id2).toBe('string');
    });
  });
});

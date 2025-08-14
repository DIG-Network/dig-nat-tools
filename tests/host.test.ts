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

// Mock nat-pmp
const mockNatPmpClient = {
  portMapping: jest.fn(),
  portUnmapping: jest.fn(),
  externalIp: jest.fn(),
  close: jest.fn()
};

jest.mock('nat-pmp', () => ({
  connect: jest.fn(() => mockNatPmpClient)
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

    it('should initialize with NAT-PMP enabled', () => {
      const natPmpHost = new FileHost({ connectionMode: ConnectionMode.NAT_PMP });
      expect(natPmpHost).toBeInstanceOf(FileHost);
    });

    it('should initialize with plain connection mode enabled', () => {
      const plainHost = new FileHost({ connectionMode: ConnectionMode.PLAIN, port: 8080 });
      expect(plainHost).toBeInstanceOf(FileHost);
      expect((plainHost as any).connectionMode).toBe(ConnectionMode.PLAIN);
      expect((plainHost as any).upnpClient).toBeNull();
      expect((plainHost as any).natPmpClient).toBeNull();
    });

    it('should fallback to UPnP when NAT-PMP initialization fails', () => {
      // Mock NAT-PMP connect to throw error
      const natPmp = jest.requireMock('nat-pmp');
      natPmp.connect.mockImplementationOnce(() => {
        throw new Error('NAT-PMP not available');
      });

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const natPmpHost = new FileHost({ connectionMode: ConnectionMode.NAT_PMP });
      
      expect(natPmpHost).toBeInstanceOf(FileHost);
      expect((natPmpHost as any).connectionMode).toBe(ConnectionMode.UPNP);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to initialize NAT-PMP client, falling back to UPnP:',
        expect.any(Error)
      );
      
      consoleWarnSpy.mockRestore();
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
        mockApp.listen.mockImplementation((port, host, callback) => {
          // Simulate server not being created
          (fileHost as any).server = null;
          callback();
          return null;
        });

        await expect(fileHost.start()).rejects.toThrow('Failed to start server');
      });

      it('should reject when server address is invalid', async () => {
        mockServer.address.mockReturnValue('string-address');
        
        mockApp.listen.mockImplementation((port, host, callback) => {
          // Properly set the server reference
          (fileHost as any).server = mockServer;
          callback();
          return mockServer;
        });

        await expect(fileHost.start()).rejects.toThrow('Invalid server address');
      });

      it('should reject when mapPort or getExternalIp throws error', async () => {
        mockServer.address.mockReturnValue({ port: 3000 });
        
        // Mock UPnP client to throw error
        const mockNatClient = {
          portMapping: jest.fn((options, callback) => {
            callback(new Error('UPnP failed'), null);
          }),
          portUnmapping: jest.fn(),
          externalIp: jest.fn((callback) => {
            callback(new Error('External IP failed'), null);
          })
        };
        (fileHost as any).client = mockNatClient;

        mockApp.listen.mockImplementation((port, host, callback) => {
          callback();
          return mockServer;
        });

        await expect(fileHost.start()).rejects.toThrow();
      });

      it('should resolve successfully with external IP and port (NAT-PMP)', async () => {
        const natPmpHost = new FileHost({ connectionMode: ConnectionMode.NAT_PMP });
        mockServer.address.mockReturnValue({ port: 3000 });
        
        // Mock successful NAT-PMP
        mockNatPmpClient.portMapping.mockImplementation((options, callback) => {
          callback(null, { public: 3000, private: 3000, ttl: 3600, type: 1, epoch: Date.now() });
        });
        
        mockNatPmpClient.externalIp.mockImplementation((callback) => {
          callback(null, { ip: [203, 0, 113, 1], type: 0, epoch: Date.now() });
        });

        mockApp.listen.mockImplementation((port, host, callback) => {
          // Properly set the server reference
          (natPmpHost as any).server = mockServer;
          callback();
          return mockServer;
        });

        const result = await natPmpHost.start();
        expect(result).toEqual({
          externalIp: '203.0.113.1',
          port: 3000
        });
      });

      it('should handle NAT-PMP external IP returning private IP', async () => {
        const natPmpHost = new FileHost({ connectionMode: ConnectionMode.NAT_PMP });
        mockServer.address.mockReturnValue({ port: 3000 });
        
        // Mock NAT-PMP returning private IP (cascading network)
        mockNatPmpClient.portMapping.mockImplementation((options, callback) => {
          callback(null, { public: 3000, private: 3000, ttl: 3600, type: 1, epoch: Date.now() });
        });
        
        mockNatPmpClient.externalIp.mockImplementation((callback) => {
          callback(null, { ip: [192, 168, 1, 1], type: 0, epoch: Date.now() });
        });

        mockApp.listen.mockImplementation((port, host, callback) => {
          (natPmpHost as any).server = mockServer;
          callback();
          return mockServer;
        });

        await expect(natPmpHost.start()).rejects.toThrow('Cascading network topology detected (NAT-PMP returned private IP 192.168.1.1)');
      });

      it('should start successfully with plain connection mode', async () => {
        const plainHost = new FileHost({ connectionMode: ConnectionMode.PLAIN, port: 8080 });
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
        expect(result).toEqual({
          externalIp: '192.168.1.100',
          port: 8080
        });
        expect((plainHost as any).externalPort).toBe(8080);
      });

      it('should reject when plain connection mode is enabled but local IP cannot be determined', async () => {
        const plainHost = new FileHost({ connectionMode: ConnectionMode.PLAIN, port: 8080 });
        mockServer.address.mockReturnValue({ port: 8080 });
        
        // Mock os.networkInterfaces to return no interfaces
        mockOs.networkInterfaces.mockReturnValue({});

        mockApp.listen.mockImplementation((port, host, callback) => {
          (plainHost as any).server = mockServer;
          callback();
          return mockServer;
        });

        await expect(plainHost.start()).rejects.toThrow('Could not determine local IP address');
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
        expect((fileHost as any).externalPort).toBeNull();
      });

      it('should resolve successfully when plain connection mode is enabled', async () => {
        const plainHost = new FileHost({ connectionMode: ConnectionMode.PLAIN, port: 8080 });
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

    it('should handle NAT-PMP mapping successfully', async () => {
      const natPmpHost = new FileHost({ connectionMode: ConnectionMode.NAT_PMP });
      
      // Mock successful NAT-PMP mapping
      mockNatPmpClient.portMapping.mockImplementation((options, callback) => {
        callback(null, { public: 9090, private: 3000, ttl: 3600, type: 1, epoch: Date.now() });
      });

      await (natPmpHost as any).mapPort();
      expect((natPmpHost as any).externalPort).toBe(9090);
    });

    it('should fallback to UPnP when NAT-PMP mapping fails', async () => {
      const natPmpHost = new FileHost({ connectionMode: ConnectionMode.NAT_PMP });
      
      // Mock NAT-PMP mapping failure
      mockNatPmpClient.portMapping.mockImplementation((options, callback) => {
        callback(new Error('NAT-PMP mapping failed'), null);
      });

      // Mock successful UPnP fallback
      const mockUpnpClient = {
        portMapping: jest.fn((options, callback) => {
          callback(null, { public: 7070 });
        }),
        portUnmapping: jest.fn(),
        externalIp: jest.fn()
      };
      (natPmpHost as any).upnpClient = mockUpnpClient;

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      
      await (natPmpHost as any).mapPort();
      
      expect(consoleWarnSpy).toHaveBeenCalledWith('NAT-PMP port mapping failed: NAT-PMP mapping failed');
      expect(consoleWarnSpy).toHaveBeenCalledWith('Falling back to UPnP...');
      expect((natPmpHost as any).externalPort).toBe(7070);
      
      consoleWarnSpy.mockRestore();
    });

    it('should handle unmapPort when no external port is set', async () => {
      (fileHost as any).externalPort = null;
      await expect((fileHost as any).unmapPort()).resolves.toBeUndefined();
    });

    it('should handle NAT-PMP unmapping', async () => {
      const natPmpHost = new FileHost({ connectionMode: ConnectionMode.NAT_PMP });
      (natPmpHost as any).externalPort = 9090;
      
      mockNatPmpClient.portUnmapping.mockImplementation((options, callback) => {
        callback(null);
      });

      await (natPmpHost as any).unmapPort();
      
      expect(mockNatPmpClient.portUnmapping).toHaveBeenCalledWith({
        type: 1,
        private: 9090
      }, expect.any(Function));
      expect(mockNatPmpClient.close).toHaveBeenCalled();
      expect((natPmpHost as any).externalPort).toBeNull();
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
      
      // No external port set (server not started)
      (fileHost as any).externalPort = null;
      
      await expect(fileHost.getFileUrl(fileHash))
        .rejects.toThrow('Server is not started or port is not mapped');
    });

    it('should return correct URL when everything is set up (NAT-PMP)', async () => {
      const natPmpHost = new FileHost({ connectionMode: ConnectionMode.NAT_PMP });
      mockFs.existsSync.mockReturnValue(true);
      const fileHash = await natPmpHost.shareFile('/test/file.txt');
      
      // Set up external port and mock NAT-PMP getExternalIp
      (natPmpHost as any).externalPort = 3000;
      
      mockNatPmpClient.externalIp.mockImplementation((callback) => {
        callback(null, { ip: [203, 0, 113, 1], type: 0, epoch: Date.now() });
      });
      
      const url = await natPmpHost.getFileUrl(fileHash);
      expect(url).toBe(`http://203.0.113.1:3000/files/${fileHash}`);
    });

    it('should return correct URL with local IP when plain connection mode is enabled', async () => {
      const plainHost = new FileHost({ connectionMode: ConnectionMode.PLAIN, port: 8080 });
      mockFs.existsSync.mockReturnValue(true);
      const fileHash = await plainHost.shareFile('/test/file.txt');
      
      // Set up external port
      (plainHost as any).externalPort = 8080;
      
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
      const plainHost = new FileHost({ connectionMode: ConnectionMode.PLAIN, port: 8080 });
      mockFs.existsSync.mockReturnValue(true);
      const fileHash = await plainHost.shareFile('/test/file.txt');
      
      // Set up external port
      (plainHost as any).externalPort = 8080;
      
      // Mock os.networkInterfaces to return no valid interfaces
      mockOs.networkInterfaces.mockReturnValue({});
      
      await expect(plainHost.getFileUrl(fileHash))
        .rejects.toThrow('Could not determine local IP address');
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

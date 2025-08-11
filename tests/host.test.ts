// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  statSync: jest.fn(),
  createReadStream: jest.fn()
}));

// Mock path module
jest.mock('path', () => ({
  basename: jest.fn()
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

import { FileHost } from '../src/host';
import * as fs from 'fs';
import * as path from 'path';
import os from 'os';

// Get the mocked versions
const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;
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

    it('should setup routes correctly', () => {
      // Verify that routes are set up
      expect(mockApp.get).toHaveBeenCalledWith('/files/:id', expect.any(Function));
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
      fileRouteHandler = routeCalls.find(call => call[0] === '/files/:id')?.[1];
      statusRouteHandler = routeCalls.find(call => call[0] === '/status')?.[1];

      mockReq = {
        params: { id: 'test-id' }
      };

      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
        pipe: jest.fn()
      };
    });

    describe('/files/:id route', () => {
      it('should return 404 when file ID not found', () => {
        fileRouteHandler(mockReq, mockRes);
        
        expect(mockRes.status).toHaveBeenCalledWith(404);
        expect(mockRes.json).toHaveBeenCalledWith({ error: 'File not found' });
      });

      it('should return 404 when file no longer exists', () => {
        // First share a file to add to mappings
        const testFilePath = '/test/file.txt';
        mockFs.existsSync.mockReturnValueOnce(true); // For shareFile
        const fileId = fileHost.shareFile(testFilePath);
        
        // Now simulate file not existing for the route
        mockFs.existsSync.mockReturnValueOnce(false);
        
        mockReq.params.id = fileId;
        fileRouteHandler(mockReq, mockRes);
        
        expect(mockRes.status).toHaveBeenCalledWith(404);
        expect(mockRes.json).toHaveBeenCalledWith({ error: 'File no longer exists' });
      });

      it('should serve file when it exists', () => {
        // Setup mocks
        const testFilePath = '/test/file.txt';
        const fileStats = { size: 1024 };
        const mockStream = { pipe: jest.fn() };

        mockFs.existsSync.mockReturnValue(true);
        mockFs.statSync.mockReturnValue(fileStats as any);
        mockFs.createReadStream.mockReturnValue(mockStream as any);
        mockPath.basename.mockReturnValue('file.txt');

        // Share a file
        const fileId = fileHost.shareFile(testFilePath);
        
        mockReq.params.id = fileId;
        fileRouteHandler(mockReq, mockRes);
        
        expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Length', 1024);
        expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');
        expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename=file.txt');
        expect(mockFs.createReadStream).toHaveBeenCalledWith(testFilePath);
        expect(mockStream.pipe).toHaveBeenCalledWith(mockRes);
      });
    });

    describe('/status route', () => {
      it('should return server status with available files', () => {
        // Add some files to the mappings
        mockFs.existsSync.mockReturnValue(true);
        const id1 = fileHost.shareFile('/test/file1.txt');
        const id2 = fileHost.shareFile('/test/file2.txt');

        statusRouteHandler(mockReq, mockRes);
        
        expect(mockRes.json).toHaveBeenCalledWith({
          status: 'online',
          availableFiles: expect.arrayContaining([id1, id2])
        });
      });
    });
  });

  describe('File Management', () => {
    describe('shareFile', () => {
      it('should throw error when file does not exist', () => {
        mockFs.existsSync.mockReturnValue(false);
        
        expect(() => {
          fileHost.shareFile('/non/existent/file.txt');
        }).toThrow('File not found: /non/existent/file.txt');
      });

      it('should return unique ID when file exists', () => {
        mockFs.existsSync.mockReturnValue(true);
        
        const id1 = fileHost.shareFile('/test/file1.txt');
        const id2 = fileHost.shareFile('/test/file2.txt');
        
        expect(id1).toBeTruthy();
        expect(id2).toBeTruthy();
        expect(id1).not.toBe(id2);
      });
    });

    describe('unshareFile', () => {
      it('should return false for non-existent file ID', () => {
        const result = fileHost.unshareFile('non-existent-id');
        expect(result).toBe(false);
      });

      it('should return true and remove existing file', () => {
        mockFs.existsSync.mockReturnValue(true);
        const fileId = fileHost.shareFile('/test/file.txt');
        
        const result = fileHost.unshareFile(fileId);
        expect(result).toBe(true);
        
        // Verify it's removed
        const sharedFiles = fileHost.getSharedFiles();
        expect(sharedFiles.find(f => f.id === fileId)).toBeUndefined();
      });
    });

    describe('getSharedFiles', () => {
      it('should return empty array when no files are shared', () => {
        const sharedFiles = fileHost.getSharedFiles();
        expect(sharedFiles).toEqual([]);
      });

      it('should return array of shared files', () => {
        mockFs.existsSync.mockReturnValue(true);
        const id1 = fileHost.shareFile('/test/file1.txt');
        const id2 = fileHost.shareFile('/test/file2.txt');
        
        const sharedFiles = fileHost.getSharedFiles();
        expect(sharedFiles).toHaveLength(2);
        expect(sharedFiles).toEqual([
          { id: id1, path: '/test/file1.txt' },
          { id: id2, path: '/test/file2.txt' }
        ]);
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

      it('should resolve successfully with external IP and port', async () => {
        mockServer.address.mockReturnValue({ port: 3000 });
        
        // Mock successful UPnP
        const mockNatClient = {
          portMapping: jest.fn((options, callback) => {
            callback(null, { public: 3000 });
          }),
          portUnmapping: jest.fn(),
          externalIp: jest.fn((callback) => {
            callback(null, '203.0.113.1');
          })
        };
        (fileHost as any).client = mockNatClient;

        mockApp.listen.mockImplementation((port, host, callback) => {
          // Properly set the server reference
          (fileHost as any).server = mockServer;
          callback();
          return mockServer;
        });

        const result = await fileHost.start();
        expect(result).toEqual({
          externalIp: '203.0.113.1',
          port: 3000
        });
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
        (fileHost as any).client = mockNatClient;

        mockServer.close.mockImplementation((callback: any) => {
          callback(null);
        });

        await expect(fileHost.stop()).resolves.toBeUndefined();
        expect((fileHost as any).externalPort).toBeNull();
      });
    });
  });

  describe('UPnP Port Mapping', () => {
    it('should handle UPnP mapping failure gracefully', async () => {
      const mockNatClient = {
        portMapping: jest.fn((options, callback) => {
          callback(new Error('UPnP mapping failed'), null);
        }),
        portUnmapping: jest.fn(),
        externalIp: jest.fn()
      };
      (fileHost as any).client = mockNatClient;

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
      (fileHost as any).client = mockNatClient;

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
      (fileHost as any).client = mockNatClient;

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
    it('should throw error when file ID does not exist', async () => {
      await expect(fileHost.getFileUrl('non-existent-id'))
        .rejects.toThrow('No file with ID: non-existent-id');
    });

    it('should throw error when server is not started', async () => {
      mockFs.existsSync.mockReturnValue(true);
      const fileId = fileHost.shareFile('/test/file.txt');
      
      // No external port set (server not started)
      (fileHost as any).externalPort = null;
      
      await expect(fileHost.getFileUrl(fileId))
        .rejects.toThrow('Server is not started or port is not mapped');
    });

    it('should return correct URL when everything is set up', async () => {
      mockFs.existsSync.mockReturnValue(true);
      const fileId = fileHost.shareFile('/test/file.txt');
      
      // Set up external port and mock getExternalIp
      (fileHost as any).externalPort = 3000;
      
      const mockNatClient = {
        portMapping: jest.fn(),
        portUnmapping: jest.fn(),
        externalIp: jest.fn((callback) => {
          callback(null, '203.0.113.1');
        })
      };
      (fileHost as any).client = mockNatClient;
      
      const url = await fileHost.getFileUrl(fileId);
      expect(url).toBe(`http://203.0.113.1:3000/files/${fileId}`);
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

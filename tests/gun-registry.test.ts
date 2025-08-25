// Mock Gun.js before importing anything
const mockGunChain = {
  get: jest.fn().mockReturnThis(),
  put: jest.fn().mockReturnThis(),
  once: jest.fn().mockReturnThis(),
  on: jest.fn().mockReturnThis(),
  off: jest.fn().mockReturnThis(),
  map: jest.fn().mockReturnThis()
};

const mockGun = jest.fn(() => mockGunChain);

jest.mock('gun', () => mockGun);

import { GunRegistry } from '../src/registry/gun-registry';
import { HostCapabilities } from '../src/interfaces';

describe('GunRegistry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with default options', () => {
      const registry = new GunRegistry();
      
      expect(mockGun).toHaveBeenCalledWith(['http://nostalgiagame.go.ro:30876/gun']);
      expect(registry.isAvailable()).toBe(true);
    });

    it('should initialize with custom options', () => {
      const options = {
        peers: ['http://custom-peer.com/gun'],
        namespace: 'custom-namespace'
      };
      
      const registry = new GunRegistry(options);
      
      expect(mockGun).toHaveBeenCalledWith(options.peers);
      expect(registry.isAvailable()).toBe(true);
    });

    it('should handle Gun.js initialization failure', () => {
      mockGun.mockImplementationOnce(() => {
        throw new Error('Gun initialization failed');
      });

      const registry = new GunRegistry();
      
      expect(registry.isAvailable()).toBe(false);
    });
  });

  describe('register', () => {
    let registry: GunRegistry;

    beforeEach(() => {
      registry = new GunRegistry();
    });

    it('should successfully register host capabilities', async () => {
      const capabilities: HostCapabilities = {
        storeId: 'test-host-123',
        externalIp: '192.168.1.100',
        port: 3000,
        directHttp: {
          available: true,
          ip: '192.168.1.100',
          port: 3000
        },
        webTorrent: {
          available: true,
          magnetUris: ['magnet:?xt=urn:btih:test']
        },
        lastSeen: Date.now()
      };

      await registry.register(capabilities);

      expect(mockGunChain.get).toHaveBeenCalledWith('dig-nat-tools');
      expect(mockGunChain.get).toHaveBeenCalledWith('hosts');
      expect(mockGunChain.get).toHaveBeenCalledWith('test-host-123');
      expect(mockGunChain.put).toHaveBeenCalledWith(expect.objectContaining({
        storeId: 'test-host-123',
        externalIp: '192.168.1.100',
        port: 3000,
        directHttp_available: true,
        directHttp_ip: '192.168.1.100',
        directHttp_port: 3000,
        webTorrent_available: true,
        webTorrent_magnetUris: '["magnet:?xt=urn:btih:test"]'
      }));
    });

    it('should throw error when Gun.js is not available', async () => {
      mockGun.mockImplementationOnce(() => {
        throw new Error('Gun not available');
      });
      
      const unavailableRegistry = new GunRegistry();
      const capabilities: HostCapabilities = {
        storeId: 'test-host',
        externalIp: '192.168.1.100',
        port: 3000
      };

      await expect(unavailableRegistry.register(capabilities))
        .rejects.toThrow('Gun.js registry not available');
    });

    it('should throw error when storeId is missing', async () => {
      const capabilities: any = {
        externalIp: '192.168.1.100',
        port: 3000
      };

      await expect(registry.register(capabilities))
        .rejects.toThrow('StoreId is required for registration');
    });

    it('should handle minimal capabilities', async () => {
      const capabilities: HostCapabilities = {
        storeId: 'minimal-host'
      };

      await registry.register(capabilities);

      expect(mockGunChain.put).toHaveBeenCalledWith(expect.objectContaining({
        storeId: 'minimal-host',
        externalIp: 'localhost',
        port: 0,
        directHttp_available: false,
        webTorrent_available: false
      }));
    });
  });

  describe('unregister', () => {
    let registry: GunRegistry;

    beforeEach(() => {
      registry = new GunRegistry();
    });

    it('should successfully unregister a host', async () => {
      await registry.unregister('test-host-123');

      expect(mockGunChain.get).toHaveBeenCalledWith('dig-nat-tools');
      expect(mockGunChain.get).toHaveBeenCalledWith('hosts');
      expect(mockGunChain.get).toHaveBeenCalledWith('test-host-123');
      expect(mockGunChain.put).toHaveBeenCalledWith(null);
    });

    it('should throw error when Gun.js is not available', async () => {
      mockGun.mockImplementationOnce(() => {
        throw new Error('Gun not available');
      });
      
      const unavailableRegistry = new GunRegistry();

      await expect(unavailableRegistry.unregister('test-host'))
        .rejects.toThrow('Gun.js registry not available');
    });
  });

  describe('findPeer', () => {
    let registry: GunRegistry;

    beforeEach(() => {
      registry = new GunRegistry();
    });

    it('should find and return peer capabilities', async () => {
      const mockData = {
        storeId: 'test-host-123',
        lastSeen: Date.now(),
        externalIp: '192.168.1.100',
        port: 3000,
        directHttp_available: true,
        directHttp_ip: '192.168.1.100',
        directHttp_port: 3000,
        webTorrent_available: false
      };

      mockGunChain.once.mockImplementationOnce((callback) => {
        callback(mockData);
      });

      const result = await registry.findPeer('test-host-123');

      expect(result).toEqual({
        storeId: 'test-host-123',
        directHttp: {
          available: true,
          ip: '192.168.1.100',
          port: 3000
        },
        webTorrent: undefined,
        externalIp: '192.168.1.100',
        port: 3000,
        lastSeen: mockData.lastSeen
      });
    });

    it('should return null for non-existent peer', async () => {
      mockGunChain.once.mockImplementationOnce((callback) => {
        callback(null);
      });

      const result = await registry.findPeer('non-existent');

      expect(result).toBeNull();
    });

    it('should return null for stale peer', async () => {
      const staleData = {
        storeId: 'stale-host',
        lastSeen: Date.now() - (6 * 60 * 1000), // 6 minutes ago (stale)
        externalIp: '192.168.1.100',
        port: 3000
      };

      mockGunChain.once.mockImplementationOnce((callback) => {
        callback(staleData);
      });

      const result = await registry.findPeer('stale-host');

      expect(result).toBeNull();
    });

    it('should throw error when Gun.js is not available', async () => {
      mockGun.mockImplementationOnce(() => {
        throw new Error('Gun not available');
      });
      
      const unavailableRegistry = new GunRegistry();

      await expect(unavailableRegistry.findPeer('test-host'))
        .rejects.toThrow('Gun.js registry not available');
    });
  });

  describe('findAvailablePeers', () => {
    let registry: GunRegistry;

    beforeEach(() => {
      registry = new GunRegistry();
    });

    it('should find and return multiple peers', async () => {
      const mockHostsData = {
        'host-1': true,
        'host-2': true,
        '_': 'gun-metadata' // Gun.js metadata
      };

      const mockHost1Data = {
        storeId: 'host-1',
        lastSeen: Date.now(),
        externalIp: '192.168.1.100',
        port: 3000,
        directHttp_available: true,
        directHttp_ip: '192.168.1.100',
        directHttp_port: 3000
      };

      const mockHost2Data = {
        storeId: 'host-2',
        lastSeen: Date.now(),
        externalIp: '192.168.1.101',
        port: 3001,
        webTorrent_available: true,
        webTorrent_magnetUris: '["magnet:?xt=urn:btih:test"]'
      };

      // Mock the calls in sequence
      let callIndex = 0;
      mockGunChain.once.mockImplementation((callback) => {
        callIndex++;
        if (callIndex === 1) {
          // First call: initial hosts query
          callback(mockHostsData);
        } else if (callIndex === 2) {
          // Second call: host-1 query
          callback(mockHost1Data);
        } else if (callIndex === 3) {
          // Third call: host-2 query
          callback(mockHost2Data);
        }
      });

      const promise = registry.findAvailablePeers();
      
      // Fast-forward timeout
      jest.advanceTimersByTime(10000);
      
      const result = await promise;

      expect(result).toHaveLength(2);
      expect(result.some(p => p.storeId === 'host-1')).toBe(true);
      expect(result.some(p => p.storeId === 'host-2')).toBe(true);
    });

    it('should handle empty hosts data', async () => {
      mockGunChain.once.mockImplementationOnce((callback) => {
        callback(null);
      });

      const promise = registry.findAvailablePeers();
      
      jest.advanceTimersByTime(10000);
      
      const result = await promise;

      expect(result).toEqual([]);
    });

    it('should timeout and return partial results', async () => {
      const mockHostsData = {
        'host-1': true
      };

      let callIndex = 0;
      mockGunChain.once.mockImplementation((callback) => {
        callIndex++;
        if (callIndex === 1) {
          // First call: return hosts data
          callback(mockHostsData);
        }
        // Don't call callback for subsequent calls (simulate slow/no response for host details)
      });

      const promise = registry.findAvailablePeers();
      
      jest.advanceTimersByTime(10000);
      
      const result = await promise;

      expect(result).toEqual([]);
    });

    it('should throw error when Gun.js is not available', async () => {
      mockGun.mockImplementationOnce(() => {
        throw new Error('Gun not available');
      });
      
      const unavailableRegistry = new GunRegistry();

      await expect(unavailableRegistry.findAvailablePeers())
        .rejects.toThrow('Gun.js registry not available');
    });
  });

  describe('heartbeat and cleanup', () => {
    let registry: GunRegistry;

    beforeEach(() => {
      registry = new GunRegistry();
    });

    it('should handle keepalive for storeId', async () => {
      // Since updateLastSeen doesn't exist, we test the heartbeat functionality
      // that would be implemented through regular register() calls
      const capabilities: HostCapabilities = {
        storeId: 'test-host-heartbeat',
        externalIp: '192.168.1.100',
        port: 3000
      };

      await registry.register(capabilities);

      expect(mockGunChain.put).toHaveBeenCalledWith(expect.objectContaining({
        storeId: 'test-host-heartbeat',
        lastSeen: expect.any(Number)
      }));
    });

    it('should handle Gun.js unavailable for heartbeat', async () => {
      mockGun.mockImplementationOnce(() => {
        throw new Error('Gun not available');
      });
      
      const unavailableRegistry = new GunRegistry();
      const capabilities: HostCapabilities = {
        storeId: 'test-host',
        externalIp: '192.168.1.100',
        port: 3000
      };

      await expect(unavailableRegistry.register(capabilities))
        .rejects.toThrow('Gun.js registry not available');
    });
  });
});

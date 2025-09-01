import { GunRegistry, GunRegistryOptions } from '../src/registry/gun-registry';
import { HostCapabilities } from '../src/interfaces';

// Mock Gun.js
jest.mock('gun', () => {
  const mockGunChain = {
    get: jest.fn(),
    put: jest.fn(),
    once: jest.fn(),
    on: jest.fn(),
  };

  const mockGun = jest.fn().mockReturnValue(mockGunChain);
  
  return {
    default: mockGun,
    __esModule: true
  };
});

// Import the mocked Gun after mocking
import Gun from 'gun';
const mockGun = Gun as jest.MockedFunction<typeof Gun>;
const mockGunChain = {
  get: jest.fn(),
  put: jest.fn(),
  once: jest.fn(),
  on: jest.fn(),
};

describe('GunRegistry', () => {
  let registry: GunRegistry;
  let mockOnceCallbacks: Map<string, (data: any) => void>;
  let mockOnCallbacks: Map<string, (data: any) => void>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOnceCallbacks = new Map();
    mockOnCallbacks = new Map();
    
    // Reset the mock to return our chain
    mockGun.mockReturnValue(mockGunChain as any);
    
    // Setup the chain for method chaining
    mockGunChain.get.mockReturnValue(mockGunChain);
    mockGunChain.put.mockReturnValue(mockGunChain);
    
    // Mock once to store callbacks for later triggering
    mockGunChain.once.mockImplementation((callback: (data: any) => void) => {
      const callKey = JSON.stringify(mockGunChain.get.mock.calls);
      mockOnceCallbacks.set(callKey, callback);
      return mockGunChain;
    });
    
    // Mock on to store callbacks for later triggering
    mockGunChain.on.mockImplementation((callback: (data: any) => void) => {
      const callKey = JSON.stringify(mockGunChain.get.mock.calls);
      mockOnCallbacks.set(callKey, callback);
      return mockGunChain;
    });
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      registry = new GunRegistry();
      expect(mockGun).toHaveBeenCalledWith({
        peers: ["http://nostalgiagame.go.ro:30878/gun"],
        rtc: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
          ]
        },
        localStorage: true
      });
      expect(registry.isAvailable()).toBe(true);
    });

    it('should initialize with custom options', () => {
      const options: GunRegistryOptions = {
        peers: ['http://test-peer.com:8080/gun'],
        namespace: 'test-namespace',
        forceOverride: false,
        overrideDelayMs: 200
      };
      
      registry = new GunRegistry(options);
      expect(mockGun).toHaveBeenCalledWith({
        peers: ['http://test-peer.com:8080/gun'],
        rtc: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
          ]
        },
        localStorage: true
      });
    });

    it('should initialize with custom WebRTC configuration', () => {
      const options: GunRegistryOptions = {
        peers: ['http://test-peer.com:8080/gun'],
        webrtc: {
          iceServers: [
            { urls: 'stun:custom.stun.server:3478' }
          ]
        },
        localStorage: false
      };
      
      registry = new GunRegistry(options);
      expect(mockGun).toHaveBeenCalledWith({
        peers: ['http://test-peer.com:8080/gun'],
        rtc: {
          iceServers: [
            { urls: 'stun:custom.stun.server:3478' }
          ]
        },
        localStorage: false
      });
    });

    it('should handle Gun.js initialization failure', () => {
      mockGun.mockImplementationOnce(() => {
        throw new Error('Gun.js failed to initialize');
      });
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      registry = new GunRegistry();
      
      expect(registry.isAvailable()).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('Gun.js not available, peer discovery will not work');
      
      consoleSpy.mockRestore();
    });
  });

  describe('register', () => {
    beforeEach(() => {
      registry = new GunRegistry();
    });

    it('should throw error when Gun.js is not available', async () => {
      registry = new GunRegistry();
      // Simulate Gun.js not being available
      (registry as any).isGunAvailable = false;
      
      const capabilities: HostCapabilities = {
        storeId: 'test-store-id',
        directHttp: {
          available: true,
          ip: '192.168.1.100',
          port: 8080
        }
      };

      await expect(registry.register(capabilities)).rejects.toThrow('Gun.js registry not available');
    });

    it('should throw error when storeId is missing', async () => {
      const capabilities: HostCapabilities = {
        storeId: '',
        directHttp: {
          available: true,
          ip: '192.168.1.100',
          port: 8080
        }
      };

      await expect(registry.register(capabilities)).rejects.toThrow('StoreId is required for registration');
    });

    it('should successfully register capabilities', async () => {
      const capabilities: HostCapabilities = {
        storeId: 'test-store-id',
        directHttp: {
          available: true,
          ip: '192.168.1.100',
          port: 8080
        },
        webTorrent: {
          available: true,
          magnetUris: ['magnet:?xt=urn:btih:test1', 'magnet:?xt=urn:btih:test2']
        }
      };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await registry.register(capabilities);

      // Verify the chain calls
      expect(mockGunChain.get).toHaveBeenCalledWith('dig-nat-tools');
      expect(mockGunChain.get).toHaveBeenCalledWith('hosts');
      expect(mockGunChain.get).toHaveBeenCalledWith('test-store-id');
      
      // Verify put was called with flattened data
      expect(mockGunChain.put).toHaveBeenCalledWith(expect.objectContaining({
        storeId: 'test-store-id',
        directHttp_available: true,
        directHttp_ip: '192.168.1.100',
        directHttp_port: 8080,
        webTorrent_available: true,
        webTorrent_magnetUris: JSON.stringify(['magnet:?xt=urn:btih:test1', 'magnet:?xt=urn:btih:test2']),
        lastSeen: expect.any(Number)
      }));

      consoleSpy.mockRestore();
    });

    it('should clear fields before registration when forceOverride is true', async () => {
      const capabilities: HostCapabilities = {
        storeId: 'test-store-id',
        directHttp: {
          available: true,
          ip: '192.168.1.100',
          port: 8080
        }
      };

      await registry.register(capabilities);

      // Verify that put(null) was called for clearing fields
      expect(mockGunChain.put).toHaveBeenCalledWith(null);
    });

    it('should handle clearing fields failure gracefully', async () => {
      const capabilities: HostCapabilities = {
        storeId: 'test-store-id',
        directHttp: {
          available: true,
          ip: '192.168.1.100',
          port: 8080
        }
      };

      // Mock the hostRef.get to throw error during field clearing
      const originalGet = mockGunChain.get;
      let callCount = 0;
      mockGunChain.get.mockImplementation((_key: string) => {
        callCount++;
        // Throw error on the field clearing calls (after the initial namespace/hosts/storeId calls)
        if (callCount > 3) {
          throw new Error('Clear failed');
        }
        return mockGunChain;
      });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      await registry.register(capabilities);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed clearing existing fields before override:'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
      mockGunChain.get.mockImplementation(originalGet);
    });
  });

  describe('findPeer', () => {
    beforeEach(() => {
      registry = new GunRegistry();
    });

    it('should throw error when Gun.js is not available', async () => {
      (registry as any).isGunAvailable = false;
      
      await expect(registry.findPeer('test-store-id')).rejects.toThrow('Gun.js registry not available');
    });

    it('should find and return fresh peer data', async () => {
      const storeId = 'test-store-id';
      const mockData = {
        storeId: storeId,
        lastSeen: Date.now(),
        directHttp_available: true,
        directHttp_ip: '192.168.1.100',
        directHttp_port: 8080,
        webTorrent_available: true,
        webTorrent_magnetUris: JSON.stringify(['magnet:?xt=urn:btih:test1'])
      };

      const findPromise = registry.findPeer(storeId);
      
      // Simulate the Gun.js callback
      setTimeout(() => {
        const callback = Array.from(mockOnceCallbacks.values())[0];
        if (callback) callback(mockData);
      }, 10);

      const result = await findPromise;

      expect(result).toEqual({
        storeId: storeId,
        directHttp: {
          available: true,
          ip: '192.168.1.100',
          port: 8080
        },
        webTorrent: {
          available: true,
          magnetUris: ['magnet:?xt=urn:btih:test1']
        },
        externalIp: undefined,
        port: undefined,
        lastSeen: mockData.lastSeen
      });
    });

    it('should return null for stale peer data', async () => {
      const storeId = 'test-store-id';
      const staleTimestamp = Date.now() - (6 * 60 * 1000); // 6 minutes ago
      const mockData = {
        storeId: storeId,
        lastSeen: staleTimestamp,
        directHttp_available: true,
        directHttp_ip: '192.168.1.100',
        directHttp_port: 8080
      };

      const findPromise = registry.findPeer(storeId);
      
      setTimeout(() => {
        const callback = Array.from(mockOnceCallbacks.values())[0];
        if (callback) callback(mockData);
      }, 10);

      const result = await findPromise;
      expect(result).toBeNull();
    });

    it('should return null when peer not found', async () => {
      const findPromise = registry.findPeer('non-existent-id');
      
      setTimeout(() => {
        const callback = Array.from(mockOnceCallbacks.values())[0];
        if (callback) callback(null);
      }, 10);

      const result = await findPromise;
      expect(result).toBeNull();
    });

    it('should timeout after 10 seconds', async () => {
      jest.useFakeTimers();
      
      const findPromise = registry.findPeer('test-store-id');
      
      // Fast-forward time by 10 seconds
      jest.advanceTimersByTime(10000);
      
      const result = await findPromise;
      expect(result).toBeNull();
      
      jest.useRealTimers();
    });
  });

  describe('findAvailablePeers', () => {
    beforeEach(() => {
      registry = new GunRegistry();
    });

    it('should throw error when Gun.js is not available', async () => {
      (registry as any).isGunAvailable = false;
      
      await expect(registry.findAvailablePeers()).rejects.toThrow('Gun.js registry not available');
    });

    it('should find and return available peers', async () => {
      const currentTime = Date.now();
      
      // Mock the hosts data structure
      const hostsData = {
        'host1': true, // Gun.js reference
        'host2': true, // Gun.js reference
        '_': { /* Gun.js metadata */ }
      };

      const host1Data = {
        storeId: 'host1',
        lastSeen: currentTime,
        directHttp_available: true,
        directHttp_ip: '192.168.1.100',
        directHttp_port: 8080
      };

      const host2Data = {
        storeId: 'host2',
        lastSeen: currentTime,
        webTorrent_available: true,
        webTorrent_magnetUris: JSON.stringify(['magnet:?xt=urn:btih:test1'])
      };

      // Set up mock callbacks with a counter to track which callback is being called
      let callbackIndex = 0;
      mockGunChain.once.mockImplementation((callback: (data: any) => void) => {
        if (callbackIndex === 0) {
          // First callback for the hosts list
          setTimeout(() => callback(hostsData), 10);
        } else if (callbackIndex === 1) {
          // Second callback for host1 data
          setTimeout(() => callback(host1Data), 20);
        } else if (callbackIndex === 2) {
          // Third callback for host2 data
          setTimeout(() => callback(host2Data), 30);
        }
        callbackIndex++;
        return mockGunChain;
      });

      const result = await registry.findAvailablePeers();

      expect(result).toHaveLength(2);
      expect(result[0].storeId).toBe('host1');
      expect(result[1].storeId).toBe('host2');
    }, 10000);

    it('should filter out stale peers', async () => {
      const currentTime = Date.now();
      const staleTime = currentTime - (6 * 60 * 1000); // 6 minutes ago
      
      const hostsData = {
        'fresh-host': true,
        'stale-host': true,
        '_': { /* Gun.js metadata */ }
      };

      const freshHostData = {
        storeId: 'fresh-host',
        lastSeen: currentTime,
        directHttp_available: true,
        directHttp_ip: '192.168.1.100',
        directHttp_port: 8080
      };

      const staleHostData = {
        storeId: 'stale-host',
        lastSeen: staleTime,
        directHttp_available: true,
        directHttp_ip: '192.168.1.101',
        directHttp_port: 8081
      };

      // Set up mock callbacks with a counter to track which callback is being called
      let callbackIndex = 0;
      mockGunChain.once.mockImplementation((callback: (data: any) => void) => {
        if (callbackIndex === 0) {
          // First callback for the hosts list
          setTimeout(() => callback(hostsData), 10);
        } else if (callbackIndex === 1) {
          // Second callback for fresh host data
          setTimeout(() => callback(freshHostData), 20);
        } else if (callbackIndex === 2) {
          // Third callback for stale host data
          setTimeout(() => callback(staleHostData), 30);
        }
        callbackIndex++;
        return mockGunChain;
      });

      const result = await registry.findAvailablePeers();

      expect(result).toHaveLength(1);
      expect(result[0].storeId).toBe('fresh-host');
    }, 10000);

    it('should return empty array when no hosts found', async () => {
      const findPromise = registry.findAvailablePeers();
      
      setTimeout(() => {
        const callback = Array.from(mockOnceCallbacks.values())[0];
        if (callback) callback(null);
      }, 10);

      const result = await findPromise;
      expect(result).toEqual([]);
    });

    it('should timeout after 30 seconds', async () => {
      jest.useFakeTimers();
      
      const findPromise = registry.findAvailablePeers();
      
      // Fast-forward time by 30 seconds
      jest.advanceTimersByTime(30000);
      
      const result = await findPromise;
      expect(result).toEqual([]);
      
      jest.useRealTimers();
    });
  });

  describe('sendSignalingMessage', () => {
    beforeEach(() => {
      registry = new GunRegistry();
    });

    it('should throw error when Gun.js is not available', async () => {
      (registry as any).isGunAvailable = false;
      
      await expect(registry.sendSignalingMessage('target-peer', { test: 'message' }))
        .rejects.toThrow('Gun.js registry not available');
    });

    it('should send signaling message with timestamp', async () => {
      const targetPeer = 'target-peer';
      const message = { test: 'message', data: 'value' };

      await registry.sendSignalingMessage(targetPeer, message);

      expect(mockGunChain.get).toHaveBeenCalledWith('dig-nat-tools');
      expect(mockGunChain.get).toHaveBeenCalledWith('signaling');
      expect(mockGunChain.get).toHaveBeenCalledWith(targetPeer);
      expect(mockGunChain.put).toHaveBeenCalledWith({
        test: 'message',
        data: 'value',
        timestamp: expect.any(Number)
      });
    });
  });

  describe('onSignalingMessage', () => {
    beforeEach(() => {
      registry = new GunRegistry();
    });

    it('should warn when Gun.js is not available', () => {
      (registry as any).isGunAvailable = false;
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const callback = jest.fn();
      
      registry.onSignalingMessage('test-store-id', callback);
      
      expect(consoleSpy).toHaveBeenCalledWith('Gun.js not available, signaling will not work');
      consoleSpy.mockRestore();
    });

    it('should set up signaling message listener', () => {
      const callback = jest.fn();
      const storeId = 'test-store-id';

      registry.onSignalingMessage(storeId, callback);

      expect(mockGunChain.get).toHaveBeenCalledWith('dig-nat-tools');
      expect(mockGunChain.get).toHaveBeenCalledWith('signaling');
      expect(mockGunChain.get).toHaveBeenCalledWith(storeId);
      expect(mockGunChain.on).toHaveBeenCalled();
    });

    it('should call callback when message with timestamp is received', () => {
      const callback = jest.fn();
      const storeId = 'test-store-id';
      const message = { test: 'message', timestamp: Date.now() };

      registry.onSignalingMessage(storeId, callback);

      // Simulate receiving a message
      const onCallback = Array.from(mockOnCallbacks.values())[0];
      if (onCallback) onCallback(message);

      expect(callback).toHaveBeenCalledWith(message);
    });

    it('should not call callback when message without timestamp is received', () => {
      const callback = jest.fn();
      const storeId = 'test-store-id';
      const message = { test: 'message' }; // No timestamp

      registry.onSignalingMessage(storeId, callback);

      // Simulate receiving a message
      const onCallback = Array.from(mockOnCallbacks.values())[0];
      if (onCallback) onCallback(message);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('unregister', () => {
    beforeEach(() => {
      registry = new GunRegistry();
    });

    it('should throw error when Gun.js is not available', async () => {
      (registry as any).isGunAvailable = false;
      
      await expect(registry.unregister('test-store-id')).rejects.toThrow('Gun.js registry not available');
    });

    it('should unregister host by setting data to null', async () => {
      const storeId = 'test-store-id';
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await registry.unregister(storeId);

      expect(mockGunChain.get).toHaveBeenCalledWith('dig-nat-tools');
      expect(mockGunChain.get).toHaveBeenCalledWith('hosts');
      expect(mockGunChain.get).toHaveBeenCalledWith(storeId);
      expect(mockGunChain.put).toHaveBeenCalledWith(null);
      expect(consoleSpy).toHaveBeenCalledWith(`Unregistered host ${storeId}`);

      consoleSpy.mockRestore();
    });
  });

  describe('isAvailable', () => {
    it('should return true when Gun.js is available', () => {
      registry = new GunRegistry();
      expect(registry.isAvailable()).toBe(true);
    });

    it('should return false when Gun.js is not available', () => {
      mockGun.mockImplementationOnce(() => {
        throw new Error('Gun.js failed');
      });
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      registry = new GunRegistry();
      
      expect(registry.isAvailable()).toBe(false);
      consoleSpy.mockRestore();
    });
  });
});
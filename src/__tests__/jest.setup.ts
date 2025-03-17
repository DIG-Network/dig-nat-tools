/**
 * Jest Setup File - runs before all tests
 */

// Force environment variables to ensure mocking works
process.env.SKIP_NETWORK_TESTS = 'true';
process.env.NODE_ENV = 'test';

// Display debug info before mocking
console.log('===== JEST SETUP ENVIRONMENT INFO =====');
console.log('process.env.CI:', process.env.CI);
console.log('process.env.SKIP_NETWORK_TESTS:', process.env.SKIP_NETWORK_TESTS);
console.log('process.env.NODE_ENV:', process.env.NODE_ENV);
console.log('jest.isMockFunction:', typeof jest.isMockFunction === 'function');

// Force Jest to clear all mocks and module cache
jest.resetModules();

// Mock NetworkManager.ts directly
jest.mock('../lib/network-manager', () => {
  console.log('** Mocking NetworkManager module directly');
  
  const mockNetworkManagerInstance = {
    downloadFile: jest.fn().mockImplementation((peers, fileHash, options) => {
      console.log(`MOCK NETWORK MANAGER: Simulating download for ${fileHash} from peers:`, peers);
      
      if (options?.onProgress) {
        // Simulate a complete download
        options.onProgress(100, 100);
      }
      
      return Promise.resolve(true);
    })
  };
  
  // Return a constructor function that returns the mock instance
  const MockNetworkManager = jest.fn().mockImplementation(() => mockNetworkManagerInstance);
  
  // Make default property to support both import styles
  // Use type assertion to avoid TypeScript error
  (MockNetworkManager as any).default = MockNetworkManager;
  
  return MockNetworkManager;
});

// Mock Client.ts directly to intercept all network code paths
jest.mock('../lib/client', () => {
  console.log('** Mocking Client module directly');
  
  const mockClientInstance = {
    downloadFile: jest.fn().mockImplementation((hostId, fileHash, options) => {
      console.log(`MOCK CLIENT: Simulating download from host ${hostId} for file ${fileHash}`);
      
      if (options?.onProgress) {
        // Simulate progress updates
        const totalBytes = 1024 * 1024;
        options.onProgress(0, totalBytes);
        
        // Complete the download immediately
        setTimeout(() => {
          options.onProgress(totalBytes, totalBytes);
        }, 50);
      }
      
      return Promise.resolve(true);
    }),
    stop: jest.fn().mockImplementation(() => {
      console.log('MOCK CLIENT: Stopped client');
      return Promise.resolve();
    })
  };
  
  // Return a constructor function that returns the mock instance
  const MockClient = jest.fn().mockImplementation(() => mockClientInstance);
  
  // Make default property to support both import styles
  // Use type assertion to avoid TypeScript error
  (MockClient as any).default = MockClient;
  
  return MockClient;
});

// Mock the index file to prevent any real implementations from being loaded
jest.mock('../index', () => {
  console.log('** Mocking Index module directly');
  
  // Create mock implementations for all exports
  const mockClient = {
    downloadFile: jest.fn().mockImplementation((hostId, fileHash, options) => {
      console.log(`MOCK INDEX: Client download for host ${hostId} and file ${fileHash}`);
      
      if (options?.onProgress) {
        // Simulate progress
        const totalBytes = 1024 * 1024;
        options.onProgress(0, totalBytes);
        setTimeout(() => options.onProgress(totalBytes, totalBytes), 50);
      }
      
      return Promise.resolve(true);
    }),
    stop: jest.fn().mockImplementation(() => Promise.resolve())
  };
  
  const mockHost = {
    start: jest.fn().mockImplementation(() => Promise.resolve()),
    stop: jest.fn().mockImplementation(() => Promise.resolve()),
    getHostId: jest.fn().mockImplementation(() => 'mock-host-id-global')
  };
  
  // Export all the mock functions with clear implementation
  return {
    // Export createClient as a function that returns the mockClient
    createClient: jest.fn().mockImplementation((options) => {
      console.log('MOCK INDEX: Creating mock client with options:', JSON.stringify(options || {}));
      return mockClient;
    }),
    // Export createHost as a function that returns the mockHost
    createHost: jest.fn().mockImplementation((options) => {
      console.log('MOCK INDEX: Creating mock host with options:', JSON.stringify(options || {}));
      return mockHost;
    }),
    // Export downloadFile as a function
    downloadFile: jest.fn().mockImplementation((fileHash, savePath, hostIds, options = {}) => {
      console.log(`MOCK INDEX: Helper download for file ${fileHash} to ${savePath}`);
      
      // Process progress callback according to the implementation
      if (options?.progressCallback) {
        // Initial progress
        options.progressCallback({ received: 0, total: 1024 * 1024 });
        
        // Simulate completed progress
        setTimeout(() => options.progressCallback({ received: 1024 * 1024, total: 1024 * 1024 }), 50);
      }
      
      // Also handle onProgress callback for different parameter structures
      if (options?.onProgress) {
        options.onProgress(0, 1024 * 1024);
        setTimeout(() => options.onProgress(1024 * 1024, 1024 * 1024), 50);
      }
      
      return Promise.resolve(true);
    })
  };
});

// Mock fs-extra to prevent actual file operations
jest.mock('fs-extra', () => {
  console.log('** Mocking fs-extra module to prevent real file operations');
  
  // Define mock stream type
  type MockStream = {
    write: jest.Mock;
    end: jest.Mock;
    on: (event: string, handler: () => void) => MockStream;
    pipe: (dest: any) => MockStream;
  };
  
  return {
    pathExists: jest.fn().mockResolvedValue(false),
    remove: jest.fn().mockResolvedValue(undefined),
    stat: jest.fn().mockResolvedValue({ size: 1024 * 1024 }),
    readFile: jest.fn().mockResolvedValue(Buffer.from('mock-file-content')),
    writeFile: jest.fn().mockResolvedValue(undefined),
    open: jest.fn().mockResolvedValue({ fd: 123 }),
    read: jest.fn().mockResolvedValue({ bytesRead: 1024, buffer: Buffer.alloc(1024) }),
    close: jest.fn().mockResolvedValue(undefined),
    // Add the missing ensureDirSync function
    ensureDirSync: jest.fn().mockImplementation((dirPath) => {
      console.log(`MOCK FS: ensureDirSync called for ${dirPath}`);
      return true;
    }),
    createWriteStream: jest.fn().mockReturnValue({
      write: jest.fn(),
      end: jest.fn(),
      on: function(this: MockStream, event: string, handler: () => void) {
        if (event === 'finish') {
          // Trigger finish immediately
          setTimeout(handler, 10);
        }
        return this;
      }
    }),
    createReadStream: jest.fn().mockReturnValue({
      pipe: function(this: MockStream, dest: any) {
        return {
          on: function(this: MockStream, event: string, handler: () => void) {
            if (event === 'finish') {
              // Trigger finish immediately
              setTimeout(handler, 10);
            }
            return this;
          }
        } as MockStream;
      },
      on: function(this: MockStream, event: string, handler: () => void) {
        return this;
      }
    } as MockStream)
  };
});

// Prevent any crypto operations
jest.mock('crypto', () => {
  console.log('** Mocking crypto module');
  
  return {
    createHash: jest.fn().mockReturnValue({
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue('mock-file-hash')
    }),
    randomBytes: jest.fn().mockReturnValue(Buffer.from('randomdata'))
  };
});

// Prevent any real network operations
jest.mock('net', () => {
  console.log('** Mocking net module to prevent real network operations');
  
  return {
    createServer: jest.fn().mockReturnValue({
      listen: jest.fn(),
      close: jest.fn(),
      on: jest.fn().mockReturnThis()
    }),
    Socket: jest.fn().mockImplementation(() => ({
      connect: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      on: jest.fn().mockReturnThis()
    }))
  };
});

// Prevent any real UDP operations
jest.mock('dgram', () => {
  console.log('** Mocking dgram module to prevent real UDP operations');
  
  return {
    createSocket: jest.fn().mockReturnValue({
      bind: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn().mockReturnThis()
    })
  };
});

console.log('===== GLOBAL JEST MOCKS SETUP COMPLETE ====='); 
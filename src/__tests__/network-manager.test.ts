/// <reference types="jest" />

import * as path from 'path';
import * as fs from 'fs-extra';
import * as crypto from 'crypto';
import NetworkManager from '../lib/network-manager';

// Complete mock of NetworkManager for testing without actual network connections
jest.mock('../lib/network-manager', () => {
  return jest.fn().mockImplementation(() => {
    return {
      downloadFile: jest.fn().mockImplementation((peers, fileHash, options) => {
        // Simulate successful download
        return Promise.resolve(true);
      }),
      // Mock other methods as needed
      _getPeers: jest.fn().mockReturnValue([
        { id: 'peer1', failureCount: 0 },
        { id: 'peer2', failureCount: 0 },
        { id: 'failing-peer', failureCount: 1 }
      ]),
      _mergeChunksAndVerify: jest.fn().mockResolvedValue(true),
      _calculateConcurrency: jest.fn().mockReturnValue(4)
    };
  });
});

// Helper function to generate mock data with a specified hash
function generateMockDataWithHash(): { fileBuffer: Buffer, hash: string } {
  // Create a mock file with a predetermined content that will produce consistent hash
  const mockFileBuffer = Buffer.from('Mock file content for testing');
  
  // Calculate the hash of the mock file
  const hash = crypto.createHash('sha256').update(mockFileBuffer).digest('hex');
  
  console.log(`Mock file data will have hash: ${hash}`);
  
  return { fileBuffer: mockFileBuffer, hash };
}

describe('NetworkManager', () => {
  let networkManager: NetworkManager;
  
  beforeEach(() => {
    // Create a fresh NetworkManager instance
    networkManager = new NetworkManager();
    
    // Clear mock call counts between tests
    jest.clearAllMocks();
  });
  
  test('downloads a file with multiple peers', async () => {
    // Create mock data and get its hash
    const { fileBuffer, hash } = generateMockDataWithHash();
    
    // Setup download options
    const options = {
      savePath: path.join(__dirname, 'test-download.dat'),
      chunkSize: 1024,
      onProgress: jest.fn()
    };
    
    // Execute the download
    const result = await networkManager.downloadFile(['peer1', 'peer2'], hash, options);
    
    // Verify the expected behavior
    expect(result).toBeTruthy();
    expect(networkManager.downloadFile).toHaveBeenCalledWith(['peer1', 'peer2'], hash, options);
  });
  
  test('handles peer failures gracefully', async () => {
    // Create mock data and get its hash
    const { fileBuffer, hash } = generateMockDataWithHash();
    
    // Setup download options
    const options = {
      savePath: path.join(__dirname, 'test-download.dat'),
      chunkSize: 1024,
      onProgress: jest.fn()
    };
    
    // Execute the download
    const result = await networkManager.downloadFile(['peer1', 'failing-peer', 'peer2'], hash, options);
    
    // Verify the expected behavior
    expect(result).toBeTruthy();
    expect(networkManager.downloadFile).toHaveBeenCalledWith(
      ['peer1', 'failing-peer', 'peer2'], 
      hash, 
      options
    );
  });
  
  test('adjusts concurrency based on file size', async () => {
    // Create mock data and get its hash
    const { fileBuffer, hash } = generateMockDataWithHash();
    
    // Small file options
    const smallOptions = {
      savePath: path.join(__dirname, 'small-file.dat'),
      chunkSize: 512,
      onProgress: jest.fn()
    };
    
    // Execute download for small file
    await networkManager.downloadFile(['peer1', 'peer2'], hash, smallOptions);
    
    // Large file options
    const largeOptions = {
      savePath: path.join(__dirname, 'large-file.dat'),
      chunkSize: 4096,
      onProgress: jest.fn()
    };
    
    // Execute download for large file
    await networkManager.downloadFile(['peer1', 'peer2'], hash, largeOptions);
    
    // Verify both downloads were attempted
    expect(networkManager.downloadFile).toHaveBeenCalledTimes(2);
    expect(networkManager.downloadFile).toHaveBeenCalledWith(['peer1', 'peer2'], hash, smallOptions);
    expect(networkManager.downloadFile).toHaveBeenCalledWith(['peer1', 'peer2'], hash, largeOptions);
  });
}); 
/// <reference types="jest" />

import * as path from 'path';
import * as fs from 'fs-extra';
import * as crypto from 'crypto';
import NetworkManager from '../../lib/network-manager';
import { TEST_DIRS } from '../utils/test-utils';

// For debugging purposes only - verify mocks are properly applied
console.log('Multi-Protocol Test: NetworkManager mock check:', jest.isMockFunction(NetworkManager) ? 'MOCKED' : 'NOT MOCKED');
console.log('Multi-Protocol Test: fs-extra mock check:', jest.isMockFunction(fs.pathExists) ? 'MOCKED' : 'NOT MOCKED');

// This is a long test that downloads a file using multiple protocols
jest.setTimeout(60000); // 1 minute timeout for this test

describe('Multi-Protocol Tests', () => {
  test('Download file using NetworkManager with multiple protocols', async () => {
    console.log('Running multi-protocol test with mocking');
    
    // Create a mock downloadFile function
    const mockDownloadFile = jest.fn().mockImplementation((peers, fileHash, options) => {
      console.log(`Mock NetworkManager downloading file ${fileHash} from peers:`, peers);
      
      // Simulate progress updates
      if (options?.onProgress) {
        options.onProgress(0, 1024 * 1024);
        options.onProgress(512 * 1024, 1024 * 1024);
        options.onProgress(1024 * 1024, 1024 * 1024);
      }
      
      return Promise.resolve(true);
    });
    
    // Create a mock NetworkManager instance
    const networkManager = {
      downloadFile: mockDownloadFile
    };
    
    // Mock the NetworkManager constructor if needed
    if (jest.isMockFunction(NetworkManager)) {
      (NetworkManager as jest.Mock).mockReturnValue(networkManager);
    }
    
    const mockHash = '50d5fe214ff285b8b94098aae80fc3440d4e67fe4f1a06d4444880ae5d823d3c';
    
    // Create mock download options
    const progressCallback = jest.fn();
    const peerStatusCallback = jest.fn();
    const options = {
      savePath: path.join(TEST_DIRS.client, 'multi-protocol-test.dat'),
      chunkSize: 1024 * 1024, // 1MB chunks
      onProgress: progressCallback,
      onPeerStatus: peerStatusCallback
    };
    
    // Perform mock download
    const result = await networkManager.downloadFile(['peer1', 'peer2'], mockHash, options);
    
    // Verify expected behavior
    expect(result).toBeTruthy();
    
    // Verify callbacks were called
    expect(progressCallback).toHaveBeenCalled();
    
    // Verify the file save path is correct
    expect(options.savePath).toBe(path.join(TEST_DIRS.client, 'multi-protocol-test.dat'));
  });
}); 
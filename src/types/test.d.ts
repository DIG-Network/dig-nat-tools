/**
 * Test-specific type declarations that extend the library's types
 */

import { DownloadOptions } from '../lib/types';

// Extend DownloadOptions with test-specific properties
declare module '../lib/types' {
  interface DownloadOptions {
    // Connection timeout specifically for tests
    connectionTimeout?: number;
    
    // Enable TCP fallback for WebRTC tests
    enableTCPFallback?: boolean;
    
    // Timeout for tests
    timeout?: number;
    
    // Delay between chunk requests for tests
    chunkRequestDelay?: number;
    
    // Maximum number of retries for tests
    maxRetries?: number;
    
    // Progress callback for tests
    progressCallback?: (progress: { received: number, total: number }) => void;
  }
} 
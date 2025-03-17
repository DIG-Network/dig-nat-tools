// Test-specific type definitions

// Extend the DownloadOptions interface for testing purposes
declare namespace DigNATTools {
  interface DownloadOptions {
    // Optional callback to access the client instance for cleanup in tests
    onClientCreated?: (client: any) => void;
  }
} 
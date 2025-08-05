# Application Module

This module provides application-layer functionalities for the Dig NAT Tools system. It includes components that build on the lower-level networking and crypto primitives to create usable interfaces for applications.

## Components

### Authenticated File Host

The `AuthenticatedFileHost` is a high-level component that extends the base file hosting capabilities with cryptographic identity verification. It enables secure peer-to-peer file sharing with authentication.

Features:
- Cryptographic identity based on public/private key pairs
- Challenge-response authentication mechanism
- Signed content announcements
- Peer authorization management

Example usage:

```typescript
import { createAuthenticatedFileHost } from '@dignetwork/dig-nat-tools';

// Create an authenticated file host
const host = createAuthenticatedFileHost({
  port: 8080,
  directory: './shared-files',
  privateKey: 'your-private-key',
  publicKey: 'your-public-key',
  signatureAlgorithm: 'ed25519',
  requirePeerAuthentication: true
});

// Start the host
await host.start();

// Add a file to share
const fileInfo = await host.addFile('./my-file.mp4', {
  contentId: 'my-video',
  announceLevel: 'high'
});

console.log(`Sharing file: ${fileInfo.path}`);
console.log(`Content Hash: ${fileInfo.hash}`);

// Later, stop sharing
await host.removeFile(fileInfo.hash);

// Stop the host
await host.stop();
``` 
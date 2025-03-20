# Cryptographic Identity for Dig NAT Tools

This document outlines the Cryptographic Identity features added to the Dig NAT Tools library, which enable secure peer authentication and verifiable content availability management.

## Overview

The Cryptographic Identity system allows peers to:

1. **Authenticate their identity** using public-key cryptography
2. **Sign content announcements** to prevent spoofing and tampering
3. **Verify other peers' claims** about content availability
4. **Integrate with blockchain identity** for a unified security model
5. **Build reputation systems** based on verified peer behavior

This is particularly valuable in blockchain-adjacent applications where users already have key pairs and where trust and reputation are critical.

## Core Components

### 1. CryptoIdentity

The `CryptoIdentity` class provides the foundation for cryptographic operations:

```typescript
import { createCryptoIdentity } from '@dignetwork/dig-nat-tools';

// Create a crypto identity using blockchain keys
const identity = createCryptoIdentity({
  privateKey: myBlockchainPrivateKey,
  publicKey: myBlockchainPublicKey,
  algorithm: 'secp256k1', // Compatible with most blockchains
  outputEncoding: 'hex'
});

// Sign data
const signature = identity.sign(dataToSign);

// Verify a signature
const isValid = identity.verify(data, signature, peerPublicKey);

// Generate a challenge for authentication
const challenge = CryptoIdentity.generateChallenge();
```

Supported algorithms include:
- `ed25519` - Fast, secure modern elliptic curve
- `secp256k1` - Used by Bitcoin, Ethereum, and many other blockchains
- `rsa` - Traditional asymmetric cryptography

### 2. AuthenticatedFileHost

The `AuthenticatedFileHost` extends the base FileHost with authentication capabilities:

```typescript
import { createAuthenticatedFileHost } from '@dignetwork/dig-nat-tools';

// Create an authenticated file host
const host = createAuthenticatedFileHost({
  port: 8080,
  directory: './shared-files',
  privateKey: myBlockchainPrivateKey,
  publicKey: myBlockchainPublicKey,
  signatureAlgorithm: 'secp256k1',
  requirePeerAuthentication: true, // Require peers to authenticate
  acceptAnonymousPeers: false, // Reject anonymous peers
  gun: gunInstance
});

// Start hosting
await host.start();

// Add file with signed metadata
const fileInfo = await host.addFile('./my-video.mp4', {
  contentId: 'awesome-video'
});

// Stop hosting
await host.stop();
```

The host implements a challenge-response protocol for peer authentication:
1. Peer requests connection
2. Host sends random challenge
3. Peer signs challenge with private key
4. Host verifies signature against peer's public key
5. Connection is accepted or rejected based on verification result

### 3. AuthenticatedContentAvailabilityManager

The `AuthenticatedContentAvailabilityManager` provides cryptographically verifiable content availability tracking:

```typescript
import { 
  createAuthenticatedContentAvailabilityManager,
  PeerContentStatus
} from '@dignetwork/dig-nat-tools';

// Create a content manager
const contentManager = createAuthenticatedContentAvailabilityManager({
  nodeId: myBlockchainAddress,
  privateKey: myBlockchainPrivateKey,
  publicKey: myBlockchainPublicKey,
  signatureAlgorithm: 'secp256k1',
  gun: gunInstance
});

// Start the manager
await contentManager.start();

// Announce content availability (with cryptographic signature)
contentManager.announceContentAvailable('content-hash', {
  port: 8080,
  contentId: 'awesome-video'
});

// Report unavailable content (with cryptographic signature)
contentManager.reportContentUnavailable('peer-id', 'content-hash');

// Get content status
const status = contentManager.getContentStatus('peer-id', 'content-hash');
if (status === PeerContentStatus.AVAILABLE) {
  // Content is available
}

// Add trusted peers
contentManager.addTrustedPeer('peer-id', 'peer-public-key');

// Stop the manager
await contentManager.stop();
```

## Authentication Flow

The authentication flow between hosts and clients works as follows:

1. **Connection Request**:
   ```
   Client -> Host: "I want to connect, I am {peerId}"
   ```

2. **Challenge**:
   ```
   Host -> Client: {
     challenge: "random-string",
     timestamp: 1635789123456,
     hostId: "host-id"
   }
   ```

3. **Signed Response**:
   ```
   Client -> Host: {
     peerId: "client-id",
     publicKey: "client-public-key",
     signature: "signed-challenge-data",
     timestamp: 1635789123789
   }
   ```

4. **Verification**:
   - Host verifies signature against client's public key
   - If signature is valid, connection is accepted
   - If signature is invalid, connection is rejected

## Content Announcement Flow

Content announcements and reports are cryptographically signed:

1. **Signed Announcement**:
   ```typescript
   {
     data: {
       hash: "content-hash",
       port: 8080,
       contentId: "my-video",
       available: true,
       peerId: "announcer-id"
     },
     signature: "signature-of-data",
     publicKey: "announcer-public-key",
     timestamp: 1635789123456
   }
   ```

2. **Signed Report**:
   ```typescript
   {
     data: {
       reporterId: "reporter-id",
       reportedPeerId: "reported-peer-id",
       contentHash: "content-hash",
       reason: "Content not found"
     },
     signature: "signature-of-data",
     publicKey: "reporter-public-key",
     timestamp: 1635789123456
   }
   ```

## Integration with Blockchain Identity

For applications that already have blockchain identities, integration is straightforward:

```typescript
// Ethereum integration example using ethers.js
import { Wallet } from 'ethers';

// Create a wallet from private key
const wallet = new Wallet(privateKey);

// Create a host with blockchain wallet
const host = createAuthenticatedFileHost({
  port: 8080,
  directory: './shared-files',
  privateKey: wallet.privateKey,
  publicKey: wallet.publicKey,
  signatureAlgorithm: 'secp256k1',
  requirePeerAuthentication: true,
  gun: gunInstance
});
```

This allows consistent identity between on-chain and off-chain operations.

## Security Considerations

1. **Private Key Protection**: Never expose private keys in client-side code
2. **Replay Protection**: Signed messages include timestamps to prevent replay attacks
3. **Trust Management**: Maintain a list of trusted peers for high-value operations
4. **Report Verification**: Multiple independent reports are required to mark content unavailable
5. **Challenge Expiration**: Authentication challenges expire after a short time

## Additional Features

- **Trusted Peer Network**: Maintain a list of trusted peers with verified public keys
- **Reputation Tracking**: Build reputation for peers based on verified behavior
- **Consensus-Based Unavailability**: Require multiple independent reports before marking content unavailable
- **Content Verification**: Verify content integrity when announced or reported

## Example Usage

See the complete example in `examples/authenticated-file-sharing-example.ts` which demonstrates:

- Creating authenticated hosts and clients
- Using blockchain wallet keys for signing and verification
- Challenge-response authentication
- Signed content announcements and reports
- Content availability tracking

## Benefits Over Basic Authentication

Compared to simple authentication methods, the cryptographic identity system provides:

1. **Non-repudiation**: Peers cannot deny their announcements or reports
2. **End-to-end verification**: No trusted intermediaries required
3. **Blockchain integration**: Seamless use with existing blockchain identities
4. **Distributed trust**: Trust decisions based on cryptographically verified behavior
5. **Sybil attack resistance**: Multiple verified identities needed for consensus

## Future Enhancements

Potential enhancements to the system include:

1. **On-chain verification**: Cross-reference peer claims with blockchain state
2. **Zero-knowledge proofs**: Prove content availability without revealing content
3. **Delegated authority**: Allow peers to act on behalf of others with cryptographic proof
4. **Token-based access control**: Restrict content to token holders
5. **Incentivized hosting**: Reward peers for reliably hosting content 
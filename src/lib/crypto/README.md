# Crypto Module

This module provides a unified interface for all cryptographic functionality in the Dig NAT Tools system.

## Structure

The module contains the following files:

- `index.ts`: Main entry point that exports all crypto functionality
- `utils.ts`: Basic cryptographic utility functions (hashing, encryption, etc.)
- `identity.ts`: Cryptographic identity and signature management

## Usage

### Basic Crypto Utilities

```typescript
import { 
  calculateSHA256, 
  bufferToBase64, 
  base64ToBuffer, 
  generateRandomBuffer, 
  generateRandomString, 
  encryptAES, 
  decryptAES 
} from '@dignetwork/dig-nat-tools';

// Calculate a SHA-256 hash
const hash = calculateSHA256(Buffer.from('hello world'));

// Encrypt data
const key = generateRandomBuffer(32); // 32 bytes for AES-256
const { encrypted, iv, tag } = encryptAES(Buffer.from('secret data'), key);

// Decrypt data
const decrypted = decryptAES(encrypted, key, iv, tag);
```

### Cryptographic Identity

```typescript
import { 
  CryptoIdentity, 
  createCryptoIdentity, 
  signData, 
  verifySignedData 
} from '@dignetwork/dig-nat-tools';

// Create a cryptographic identity
const identity = createCryptoIdentity({
  privateKey: '...', // Private key as hex string or Buffer
  publicKey: '...', // Optional public key
  algorithm: 'ed25519', // Or 'secp256k1' or 'rsa'
});

// Generate a node ID
const nodeId = identity.getNodeId();

// Sign data
const signature = identity.sign('data to sign');

// Verify a signature
const isValid = identity.verify('data to verify', signature, publicKey);

// Create signed data object
const signedData = signData(
  { message: 'hello world' }, 
  identity, 
  publicKey
);

// Verify signed data
const isValidData = verifySignedData(signedData, identity);
``` 
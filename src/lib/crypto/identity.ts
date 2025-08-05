/**
 * Crypto Identity Utilities
 * 
 * Provides utilities for cryptographic peer identity, signature creation/verification,
 * and challenge-response authentication in the Dig NAT Tools system.
 */

import { createHash, randomBytes } from 'crypto';
import * as ed25519 from '@noble/ed25519';
import * as secp256k1 from '@noble/secp256k1';
import { webcrypto } from 'node:crypto';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';

// Polyfill for Node.js < 19
if (!globalThis.crypto) {
  // Using type assertion since we know webcrypto is compatible
  globalThis.crypto = webcrypto as unknown as Crypto;
}

// Enable secp256k1 sync methods
secp256k1.etc.hmacSha256Sync = (k: Uint8Array, ...m: Uint8Array[]) => 
  hmac(sha256, k, secp256k1.etc.concatBytes(...m));

/**
 * Supported signature algorithms
 */
export type SignatureAlgorithm = 'ed25519' | 'secp256k1' | 'rsa';

/**
 * Options for the CryptoIdentity instance
 */
export interface CryptoIdentityOptions {
  privateKey: Buffer | string;
  publicKey?: Buffer | string;
  algorithm?: SignatureAlgorithm;
  encoding?: BufferEncoding;
  outputEncoding?: 'hex' | 'base64';
}

/**
 * Class that handles cryptographic identity operations
 */
export class CryptoIdentity {
  private privateKey: Buffer;
  private publicKey?: Buffer;
  private algorithm: SignatureAlgorithm;
  private encoding: BufferEncoding;
  private outputEncoding: 'hex' | 'base64';

  /**
   * Create a crypto identity instance
   */
  constructor(options: CryptoIdentityOptions) {
    this.algorithm = options.algorithm || 'ed25519';
    this.encoding = options.encoding || 'hex';
    this.outputEncoding = options.outputEncoding || 'hex';

    // Validate and convert keys
    this.privateKey = typeof options.privateKey === 'string' 
      ? Buffer.from(options.privateKey, this.encoding) 
      : options.privateKey;

    if (options.publicKey) {
      this.publicKey = typeof options.publicKey === 'string'
        ? Buffer.from(options.publicKey, this.encoding)
        : options.publicKey;
    }

    // Validate key lengths
    if (this.algorithm === 'ed25519') {
      if (this.privateKey.length !== 32) {
        throw new Error('Ed25519 private key must be 32 bytes');
      }
      if (this.publicKey && this.publicKey.length !== 32) {
        throw new Error('Ed25519 public key must be 32 bytes');
      }
    } else if (this.algorithm === 'secp256k1') {
      if (this.privateKey.length !== 32) {
        throw new Error('Secp256k1 private key must be 32 bytes');
      }
      if (this.publicKey && this.publicKey.length !== 33 && this.publicKey.length !== 65) {
        throw new Error('Secp256k1 public key must be 33 or 65 bytes');
      }
    }
  }

  /**
   * Derive a node ID from the public key
   */
  public getNodeId(): string {
    if (!this.publicKey) {
      throw new Error('Public key not available for node ID derivation');
    }
    return createHash('sha256')
      .update(this.publicKey)
      .digest('hex')
      .substring(0, 40);
  }

  /**
   * Sign data using the private key
   */
  public async sign(data: string | Buffer): Promise<string> {
    const dataBuffer = typeof data === 'string' ? Buffer.from(data) : data;
    const messageHash = createHash('sha256').update(dataBuffer).digest();

    try {
      if (this.algorithm === 'ed25519') {
        const signature = await ed25519.signAsync(messageHash, this.privateKey);
        return Buffer.from(signature).toString(this.outputEncoding);
      } else if (this.algorithm === 'secp256k1') {
        // secp256k1 requires a 32-byte message hash
        const signature = await secp256k1.signAsync(messageHash, this.privateKey, {
          lowS: true // Use low-S signatures for compatibility
        });
        // Get the compact raw bytes representation
        const signatureBytes = signature.toCompactRawBytes();
        return Buffer.from(signatureBytes).toString(this.outputEncoding);
      } else {
        throw new Error(`Unsupported algorithm: ${this.algorithm}`);
      }
    } catch (error) {
      throw new Error(`Signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify a signature against data
   */
  public async verify(data: string | Buffer, signature: string | Buffer, publicKey?: Buffer | string): Promise<boolean> {
    if (!this.publicKey && !publicKey) {
      throw new Error('Public key required for signature verification');
    }

    const keyToUse = publicKey 
      ? (typeof publicKey === 'string' ? Buffer.from(publicKey, this.encoding) : publicKey) 
      : this.publicKey!;

    const dataBuffer = typeof data === 'string' ? Buffer.from(data) : data;
    const signatureBuffer = typeof signature === 'string' ? Buffer.from(signature, this.outputEncoding) : signature;
    const messageHash = createHash('sha256').update(dataBuffer).digest();

    try {
      if (this.algorithm === 'ed25519') {
        return await ed25519.verifyAsync(signatureBuffer, messageHash, keyToUse);
      } else if (this.algorithm === 'secp256k1') {
        // Convert Buffer to Uint8Array for secp256k1
        const signatureArray = new Uint8Array(signatureBuffer);
        const keyArray = new Uint8Array(keyToUse);
        // Create a signature instance from the compact format
        const sig = secp256k1.Signature.fromCompact(signatureArray);
        return secp256k1.verify(sig, messageHash, keyArray);
      } else {
        throw new Error(`Unsupported algorithm: ${this.algorithm}`);
      }
    } catch (error) {
      throw new Error(`Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a random challenge for challenge-response authentication
   */
  public static generateChallenge(length = 32): string {
    return randomBytes(length).toString('hex');
  }
}

/**
 * Create a crypto identity instance
 */
export function createCryptoIdentity(options: CryptoIdentityOptions): CryptoIdentity {
  return new CryptoIdentity(options);
}

/**
 * Interface for signed data
 */
export interface SignedData<T> {
  data: T;
  signature: string;
  publicKey: string;
  timestamp: number;
}

/**
 * Sign data and return a SignedData object
 */
export async function signData<T>(
  data: T, 
  identity: CryptoIdentity, 
  publicKey: string
): Promise<SignedData<T>> {
  const timestamp = Date.now();
  const dataWithTimestamp = { ...data, timestamp };
  const serialized = JSON.stringify(dataWithTimestamp);
  const signature = await identity.sign(serialized);

  return {
    data: dataWithTimestamp as T,
    signature,
    publicKey,
    timestamp
  };
}

/**
 * Verify a SignedData object
 */
export async function verifySignedData<T>(signedData: SignedData<T>, identity: CryptoIdentity): Promise<boolean> {
  const { data, signature, publicKey } = signedData;
  const serialized = JSON.stringify(data);
  return await identity.verify(serialized, signature, publicKey);
} 
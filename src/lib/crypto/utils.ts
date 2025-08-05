/**
 * Cryptographic utility functions
 * 
 * Provides secure cryptographic operations with proper key handling,
 * constant-time comparisons, and input validation.
 */

import { createHash, randomBytes, KeyObject, createSecretKey, createCipheriv, createDecipheriv, timingSafeEqual } from 'crypto';

/**
 * Calculate the SHA-256 hash of a buffer
 * @param buffer - The buffer to hash
 * @returns The SHA-256 hash as a hex string
 */
export function calculateSHA256(buffer: Buffer): string {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Input must be a Buffer');
  }
  const hash = createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
}

/**
 * Convert a buffer to a base64 string
 * @param buffer - The buffer to convert
 * @returns The base64 string
 */
export function bufferToBase64(buffer: Buffer): string {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Input must be a Buffer');
  }
  return buffer.toString('base64');
}

/**
 * Convert a base64 string to a buffer
 * @param base64 - The base64 string to convert
 * @returns The buffer
 */
export function base64ToBuffer(base64: string): Buffer {
  if (typeof base64 !== 'string') {
    throw new Error('Input must be a string');
  }
  try {
    return Buffer.from(base64, 'base64');
  } catch (error) {
    throw new Error('Invalid base64 string');
  }
}

/**
 * Generate a cryptographically secure random buffer of specified length
 * @param length - The length of the buffer to generate
 * @returns A random buffer
 */
export function generateRandomBuffer(length: number): Buffer {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('Length must be a positive integer');
  }
  return randomBytes(length);
}

/**
 * Generate a cryptographically secure random string of specified length
 * @param length - The length of the string to generate
 * @returns A random hex string
 */
export function generateRandomString(length: number): string {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('Length must be a positive integer');
  }
  return randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

/**
 * Result of AES encryption
 */
export interface AESEncryptionResult {
  encrypted: Buffer;
  iv: Buffer;
  tag: Buffer;
}

/**
 * Create a secure key object from a buffer
 * @param keyBuffer - The key buffer (must be 32 bytes for AES-256)
 * @returns A KeyObject for use in cryptographic operations
 */
export function createKeyObject(keyBuffer: Buffer): KeyObject {
  if (!Buffer.isBuffer(keyBuffer) || keyBuffer.length !== 32) {
    throw new Error('Key must be a 32-byte Buffer');
  }
  return createSecretKey(keyBuffer);
}

/**
 * Encrypt data using AES-256-GCM with proper key handling
 * @param data - The data to encrypt
 * @param key - The encryption key as a KeyObject
 * @returns Object containing the encrypted data, iv, and auth tag
 */
export function encryptAES(data: Buffer, key: KeyObject): AESEncryptionResult {
  if (!Buffer.isBuffer(data)) {
    throw new Error('Data must be a Buffer');
  }
  if (!(key instanceof KeyObject) || key.type !== 'secret') {
    throw new Error('Key must be a secret KeyObject');
  }
  
  // Generate a random IV (12 bytes is recommended for GCM)
  const iv = randomBytes(12);
  
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(data),
      cipher.final()
    ]);
    
    const tag = cipher.getAuthTag();
    
    return { encrypted, iv, tag };
  } catch (error) {
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypt data using AES-256-GCM with proper key handling
 * @param encrypted - The encrypted data
 * @param key - The encryption key as a KeyObject
 * @param iv - The initialization vector used for encryption
 * @param tag - The authentication tag
 * @returns The decrypted data
 */
export function decryptAES(encrypted: Buffer, key: KeyObject, iv: Buffer, tag: Buffer): Buffer {
  if (!Buffer.isBuffer(encrypted)) {
    throw new Error('Encrypted data must be a Buffer');
  }
  if (!(key instanceof KeyObject) || key.type !== 'secret') {
    throw new Error('Key must be a secret KeyObject');
  }
  if (!Buffer.isBuffer(iv) || iv.length !== 12) {
    throw new Error('IV must be a 12-byte Buffer');
  }
  if (!Buffer.isBuffer(tag) || tag.length !== 16) {
    throw new Error('Auth tag must be a 16-byte Buffer');
  }
  
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Compare two buffers in constant time to prevent timing attacks
 * @param a - First buffer
 * @param b - Second buffer
 * @returns True if buffers are equal
 */
export function constantTimeEqual(a: Buffer, b: Buffer): boolean {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new Error('Inputs must be Buffers');
  }
  if (a.length !== b.length) {
    return false;
  }
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
} 
/**
 * Cryptographic utility functions
 */

import * as crypto from 'crypto';

/**
 * Calculate the SHA-256 hash of a buffer
 * @param buffer - The buffer to hash
 * @returns The SHA-256 hash as a hex string
 */
export function calculateSHA256(buffer: Buffer): string {
  const hash = crypto.createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
}

/**
 * Convert a buffer to a base64 string
 * @param buffer - The buffer to convert
 * @returns The base64 string
 */
export function bufferToBase64(buffer: Buffer): string {
  return buffer.toString('base64');
}

/**
 * Convert a base64 string to a buffer
 * @param base64 - The base64 string to convert
 * @returns The buffer
 */
export function base64ToBuffer(base64: string): Buffer {
  return Buffer.from(base64, 'base64');
}

/**
 * Generate a random buffer of specified length
 * @param length - The length of the buffer to generate
 * @returns A random buffer
 */
export function generateRandomBuffer(length: number): Buffer {
  return crypto.randomBytes(length);
}

/**
 * Generate a random string of specified length
 * @param length - The length of the string to generate
 * @returns A random string
 */
export function generateRandomString(length: number): string {
  return crypto.randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

/**
 * Encrypt data using AES-256-GCM
 * @param data - The data to encrypt
 * @param key - The encryption key (must be 32 bytes for AES-256)
 * @returns Object containing the encrypted data, iv, and auth tag
 */
export function encryptAES(data: Buffer, key: Buffer): { encrypted: Buffer; iv: Buffer; tag: Buffer } {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(data),
    cipher.final()
  ]);
  
  const tag = cipher.getAuthTag();
  
  return { encrypted, iv, tag };
}

/**
 * Decrypt data using AES-256-GCM
 * @param encrypted - The encrypted data
 * @param key - The encryption key (must be 32 bytes for AES-256)
 * @param iv - The initialization vector used for encryption
 * @param tag - The authentication tag
 * @returns The decrypted data
 */
export function decryptAES(encrypted: Buffer, key: Buffer, iv: Buffer, tag: Buffer): Buffer {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);
} 
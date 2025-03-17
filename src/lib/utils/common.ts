/**
 * Common utility functions used throughout the library
 */

import Debug from 'debug';

const debug = Debug('dig-nat-tools:utils:common');

/**
 * Sleep for a specified number of milliseconds
 * @param ms - The number of milliseconds to sleep
 * @returns A promise that resolves after the specified time
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Attempt to parse JSON with fallback to null
 * @param str - The string to parse
 * @returns The parsed object or null if parsing failed
 */
export function safeJSONParse<T = any>(str: string): T | null {
  try {
    return JSON.parse(str) as T;
  } catch (err) {
    debug(`JSON parse error: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Get a random value from an array
 * @param array - The array to get a random value from
 * @returns A random value from the array
 */
export function getRandomArrayValue<T>(array: T[]): T | null {
  if (!array || array.length === 0) return null;
  const index = Math.floor(Math.random() * array.length);
  return array[index];
}

/**
 * Shuffle an array in place using the Fisher-Yates algorithm
 * @param array - The array to shuffle
 * @returns The shuffled array (same reference)
 */
export function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Generate a random port number within a specified range
 * @param min - Minimum port number (default: 10000)
 * @param max - Maximum port number (default: 65535)
 * @returns A random port number
 */
export function getRandomPort(min = 10000, max = 65535): number {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

/**
 * Create a timeout promise that rejects after a specified time
 * @param ms - The timeout in milliseconds
 * @param message - The error message
 * @returns A promise that rejects after the specified time
 */
export function createTimeout(ms: number, message = 'Operation timed out'): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

/**
 * Race a promise against a timeout
 * @param promise - The promise to race
 * @param timeoutMs - The timeout in milliseconds
 * @param timeoutMessage - The error message for timeout
 * @returns A promise that resolves with the result of the original promise or rejects with a timeout error
 */
export function promiseWithTimeout<T>(
  promise: Promise<T>, 
  timeoutMs: number, 
  timeoutMessage = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    createTimeout(timeoutMs, timeoutMessage)
  ]);
}

/**
 * Parse a connection string into hostname and port
 * @param connectionString - Connection string in format "hostname:port"
 * @returns Object with hostname and port
 */
export function parseConnectionString(connectionString: string): { hostname: string; port: number } {
  const parts = connectionString.split(':');
  if (parts.length !== 2) {
    throw new Error(`Invalid connection string: ${connectionString}`);
  }
  
  return {
    hostname: parts[0],
    port: parseInt(parts[1], 10)
  };
}

/**
 * Create a connection string from hostname and port
 * @param hostname - The hostname or IP address
 * @param port - The port number
 * @returns A connection string in format "hostname:port"
 */
export function createConnectionString(hostname: string, port: number): string {
  return `${hostname}:${port}`;
} 
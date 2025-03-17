/**
 * Utility functions for networking and NAT traversal
 */
/**
 * Interface for IP addresses
 */
export interface IPAddresses {
    v4: string[];
    v6: string[];
}
/**
 * Interface for connection string parsing result
 */
export interface ConnectionStringParts {
    hostname: string;
    port: number;
}
/**
 * Get local IP addresses (both IPv4 and IPv6)
 * @returns Object with 'v4' and 'v6' arrays of IP addresses
 */
export declare function getLocalIPs(): IPAddresses;
/**
 * Check if an IP address is likely to be private/internal
 * @param ipAddress - The IP address to check
 * @returns True if the IP is private/internal
 */
export declare function isPrivateIP(ipAddress: string): boolean;
/**
 * Generate a random port number within a specified range
 * @param min - Minimum port number (default: 10000)
 * @param max - Maximum port number (default: 65535)
 * @returns A random port number
 */
export declare function getRandomPort(min?: number, max?: number): number;
/**
 * Parse a connection string into hostname and port
 * @param connectionString - Connection string in format "hostname:port"
 * @returns Object with hostname and port
 */
export declare function parseConnectionString(connectionString: string): ConnectionStringParts;
/**
 * Create a connection string from hostname and port
 * @param hostname - The hostname or IP address
 * @param port - The port number
 * @returns A connection string in format "hostname:port"
 */
export declare function createConnectionString(hostname: string, port: number): string;
/**
 * Calculate the SHA-256 hash of a buffer
 * @param buffer - The buffer to hash
 * @returns The SHA-256 hash as a hex string
 */
export declare function calculateSHA256(buffer: Buffer): string;
/**
 * Sleep for a specified number of milliseconds
 * @param ms - The number of milliseconds to sleep
 * @returns A promise that resolves after the specified time
 */
export declare function sleep(ms: number): Promise<void>;
/**
 * Attempt to parse JSON with fallback to null
 * @param str - The string to parse
 * @returns The parsed object or null if parsing failed
 */
export declare function safeJSONParse<T = any>(str: string): T | null;
/**
 * Convert a buffer to a base64 string
 * @param buffer - The buffer to convert
 * @returns The base64 string
 */
export declare function bufferToBase64(buffer: Buffer): string;
/**
 * Convert a base64 string to a buffer
 * @param base64 - The base64 string to convert
 * @returns The buffer
 */
export declare function base64ToBuffer(base64: string): Buffer;
/**
 * Get a random value from an array
 * @param array - The array to get a random value from
 * @returns A random value from the array
 */
export declare function getRandomArrayValue<T>(array: T[]): T | null;
/**
 * Shuffle an array in place using the Fisher-Yates algorithm
 * @param array - The array to shuffle
 * @returns The shuffled array (same reference)
 */
export declare function shuffleArray<T>(array: T[]): T[];
/**
 * Create a timeout promise that rejects after a specified time
 * @param ms - The timeout in milliseconds
 * @param message - The error message
 * @returns A promise that rejects after the specified time
 */
export declare function createTimeout(ms: number, message?: string): Promise<never>;
/**
 * Race a promise against a timeout
 * @param promise - The promise to race
 * @param timeoutMs - The timeout in milliseconds
 * @param timeoutMessage - The error message for timeout
 * @returns A promise that resolves with the result of the original promise or rejects with a timeout error
 */
export declare function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage?: string): Promise<T>;

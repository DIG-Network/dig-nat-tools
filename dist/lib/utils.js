"use strict";
/**
 * Utility functions for networking and NAT traversal
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLocalIPs = getLocalIPs;
exports.isPrivateIP = isPrivateIP;
exports.getRandomPort = getRandomPort;
exports.parseConnectionString = parseConnectionString;
exports.createConnectionString = createConnectionString;
exports.calculateSHA256 = calculateSHA256;
exports.sleep = sleep;
exports.safeJSONParse = safeJSONParse;
exports.bufferToBase64 = bufferToBase64;
exports.base64ToBuffer = base64ToBuffer;
exports.getRandomArrayValue = getRandomArrayValue;
exports.shuffleArray = shuffleArray;
exports.createTimeout = createTimeout;
exports.promiseWithTimeout = promiseWithTimeout;
const os = __importStar(require("os"));
const ip = __importStar(require("ip"));
const debug_1 = __importDefault(require("debug"));
const crypto = __importStar(require("crypto"));
const debug = (0, debug_1.default)('dig-nat-tools:utils');
/**
 * Get local IP addresses (both IPv4 and IPv6)
 * @returns Object with 'v4' and 'v6' arrays of IP addresses
 */
function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const addresses = {
        v4: [],
        v6: []
    };
    // Iterate over network interfaces
    Object.keys(interfaces).forEach(interfaceName => {
        const networkInterface = interfaces[interfaceName];
        if (!networkInterface)
            return;
        networkInterface.forEach((addr) => {
            const addrInfo = addr;
            // Skip internal addresses
            if (addrInfo.internal)
                return;
            // Check for IPv4 address (can be string 'IPv4' or number 4)
            if (addrInfo.family === 'IPv4' || (typeof addrInfo.family === 'number' && addrInfo.family === 4)) {
                addresses.v4.push(addrInfo.address);
            }
            // Check for IPv6 address (can be string 'IPv6' or number 6)
            else if (addrInfo.family === 'IPv6' || (typeof addrInfo.family === 'number' && addrInfo.family === 6)) {
                // Skip link-local IPv6 addresses (fe80::)
                if (!addrInfo.address.startsWith('fe80:')) {
                    addresses.v6.push(addrInfo.address);
                }
            }
        });
    });
    return addresses;
}
/**
 * Check if an IP address is likely to be private/internal
 * @param ipAddress - The IP address to check
 * @returns True if the IP is private/internal
 */
function isPrivateIP(ipAddress) {
    try {
        return ip.isPrivate(ipAddress);
    }
    catch (err) {
        debug(`Error checking if IP is private: ${err.message}`);
        // Default to true (assume private) if there's an error
        return true;
    }
}
/**
 * Generate a random port number within a specified range
 * @param min - Minimum port number (default: 10000)
 * @param max - Maximum port number (default: 65535)
 * @returns A random port number
 */
function getRandomPort(min = 10000, max = 65535) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}
/**
 * Parse a connection string into hostname and port
 * @param connectionString - Connection string in format "hostname:port"
 * @returns Object with hostname and port
 */
function parseConnectionString(connectionString) {
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
function createConnectionString(hostname, port) {
    return `${hostname}:${port}`;
}
/**
 * Calculate the SHA-256 hash of a buffer
 * @param buffer - The buffer to hash
 * @returns The SHA-256 hash as a hex string
 */
function calculateSHA256(buffer) {
    const hash = crypto.createHash('sha256');
    hash.update(buffer);
    return hash.digest('hex');
}
/**
 * Sleep for a specified number of milliseconds
 * @param ms - The number of milliseconds to sleep
 * @returns A promise that resolves after the specified time
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Attempt to parse JSON with fallback to null
 * @param str - The string to parse
 * @returns The parsed object or null if parsing failed
 */
function safeJSONParse(str) {
    try {
        return JSON.parse(str);
    }
    catch (err) {
        debug(`JSON parse error: ${err.message}`);
        return null;
    }
}
/**
 * Convert a buffer to a base64 string
 * @param buffer - The buffer to convert
 * @returns The base64 string
 */
function bufferToBase64(buffer) {
    return buffer.toString('base64');
}
/**
 * Convert a base64 string to a buffer
 * @param base64 - The base64 string to convert
 * @returns The buffer
 */
function base64ToBuffer(base64) {
    return Buffer.from(base64, 'base64');
}
/**
 * Get a random value from an array
 * @param array - The array to get a random value from
 * @returns A random value from the array
 */
function getRandomArrayValue(array) {
    if (!array || array.length === 0)
        return null;
    const index = Math.floor(Math.random() * array.length);
    return array[index];
}
/**
 * Shuffle an array in place using the Fisher-Yates algorithm
 * @param array - The array to shuffle
 * @returns The shuffled array (same reference)
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
/**
 * Create a timeout promise that rejects after a specified time
 * @param ms - The timeout in milliseconds
 * @param message - The error message
 * @returns A promise that rejects after the specified time
 */
function createTimeout(ms, message = 'Operation timed out') {
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
function promiseWithTimeout(promise, timeoutMs, timeoutMessage = 'Operation timed out') {
    return Promise.race([
        promise,
        createTimeout(timeoutMs, timeoutMessage)
    ]);
}
//# sourceMappingURL=utils.js.map
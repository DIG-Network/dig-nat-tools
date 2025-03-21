/**
 * Utility functions for networking and NAT traversal
 * 
 * This file re-exports utility functions from specialized modules.
 */

// Re-export from common utilities
export {
  sleep,
  safeJSONParse,
  getRandomArrayValue,
  shuffleArray,
  getRandomPort,
  createTimeout,
  promiseWithTimeout,
  parseConnectionString,
  createConnectionString
} from './utils/common';

// Re-export from network utilities
export {
  IPAddresses,
  getLocalIPs,
  isPrivateIP,
  discoverPublicIPs,
  discoverIPsViaSTUN,
  analyzeLocalNetworkInterfaces
} from './utils/network';

// Re-export from NAT-PMP utilities
export {
  NAT_CONSTANTS,
  PortMappingResult,
  NatPmpClient,
  natPmpClient,
  discoverGateway,
  getExternalAddressNATPMP,
  createPortMapping,
  deletePortMapping
} from './utils/nat-pmp';

// Re-export from crypto utilities - now importing from the crypto module
export {
  calculateSHA256,
  bufferToBase64,
  base64ToBuffer,
  generateRandomBuffer,
  generateRandomString,
  encryptAES,
  decryptAES
} from './crypto/utils'; 
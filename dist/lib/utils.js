"use strict";
/**
 * Utility functions for networking and NAT traversal
 *
 * This file re-exports utility functions from specialized modules.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.decryptAES = exports.encryptAES = exports.generateRandomString = exports.generateRandomBuffer = exports.base64ToBuffer = exports.bufferToBase64 = exports.calculateSHA256 = exports.deletePortMapping = exports.createPortMapping = exports.getExternalAddressNATPMP = exports.discoverGateway = exports.natPmpClient = exports.NatPmpClient = exports.NAT_CONSTANTS = exports.analyzeLocalNetworkInterfaces = exports.discoverIPsViaSTUN = exports.discoverPublicIPs = exports.isPrivateIP = exports.getLocalIPs = exports.createConnectionString = exports.parseConnectionString = exports.promiseWithTimeout = exports.createTimeout = exports.getRandomPort = exports.shuffleArray = exports.getRandomArrayValue = exports.safeJSONParse = exports.sleep = void 0;
// Re-export from common utilities
var common_1 = require("./utils/common");
Object.defineProperty(exports, "sleep", { enumerable: true, get: function () { return common_1.sleep; } });
Object.defineProperty(exports, "safeJSONParse", { enumerable: true, get: function () { return common_1.safeJSONParse; } });
Object.defineProperty(exports, "getRandomArrayValue", { enumerable: true, get: function () { return common_1.getRandomArrayValue; } });
Object.defineProperty(exports, "shuffleArray", { enumerable: true, get: function () { return common_1.shuffleArray; } });
Object.defineProperty(exports, "getRandomPort", { enumerable: true, get: function () { return common_1.getRandomPort; } });
Object.defineProperty(exports, "createTimeout", { enumerable: true, get: function () { return common_1.createTimeout; } });
Object.defineProperty(exports, "promiseWithTimeout", { enumerable: true, get: function () { return common_1.promiseWithTimeout; } });
Object.defineProperty(exports, "parseConnectionString", { enumerable: true, get: function () { return common_1.parseConnectionString; } });
Object.defineProperty(exports, "createConnectionString", { enumerable: true, get: function () { return common_1.createConnectionString; } });
// Re-export from network utilities
var network_1 = require("./utils/network");
Object.defineProperty(exports, "getLocalIPs", { enumerable: true, get: function () { return network_1.getLocalIPs; } });
Object.defineProperty(exports, "isPrivateIP", { enumerable: true, get: function () { return network_1.isPrivateIP; } });
Object.defineProperty(exports, "discoverPublicIPs", { enumerable: true, get: function () { return network_1.discoverPublicIPs; } });
Object.defineProperty(exports, "discoverIPsViaSTUN", { enumerable: true, get: function () { return network_1.discoverIPsViaSTUN; } });
Object.defineProperty(exports, "analyzeLocalNetworkInterfaces", { enumerable: true, get: function () { return network_1.analyzeLocalNetworkInterfaces; } });
// Re-export from NAT-PMP utilities
var nat_pmp_1 = require("./utils/nat-pmp");
Object.defineProperty(exports, "NAT_CONSTANTS", { enumerable: true, get: function () { return nat_pmp_1.NAT_CONSTANTS; } });
Object.defineProperty(exports, "NatPmpClient", { enumerable: true, get: function () { return nat_pmp_1.NatPmpClient; } });
Object.defineProperty(exports, "natPmpClient", { enumerable: true, get: function () { return nat_pmp_1.natPmpClient; } });
Object.defineProperty(exports, "discoverGateway", { enumerable: true, get: function () { return nat_pmp_1.discoverGateway; } });
Object.defineProperty(exports, "getExternalAddressNATPMP", { enumerable: true, get: function () { return nat_pmp_1.getExternalAddressNATPMP; } });
Object.defineProperty(exports, "createPortMapping", { enumerable: true, get: function () { return nat_pmp_1.createPortMapping; } });
Object.defineProperty(exports, "deletePortMapping", { enumerable: true, get: function () { return nat_pmp_1.deletePortMapping; } });
// Re-export from crypto utilities
var crypto_1 = require("./utils/crypto");
Object.defineProperty(exports, "calculateSHA256", { enumerable: true, get: function () { return crypto_1.calculateSHA256; } });
Object.defineProperty(exports, "bufferToBase64", { enumerable: true, get: function () { return crypto_1.bufferToBase64; } });
Object.defineProperty(exports, "base64ToBuffer", { enumerable: true, get: function () { return crypto_1.base64ToBuffer; } });
Object.defineProperty(exports, "generateRandomBuffer", { enumerable: true, get: function () { return crypto_1.generateRandomBuffer; } });
Object.defineProperty(exports, "generateRandomString", { enumerable: true, get: function () { return crypto_1.generateRandomString; } });
Object.defineProperty(exports, "encryptAES", { enumerable: true, get: function () { return crypto_1.encryptAES; } });
Object.defineProperty(exports, "decryptAES", { enumerable: true, get: function () { return crypto_1.decryptAES; } });
//# sourceMappingURL=utils.js.map
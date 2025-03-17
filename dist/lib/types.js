"use strict";
/**
 * Type definitions for the dig-nat-tools library
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONNECTION_TYPE = void 0;
/**
 * Available connection types in order of preference
 * NOTE: This enum is deprecated. Please use the CONNECTION_TYPE from ../types/constants.ts
 */
var CONNECTION_TYPE;
(function (CONNECTION_TYPE) {
    CONNECTION_TYPE["TCP"] = "tcp";
    CONNECTION_TYPE["UDP"] = "udp";
    CONNECTION_TYPE["WEBRTC"] = "webrtc";
    CONNECTION_TYPE["GUN"] = "gun";
})(CONNECTION_TYPE || (exports.CONNECTION_TYPE = CONNECTION_TYPE = {}));
//# sourceMappingURL=types.js.map
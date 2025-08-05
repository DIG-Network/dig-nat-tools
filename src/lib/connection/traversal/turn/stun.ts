/**
 * STUN Message Utilities
 * 
 * Provides functions for creating and parsing STUN messages according to RFC 5389.
 */

import { TURN_CONSTANTS } from './constants';

interface StunMessageAttributes {
  [key: number]: any;
  transactionId?: Buffer;
}

interface StunMessage {
  type: number;
  attributes: StunMessageAttributes;
}

/**
 * Creates a STUN message with the specified type
 */
export function createStunMessage(message: StunMessage): Buffer {
  // Calculate total length needed for the message
  let totalLength = 20; // STUN header size
  for (const [_, value] of Object.entries(message.attributes)) {
    if (Buffer.isBuffer(value)) {
      totalLength += 4 + value.length; // TLV header + value length
    } else if (typeof value === 'number') {
      totalLength += 4 + 4; // TLV header + 4 bytes for number
    } else if (typeof value === 'object' && 'address' in value) {
      totalLength += 4 + 8; // TLV header + 8 bytes for address and port
    }
  }

  // Create buffer with calculated size
  const buffer = Buffer.alloc(totalLength);

  // Write message type (first 2 bytes)
  buffer.writeUInt16BE(message.type, 0);
  
  // Write message length (next 2 bytes)
  buffer.writeUInt16BE(totalLength - 20, 2);

  // Write magic cookie (next 4 bytes)
  buffer.writeUInt32BE(TURN_CONSTANTS.MAGIC_COOKIE, 4);

  // Write transaction ID (next 12 bytes)
  const transactionId = Buffer.alloc(12);
  for (let i = 0; i < 12; i++) {
    transactionId[i] = Math.floor(Math.random() * 256);
  }
  transactionId.copy(buffer, 8);

  // Write attributes
  let offset = 20;
  for (const [type, value] of Object.entries(message.attributes)) {
    // Write attribute type
    buffer.writeUInt16BE(parseInt(type), offset);
    offset += 2;

    if (Buffer.isBuffer(value)) {
      // Write length
      buffer.writeUInt16BE(value.length, offset);
      offset += 2;
      // Write value
      value.copy(buffer, offset);
      offset += value.length;
    } else if (typeof value === 'number') {
      // Write length
      buffer.writeUInt16BE(4, offset);
      offset += 2;
      // Write value
      buffer.writeUInt32BE(value, offset);
      offset += 4;
    } else if (typeof value === 'object' && 'address' in value) {
      // Write length
      buffer.writeUInt16BE(8, offset);
      offset += 2;
      // Write family (IPv4 = 1, IPv6 = 2)
      buffer.writeUInt16BE(1, offset);
      offset += 2;
      // Write port
      buffer.writeUInt16BE(value.port, offset);
      offset += 2;
      // Write address
      const parts = value.address.split('.');
      for (const part of parts) {
        buffer.writeUInt8(parseInt(part), offset++);
      }
    }
  }

  return buffer;
}

/**
 * Parses a STUN message from a buffer
 */
export function parseStunMessage(buffer: Buffer): StunMessage {
  const type = buffer.readUInt16BE(0);
  const length = buffer.readUInt16BE(2);
  const magicCookie = buffer.readUInt32BE(4);
  const transactionId = buffer.slice(8, 20);

  // Validate message length
  if (buffer.length < TURN_CONSTANTS.STUN_HEADER_SIZE + length) {
    throw new Error('Invalid STUN message: incomplete message');
  }

  if (magicCookie !== TURN_CONSTANTS.MAGIC_COOKIE) {
    throw new Error('Invalid STUN message: wrong magic cookie');
  }

  const attributes: StunMessageAttributes = {
    transactionId: transactionId // Store transactionId in attributes for response matching
  };
  let offset = 20;

  while (offset < TURN_CONSTANTS.STUN_HEADER_SIZE + length) {
    const attrType = buffer.readUInt16BE(offset);
    offset += 2;
    const attrLength = buffer.readUInt16BE(offset);
    offset += 2;

    switch (attrType) {
      case TURN_CONSTANTS.STUN_ATTRIBUTES.CHANNEL_NUMBER:
      case TURN_CONSTANTS.STUN_ATTRIBUTES.LIFETIME:
        attributes[attrType] = buffer.readUInt32BE(offset);
        break;
      case TURN_CONSTANTS.STUN_ATTRIBUTES.XOR_PEER_ADDRESS:
      case TURN_CONSTANTS.STUN_ATTRIBUTES.XOR_RELAYED_ADDRESS:
        const family = buffer.readUInt16BE(offset);
        const port = buffer.readUInt16BE(offset + 2);
        if (family !== 1 && family !== 2) {
          throw new Error(`Invalid address family: ${family}`);
        }
        const addrLength = family === 1 ? 4 : 16;
        const addr = [];
        for (let i = 0; i < addrLength; i++) {
          addr.push(buffer.readUInt8(offset + 4 + i));
        }
        attributes[attrType] = {
          family: family === 1 ? 'IPv4' : 'IPv6',
          address: addr.join('.'),
          port: port
        };
        break;
      case TURN_CONSTANTS.STUN_ATTRIBUTES.DATA:
        attributes[attrType] = buffer.slice(offset, offset + attrLength);
        break;
      default:
        // Skip unknown attributes
        break;
    }
    offset += attrLength;
  }

  return {
    type,
    attributes
  };
}

/**
 * Adds an attribute to a STUN message
 */
export function addStunAttribute(message: Buffer, type: number, value: Buffer): Buffer {
  const currentLength = message.readUInt16BE(2);
  const newLength = currentLength + 4 + Math.ceil(value.length / 4) * 4;
  
  // Check if new length exceeds maximum message size
  if (TURN_CONSTANTS.STUN_HEADER_SIZE + newLength > TURN_CONSTANTS.MAX_MESSAGE_SIZE) {
    throw new Error('Message size would exceed maximum allowed size');
  }
  
  // Create new buffer with space for the attribute
  const newMessage = Buffer.alloc(TURN_CONSTANTS.STUN_HEADER_SIZE + newLength);
  message.copy(newMessage, 0);
  
  // Update message length
  newMessage.writeUInt16BE(newLength, 2);
  
  // Write attribute header
  const attrOffset = TURN_CONSTANTS.STUN_HEADER_SIZE + currentLength;
  newMessage.writeUInt16BE(type, attrOffset);
  newMessage.writeUInt16BE(value.length, attrOffset + 2);
  
  // Write attribute value
  value.copy(newMessage, attrOffset + 4);
  
  // Add padding if needed
  const padding = Math.ceil(value.length / 4) * 4 - value.length;
  if (padding > 0) {
    newMessage.fill(0, attrOffset + 4 + value.length, attrOffset + 4 + value.length + padding);
  }
  
  return newMessage;
} 
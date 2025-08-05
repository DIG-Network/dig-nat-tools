/**
 * ICE Signaling
 * 
 * GunJS-based signaling implementation for ICE.
 */

import Debug from 'debug';
import { 
  generateRandomString, 
  generateRandomBuffer,
  createKeyObject,
  encryptAES,
  decryptAES,
  bufferToBase64,
  base64ToBuffer
} from '../../../crypto/utils';
import { 
  CryptoIdentity,
  signData, 
  verifySignedData 
} from '../../../crypto/identity';
import type { KeyObject } from 'crypto';
import { ICE_CONSTANTS } from './constants';
import type { 
  ICESignalingMessage,
  ICESecurityOptions,
  SignedICEMessage
} from './types';
import type { IGunInstance } from 'gun';

const debug = Debug('dig-nat-tools:ice:signaling');

/**
 * Create a secure signaling channel
 */
export function createSignalingChannel(peerId: string, security: Partial<ICESecurityOptions>): string {
  const timestamp = Date.now();
  const prefix = security.channelPrefix || ICE_CONSTANTS.DEFAULT_SECURITY_OPTIONS.channelPrefix;
  const channelId = generateRandomString(32);
  return `${prefix}/${peerId}/${timestamp}/${channelId}`;
}

/**
 * Setup signaling with GunJS
 */
export class ICESignaling {
  private gun: IGunInstance;
  private channel: string;
  private security: Partial<ICESecurityOptions>;
  private encryptionKey?: KeyObject;
  private identity?: CryptoIdentity;
  private unsubscribe?: () => void;

  constructor(gun: IGunInstance, channel: string, security: Partial<ICESecurityOptions>) {
    this.gun = gun;
    this.channel = channel;
    this.security = security;

    if (security.requireEncryption) {
      const keyBuffer = generateRandomBuffer(32);
      this.encryptionKey = createKeyObject(keyBuffer);
    }
  }

  /**
   * Set encryption key for secure signaling
   */
  setEncryptionKey(key: Buffer): void {
    this.encryptionKey = createKeyObject(key);
  }

  /**
   * Set identity for message signing
   */
  setIdentity(identity: CryptoIdentity): void {
    this.identity = identity;
  }

  /**
   * Send a signaling message
   */
  async send(message: ICESignalingMessage): Promise<void> {
    let finalMessage: ICESignalingMessage | SignedICEMessage = { ...message };

    if (this.security.requireEncryption && this.encryptionKey) {
      const payloadBuffer = Buffer.from(JSON.stringify(message.payload));
      const { encrypted, iv, tag } = encryptAES(payloadBuffer, this.encryptionKey);
      
      finalMessage.payload = {
        encrypted: bufferToBase64(encrypted),
        iv: bufferToBase64(iv),
        tag: bufferToBase64(tag)
      };
      finalMessage.encrypted = true;
    }

    if (this.security.validateSignature && this.identity) {
      finalMessage = await signData(finalMessage, this.identity, await this.identity.getNodeId()) as SignedICEMessage;
    }

    await new Promise<void>((resolve, reject) => {
      this.gun.get(this.channel).put(finalMessage, (ack: any) => {
        if (ack.err) {
          reject(new Error(ack.err));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Listen for signaling messages
   */
  listen(handler: (message: ICESignalingMessage) => void): void {
    const ref = this.gun.get(this.channel);
    ref.on((data: any) => {
      if (data && data.message) {
        handler(data.message);
      }
    });
  }

  /**
   * Close the signaling channel
   */
  close(): void {
    if (this.gun) {
      this.gun.get(this.channel).off();
    }
  }
} 
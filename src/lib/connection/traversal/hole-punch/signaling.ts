/**
 * Hole Punching Signaling
 * 
 * GunJS-based signaling implementation for hole punching.
 */

import { EventEmitter } from 'events';
import type { GunInstance } from '../../../../types/gun';
import { 
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
  verifySignedData,
  type SignedData 
} from '../../../crypto/identity';
import type { KeyObject } from 'crypto';
import type { 
  HolePunchConnectionInfo,
  HolePunchSecurityOptions
} from './types';

interface EncryptedPayload {
  encrypted: string;
  iv: string;
  tag: string;
}

interface SignalingMessage extends HolePunchConnectionInfo {
  payload?: EncryptedPayload;
}

export class HolePunchSignaling extends EventEmitter {
  private gun: GunInstance;
  private channel: string;
  private security: HolePunchSecurityOptions;
  private encryptionKey?: KeyObject;
  private identity?: CryptoIdentity;
  private unsubscribe?: () => void;

  constructor(gun: GunInstance, channel: string, security: HolePunchSecurityOptions) {
    super();
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
   * Send connection info through signaling
   */
  async send(info: HolePunchConnectionInfo): Promise<void> {
    let finalInfo: SignalingMessage = { ...info };

    if (this.security.requireEncryption && this.encryptionKey) {
      const infoBuffer = Buffer.from(JSON.stringify(info));
      const { encrypted, iv, tag } = encryptAES(infoBuffer, this.encryptionKey);
      
      finalInfo = {
        ...info, // Keep original fields
        encrypted: true,
        payload: {
          encrypted: bufferToBase64(encrypted),
          iv: bufferToBase64(iv),
          tag: bufferToBase64(tag)
        }
      };
    }

    let signedInfo: SignedData<SignalingMessage> | SignalingMessage = finalInfo;
    if (this.security.validateSignature && this.identity) {
      const nodeId = await this.identity.getNodeId();
      signedInfo = await signData(finalInfo, this.identity, nodeId);
    }

    await new Promise<void>((resolve, reject) => {
      try {
        this.gun.get(this.channel).put(signedInfo);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Listen for connection info from peers
   */
  listen(callback: (info: HolePunchConnectionInfo) => void): () => void {
    const handler = async (data: any, key: string) => {
      if (key !== this.channel || !data) return;

      try {
        let info: SignalingMessage;

        // Verify signature if required
        if (this.security.validateSignature && 'signature' in data) {
          const signedData = data as SignedData<SignalingMessage>;
          const isValid = await verifySignedData(signedData, this.identity!);
          if (!isValid) {
            this.emit('error', new Error('Invalid signature'));
            return;
          }
          info = signedData.data;
        } else {
          info = data as SignalingMessage;
        }

        // Validate timestamp
        const age = Date.now() - info.timestamp;
        if (age > 30000) { // 30 seconds max age
          this.emit('error', new Error('Message too old'));
          return;
        }

        // Decrypt payload if encrypted
        if (info.encrypted && info.payload && this.encryptionKey) {
          const encrypted = base64ToBuffer(info.payload.encrypted);
          const iv = base64ToBuffer(info.payload.iv);
          const tag = base64ToBuffer(info.payload.tag);
          
          const decrypted = decryptAES(encrypted, this.encryptionKey, iv, tag);
          info = JSON.parse(decrypted.toString());
        }

        callback(info);
      } catch (err) {
        this.emit('error', err);
      }
    };

    // Set up the subscription
    this.gun.get(this.channel).on(handler);

    // Return unsubscribe function
    this.unsubscribe = () => {
      this.gun.get(this.channel).off();
    };
    
    return this.unsubscribe;
  }

  /**
   * Close the signaling channel
   */
  close(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
  }
} 
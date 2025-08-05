import * as dgram from 'dgram';
import * as net from 'net';
import * as crypto from 'crypto';
import Debug from 'debug';
import { EventEmitter } from 'events';
import { STUNStatus, DEFAULT_STUN_SERVERS, STUN_CONSTANTS } from './types';
import type { STUNClient, STUNConnectionOptions, STUNResult, STUNEvents, STUNSecurityOptions } from './types';
import { createUDPSocketBound } from '../../network/network-utils';

const debug = Debug('dig-nat-tools:stun-gun');

/**
 * Base STUN client implementation with GunJS signaling
 */
export class BaseSTUNClient extends EventEmitter implements STUNClient {
  private socket: dgram.Socket | null = null;
  private _status: STUNStatus = STUNStatus.IDLE;
  private activeTransactions: Map<string, { timeout: NodeJS.Timeout; resolve: Function; reject: Function }> = new Map();

  constructor() {
    super();
  }

  /**
   * Get current connection status
   */
  public get status(): STUNStatus {
    return this._status;
  }

  private setStatus(status: STUNStatus): void {
    this._status = status;
    this.emit('status', status);
  }

  /**
   * Validate IP address and port
   */
  private validateEndpoint(address: string, port: number, security: STUNSecurityOptions): boolean {
    if (!net.isIP(address)) {
      throw new Error('Invalid IP address');
    }

    if (port < 1 || port > 65535) {
      throw new Error('Invalid port number');
    }

    // Security checks
    if (!security.allowLoopback && address === '127.0.0.1') {
      throw new Error('Loopback address not allowed');
    }

    if (!security.allowPrivateNetwork) {
      const ipParts = address.split('.');
      if (
        ipParts[0] === '10' ||
        (ipParts[0] === '172' && parseInt(ipParts[1]) >= 16 && parseInt(ipParts[1]) <= 31) ||
        (ipParts[0] === '192' && ipParts[1] === '168')
      ) {
        throw new Error('Private network addresses not allowed');
      }
    }

    return true;
  }

  /**
   * Create STUN binding request
   */
  private createBindingRequest(): { request: Buffer; transactionId: Buffer } {
    const transactionId = crypto.randomBytes(12);
    const request = Buffer.concat([
      Buffer.from([
        (STUN_CONSTANTS.BINDING_REQUEST >> 8) & 0xff,
        STUN_CONSTANTS.BINDING_REQUEST & 0xff,
        0x00, 0x00, // Message Length
        (STUN_CONSTANTS.MAGIC_COOKIE >> 24) & 0xff,
        (STUN_CONSTANTS.MAGIC_COOKIE >> 16) & 0xff,
        (STUN_CONSTANTS.MAGIC_COOKIE >> 8) & 0xff,
        STUN_CONSTANTS.MAGIC_COOKIE & 0xff
      ]),
      transactionId,
      // Add SOFTWARE attribute
      Buffer.from([
        (STUN_CONSTANTS.SOFTWARE >> 8) & 0xff,
        STUN_CONSTANTS.SOFTWARE & 0xff,
        0x00, STUN_CONSTANTS.SOFTWARE_NAME.length,
        ...Buffer.from(STUN_CONSTANTS.SOFTWARE_NAME)
      ])
    ]);

    // Update message length
    request.writeUInt16BE(request.length - 20, 2);

    // Add FINGERPRINT attribute
    const crc = crypto.createHash('crc32').update(request).digest();
    const fingerprint = Buffer.concat([
      Buffer.from([
        (STUN_CONSTANTS.FINGERPRINT >> 8) & 0xff,
        STUN_CONSTANTS.FINGERPRINT & 0xff,
        0x00, 0x04 // Length
      ]),
      crc
    ]);
    
    return { request: Buffer.concat([request, fingerprint]), transactionId };
  }

  /**
   * Validate STUN response
   */
  private validateStunResponse(response: Buffer, transactionId: Buffer, security: STUNSecurityOptions): boolean {
    if (!security.validateStunResponse) return true;

    if (response.length < 20) return false;

    const messageType = response.readUInt16BE(0);
    if (messageType !== STUN_CONSTANTS.BINDING_RESPONSE) return false;

    const messageLength = response.readUInt16BE(2);
    if (response.length < messageLength + 20) return false;

    const magicCookie = response.readUInt32BE(4);
    if (magicCookie !== STUN_CONSTANTS.MAGIC_COOKIE) return false;

    const responseTransactionId = response.slice(8, 20);
    if (!responseTransactionId.equals(transactionId)) return false;

    return true;
  }

  /**
   * Query STUN server with retries
   */
  private async queryStunServer(
    server: string,
    socket: dgram.Socket,
    security: STUNSecurityOptions
  ): Promise<{ address: string; port: number }> {
    const url = new URL(server);
    const host = url.hostname;
    const stunPort = parseInt(url.port) || 3478;

    const { request, transactionId } = this.createBindingRequest();

    return new Promise<{ address: string; port: number }>((resolve, reject) => {
      let retries = 0;
      let timeout: NodeJS.Timeout;

      const retry = () => {
        if (retries >= STUN_CONSTANTS.MAX_RETRANSMISSIONS) {
          cleanup();
          reject(new Error(`STUN request failed after ${retries} retries`));
          return;
        }

        retries++;
        socket.send(request, stunPort, host);
        timeout = setTimeout(retry, STUN_CONSTANTS.RETRANSMISSION_TIMEOUT * Math.pow(2, retries));
      };

      const cleanup = () => {
        clearTimeout(timeout);
        socket.removeListener('message', messageHandler);
        this.activeTransactions.delete(transactionId.toString('hex'));
      };

      const messageHandler = (msg: Buffer, rinfo: dgram.RemoteInfo) => {
        if (!this.validateStunResponse(msg, transactionId, security)) {
          this.emit('security', 'Invalid STUN response received');
          return;
        }

        cleanup();
        resolve({
          address: rinfo.address,
          port: rinfo.port
        });
      };

      socket.on('message', messageHandler);
      socket.send(request, stunPort, host);
      timeout = setTimeout(retry, STUN_CONSTANTS.RETRANSMISSION_TIMEOUT);

      this.activeTransactions.set(transactionId.toString('hex'), {
        timeout,
        resolve: () => {
          cleanup();
          resolve({ address: host, port: stunPort });
        },
        reject: () => {
          cleanup();
          reject(new Error('Transaction cancelled'));
        }
      });
    });
  }

  /**
   * Create secure signaling channel
   */
  private createSignalingChannel(peerId: string, security: STUNSecurityOptions): string {
    const timestamp = Date.now();
    const prefix = security.channelPrefix || 'nat-traversal';
    const channelId = crypto.randomBytes(16).toString('hex');
    return `${prefix}/${peerId}/${timestamp}/${channelId}`;
  }

  /**
   * Connect using STUN and GunJS signaling
   */
  public async connect(options: STUNConnectionOptions): Promise<STUNResult> {
    const {
      peerId,
      gun,
      servers = DEFAULT_STUN_SERVERS,
      localPort = 0,
      timeout = STUN_CONSTANTS.TRANSACTION_TIMEOUT,
      preferredFamily = 'IPv6',
      maxRetries = 3,
      security = {
        validateStunResponse: true,
        validatePeerIdentity: true,
        requireEncryption: false,
        maxPacketSize: 1500,
        allowLoopback: false,
        allowPrivateNetwork: true
      },
      address: targetAddress,
      port: targetPort
    } = options;

    const startTime = Date.now();
    let currentRetry = 0;

    const attemptConnection = async (): Promise<STUNResult> => {
      try {
        debug(`Connecting to peer ${peerId} using STUN and GunJS signaling (attempt ${currentRetry + 1}/${maxRetries})`);
        this.setStatus(STUNStatus.CONNECTING);

        // Validate target endpoint if provided
        if (targetAddress && targetPort) {
          debug(`Target endpoint: ${targetAddress}:${targetPort}`);
          this.validateEndpoint(targetAddress, targetPort, security);
        }

        // Create UDP socket using network-utils instead of directly
        this.socket = await createUDPSocketBound(localPort, {
          enableIPv6: preferredFamily === 'IPv6',
          reuseAddr: true
        });

        // Set up socket error handling
        this.socket.on('error', (err) => {
          debug(`Socket error: ${err.message}`);
          this.emit('error', err);
        });

        // Bind socket
        await new Promise<void>((resolve, reject) => {
          this.socket!.once('error', reject);
          this.socket!.bind({
            port: localPort,
            exclusive: true
          }, () => {
            this.socket!.removeListener('error', reject);
            resolve();
          });
        });

        const localAddress = this.socket.address() as net.AddressInfo;
        debug(`Local address: ${localAddress.address}:${localAddress.port}`);

        this.setStatus(STUNStatus.DISCOVERING);

        // Query STUN servers
        const stunPromises = servers.map(server => 
          this.queryStunServer(server, this.socket!, security)
        );

        // Get external address from STUN
        const stunResults = await Promise.race(stunPromises);
        const { address: externalAddress, port: externalPort } = stunResults;

        debug(`External address from STUN: ${externalAddress}:${externalPort}`);

        this.setStatus(STUNStatus.SIGNALING);

        // Create secure signaling channel
        const channel = this.createSignalingChannel(peerId, security);

        // Exchange connection info through GunJS
        const connectionInfo = {
          type: 'offer',
          from: peerId,
          address: externalAddress,
          port: externalPort,
          localAddress: localAddress.address,
          localPort: localAddress.port,
          family: preferredFamily,
          targetAddress,
          targetPort,
          timestamp: Date.now(),
          encrypted: security.requireEncryption
        };

        if (security.requireEncryption) {
          // Add encryption in a future update
          this.emit('security', 'Encryption not yet implemented');
        }

        gun.get(channel).put(connectionInfo);

        // Wait for peer's connection info
        const peerInfo = await new Promise<any>((resolve, reject) => {
          const signalTimeout = setTimeout(() => {
            reject(new Error('Signaling timeout'));
          }, timeout);

          gun.get(channel).on((data) => {
            if (data && data.type === 'answer' && data.from === peerId) {
              if (security.validatePeerIdentity && data.from !== peerId) {
                this.emit('security', 'Invalid peer identity in response');
                return;
              }
              clearTimeout(signalTimeout);
              resolve(data);
            }
          });
        });

        debug(`Received peer info: ${JSON.stringify(peerInfo)}`);

        // Use target address/port if provided, otherwise use peer info
        const remoteAddress = targetAddress || peerInfo.address;
        const remotePort = targetPort || peerInfo.port;

        // Validate remote endpoint
        this.validateEndpoint(remoteAddress, remotePort, security);

        this.emit('connecting', remoteAddress, remotePort);

        // Try to establish connection
        const testPacket = crypto.randomBytes(16); // Use random data instead of fixed string
        
        const success = await new Promise<boolean>((resolve) => {
          const connectTimeout = setTimeout(() => {
            resolve(false);
          }, STUN_CONSTANTS.TEST_PACKET_TIMEOUT);

          const messageHandler = (msg: Buffer) => {
            if (msg.length > security.maxPacketSize!) {
              this.emit('security', 'Received packet exceeds size limit');
              return;
            }

            if (msg.equals(testPacket)) {
              clearTimeout(connectTimeout);
              this.socket!.removeListener('message', messageHandler);
              resolve(true);
            }
          };

          this.socket!.on('message', messageHandler);

          // Send test packets to both external and local addresses
          this.socket!.send(testPacket, remotePort, remoteAddress);
          if (security.allowPrivateNetwork && peerInfo.localAddress && peerInfo.localPort) {
            this.socket!.send(testPacket, peerInfo.localPort, peerInfo.localAddress);
          }
        });

        if (!success) {
          throw new Error('Could not establish connection');
        }

        const result: STUNResult = {
          success: true,
          socket: this.socket,
          remoteAddress,
          remotePort,
          localAddress: localAddress.address,
          localPort: localAddress.port,
          externalAddress,
          externalPort,
          status: this.status,
          details: {
            rtt: Date.now() - startTime,
            protocol: 'UDP',
            secure: security.requireEncryption,
            retries: currentRetry,
            stunServer: servers[0]
          }
        };

        this.setStatus(STUNStatus.CONNECTED);
        this.emit('connected', result);
        return result;

      } catch (err) {
        const error = err as Error;
        debug(`STUN connection failed: ${error.message}`);

        if (currentRetry < maxRetries - 1) {
          currentRetry++;
          this.setStatus(STUNStatus.RETRYING);
          this.emit('retry', currentRetry, maxRetries);
          await new Promise(resolve => setTimeout(resolve, 1000 * currentRetry));
          return attemptConnection();
        }

        this.setStatus(STUNStatus.FAILED);
        this.emit('error', error);
        this.close();
        return {
          success: false,
          error: error.message,
          status: this.status,
          details: {
            retries: currentRetry
          }
        };
      }
    };

    return attemptConnection();
  }

  /**
   * Close the STUN client
   */
  public close(): void {
    // Cancel any active transactions
    for (const transaction of this.activeTransactions.values()) {
      clearTimeout(transaction.timeout);
      transaction.reject();
    }
    this.activeTransactions.clear();

    if (this.socket) {
      try {
        this.socket.close();
      } catch (err) {
        debug(`Error closing socket: ${(err as Error).message}`);
      }
      this.socket = null;
    }
    this.setStatus(STUNStatus.CLOSED);
    this.emit('close');
  }

  /**
   * Add event listener
   */
  public on<K extends keyof STUNEvents>(event: K, listener: STUNEvents[K]): this {
    return super.on(event, listener);
  }

  /**
   * Remove event listener
   */
  public off<K extends keyof STUNEvents>(event: K, listener: STUNEvents[K]): this {
    return super.off(event, listener);
  }
} 
import Gun from "gun";
import "gun/lib/webrtc.js";
import { HostCapabilities } from "../interfaces";

// Import Logger from dig-node if available, otherwise define a minimal interface
interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export interface GunRegistryOptions {
  peers?: string[];
  namespace?: string;
  logger?: Logger;
  /**
   * WebRTC configuration for peer-to-peer connections
   * When enabled, mesh networking is automatic
   */
  webrtc?: {
    iceServers?: Array<{ urls: string | string[] }>;
  };
}

interface GunInstance {
  get: (key: string) => GunChain;
}

interface GunChain {
  get: (key: string) => GunChain;
  put: (data: Record<string, unknown> | null) => void;
  once: (callback: (data: Record<string, unknown>) => void) => void;
  on: (callback: (data: Record<string, unknown>) => void) => void;
}

export class GunRegistry {
  private gun: GunInstance | null = null;
  private options: GunRegistryOptions;
  private isGunAvailable: boolean = false;
  private logger: Logger;

  constructor(options: GunRegistryOptions = {}) {
    this.options = {
      peers: options.peers || ["http://nostalgiagame.go.ro:30878/gun"],
      namespace: options.namespace || "dig-nat-tools",
      webrtc: options.webrtc || {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ]
      }
    };

    // Create a default logger that only shows warnings and errors if none provided
    this.logger = options.logger || {
      debug: (): void => {}, // Silent for debug when no logger provided
      info: (): void => {}, // Silent for info when no logger provided  
      warn: (message: string, ...args: unknown[]): void => console.warn(message, ...args),
      error: (message: string, ...args: unknown[]): void => console.error(message, ...args)
    };

    this.initializeGun();
  }

  private initializeGun(): void {
    try {
      this.gun = Gun({
        peers: this.options.peers,
        rtc: this.options.webrtc || {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
          ]
        },
        file: undefined,
        localStorage: false,
        radisk: false,
        axe: false,
      });
      this.isGunAvailable = true;
      this.logger.debug("Gun.js registry initialized with WebRTC and mesh networking");
      this.logger.debug(`🔧 WebRTC enabled with ${this.options.webrtc?.iceServers?.length || 0} ICE servers`);
      this.logger.debug(`🔧 Mesh networking: enabled (automatic with WebRTC)`);
    } catch {
      this.logger.warn("Gun.js not available, peer discovery will not work");
      this.isGunAvailable = false;
    }
  }

  public isAvailable(): boolean {
    return this.isGunAvailable;
  }

  public async register(capabilities: HostCapabilities): Promise<void> {
    if (!this.isGunAvailable || !this.gun) {
      throw new Error("Gun.js registry not available");
    }

    if (!capabilities.storeId) {
      throw new Error("StoreId is required for registration");
    }

    this.logger.debug(`🔧 [GunRegistry] Starting registration for host: ${capabilities.storeId}`);
    this.logger.debug(`🔧 [GunRegistry] Using namespace: ${this.options.namespace}`);
    this.logger.debug(`🔧 [GunRegistry] Peers configured: ${JSON.stringify(this.options.peers)}`);

    // Create a flattened structure that Gun.js can handle
    const flatEntry = {
      storeId: capabilities.storeId,
      lastSeen: Date.now(),
      directHttp_available: capabilities.directHttp?.available || false,
      directHttp_ip: capabilities.directHttp?.ip || "",
      directHttp_port: capabilities.directHttp?.port || 0,
      webTorrent_available: capabilities.webTorrent?.available || false,
      webTorrent_magnetUris: capabilities.webTorrent?.magnetUris ? JSON.stringify(capabilities.webTorrent.magnetUris) : "[]",
    };

    this.logger.debug(`🔧 [GunRegistry] Registration data:`, JSON.stringify(flatEntry, null, 2));

    try {
      const hostRef = this.gun
        .get(this.options.namespace!)
        .get(capabilities.storeId);

      // Store in Gun.js
      hostRef.put(flatEntry);

      this.logger.debug(`✅ [GunRegistry] Successfully registered host ${capabilities.storeId} in Gun.js registry`);
      
    } catch (error) {
      this.logger.error(`❌ [GunRegistry] Registration failed for ${capabilities.storeId}:`, error);
      throw error;
    }
  }

  public async findPeer(storeId: string): Promise<HostCapabilities | null> {
    if (!this.isGunAvailable || !this.gun) {
      throw new Error("Gun.js registry not available");
    }

    this.logger.debug(`🔍 [GunRegistry] Looking for specific peer: ${storeId}`);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.logger.debug(`⏰ [GunRegistry] Timeout searching for peer ${storeId}`);
        resolve(null);
      }, 10000); // 10 second timeout

      this.gun!.get(this.options.namespace!)
        .get(storeId)
        .once((data: Record<string, unknown>) => {
          clearTimeout(timeout);
          this.logger.debug(`📊 [GunRegistry] Peer ${storeId} data:`, data);
          
          if (data && data.storeId === storeId) {
            // Filter out stale entries (older than 5 minutes)
            const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
            const lastSeen = data.lastSeen as number;
            
            this.logger.debug(`🕒 [GunRegistry] Peer ${storeId} last seen: ${lastSeen ? new Date(lastSeen).toLocaleString() : 'never'}`);
            
            if (lastSeen && lastSeen > fiveMinutesAgo) {
              this.logger.debug(`✅ [GunRegistry] Peer ${storeId} is fresh`);
              
              // Reconstruct the capabilities object
              const capabilities: HostCapabilities = {
                storeId: data.storeId as string,
                directHttp: data.directHttp_available ? {
                  available: data.directHttp_available as boolean,
                  ip: data.directHttp_ip as string,
                  port: data.directHttp_port as number
                } : undefined,
                webTorrent: data.webTorrent_available ? {
                  available: data.webTorrent_available as boolean,
                  magnetUris: data.webTorrent_magnetUris ? 
                    JSON.parse(data.webTorrent_magnetUris as string) : []
                } : undefined,
                // Legacy fields for backward compatibility
                externalIp: data.externalIp as string,
                port: data.port as number,
                lastSeen: lastSeen
              };
              
              resolve(capabilities);
            } else {
              this.logger.debug(`⏰ [GunRegistry] Peer ${storeId} is stale`);
              resolve(null);
            }
          } else {
            this.logger.debug(`❌ [GunRegistry] Peer ${storeId} not found or invalid data`);
            resolve(null);
          }
        });
    });
  }

  public async findAvailablePeers(): Promise<HostCapabilities[]> {
    if (!this.isGunAvailable || !this.gun) {
      throw new Error("Gun.js registry not available");
    }

    this.logger.debug(`🔍 [GunRegistry] Searching for peers in namespace: ${this.options.namespace}`);
    this.logger.debug(`🔍 [GunRegistry] Connected to peers: ${JSON.stringify(this.options.peers)}`);

    return new Promise((resolve) => {
      const peers: HostCapabilities[] = [];
      const timeout = setTimeout(() => {
        this.logger.debug(`⏰ [GunRegistry] Search timeout reached, found ${peers.length} peers`);
        resolve(peers);
      }, 30000); // Increase timeout to 10 seconds

      this.gun!.get(this.options.namespace!)
        .once(async (data: Record<string, unknown>) => {
          this.logger.debug(`📊 [GunRegistry] Raw hosts data received:`, data);

          if (data) {
            const allKeys = Object.keys(data);
            this.logger.debug(`🔑 [GunRegistry] All keys in hosts data:`, allKeys);
            
            const hostKeys = allKeys.filter(key => key !== "_");
            this.logger.debug(`🏠 [GunRegistry] Host keys (excluding Gun.js metadata):`, hostKeys);

            // Process each host key by fetching the actual data
            let processedHosts = 0;
            const totalHosts = hostKeys.length;

            if (totalHosts === 0) {
              this.logger.debug(`❌ [GunRegistry] No hosts found in namespace ${this.options.namespace}`);
              clearTimeout(timeout);
              resolve(peers);
              return;
            }

            for (const hostKey of hostKeys) {
              this.logger.debug(`🔍 [GunRegistry] Fetching detailed data for host: ${hostKey}`);
              
              // Fetch the actual host data by following the reference
              this.gun!.get(this.options.namespace!)
                .get(hostKey)
                .once((hostData: Record<string, unknown>) => {
                  processedHosts++;
                  this.logger.debug(`📊 [GunRegistry] Host ${hostKey} detailed data:`, hostData);
                  
                  if (hostData && hostData.storeId && typeof hostData.storeId === 'string') {
                    // Filter out stale entries (older than 5 minutes)
                    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
                    const lastSeen = hostData.lastSeen as number;
                    
                    this.logger.debug(`🕒 [GunRegistry] Host ${hostKey} last seen: ${lastSeen ? new Date(lastSeen).toLocaleString() : 'never'}`);
                    this.logger.debug(`🕒 [GunRegistry] Five minutes ago: ${new Date(fiveMinutesAgo).toLocaleString()}`);
                    
                    if (lastSeen && lastSeen > fiveMinutesAgo) {
                      this.logger.debug(`✅ [GunRegistry] Host ${hostKey} is fresh, adding to results`);
                      
                      // Reconstruct the capabilities object
                      const capabilities: HostCapabilities = {
                        storeId: hostData.storeId as string,
                        directHttp: hostData.directHttp_available ? {
                          available: hostData.directHttp_available as boolean,
                          ip: hostData.directHttp_ip as string,
                          port: hostData.directHttp_port as number
                        } : undefined,
                        webTorrent: hostData.webTorrent_available ? {
                          available: hostData.webTorrent_available as boolean,
                          magnetUris: hostData.webTorrent_magnetUris ? 
                            JSON.parse(hostData.webTorrent_magnetUris as string) : []
                        } : undefined,
                        // Legacy fields for backward compatibility
                        externalIp: hostData.externalIp as string,
                        port: hostData.port as number,
                        lastSeen: lastSeen
                      };
                      
                      peers.push(capabilities);
                      this.logger.debug(`✅ [GunRegistry] Added peer: ${capabilities.storeId}`);
                    } else {
                      this.logger.debug(`⏰ [GunRegistry] Host ${hostKey} is stale, skipping`);
                    }
                  } else {
                    this.logger.debug(`❌ [GunRegistry] Host ${hostKey} has invalid data structure:`, {
                      hasData: !!hostData,
                      hasStoreId: !!(hostData && hostData.storeId),
                      storeIdType: hostData && hostData.storeId ? typeof hostData.storeId : 'undefined'
                    });
                  }

                  // Check if we've processed all hosts
                  if (processedHosts >= totalHosts) {
                    clearTimeout(timeout);
                    this.logger.debug(`📋 [GunRegistry] Final peer list: ${peers.length} peers found`);
                    peers.forEach((peer, index) => {
                      this.logger.debug(`   ${index + 1}. ${peer.storeId} - HTTP: ${peer.directHttp?.available || false}, WebTorrent: ${peer.webTorrent?.available || false}`);
                    });
                    resolve(peers);
                  }
                });
            }
          } else {
            this.logger.debug(`❌ [GunRegistry] No hosts data found in namespace ${this.options.namespace}`);
            clearTimeout(timeout);
            resolve(peers);
          }
        });
    });
  }

  /**
   * Unregister a host from the Gun.js registry
   */
  public async unregister(storeId: string): Promise<void> {
    if (!this.isGunAvailable || !this.gun) {
      throw new Error("Gun.js registry not available");
    }

    if (!storeId) {
      throw new Error("StoreId is required for unregistration");
    }

    try {
      const hostRef = this.gun
        .get(this.options.namespace!)
        .get(storeId);

      // Clear all host data by setting to null
      hostRef.put(null);
      
      this.logger.debug(`✅ [GunRegistry] Successfully unregistered host: ${storeId}`);
    } catch (error) {
      this.logger.error(`❌ [GunRegistry] Failed to unregister host ${storeId}:`, error);
      throw error;
    }
  }
}

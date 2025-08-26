import Gun from "gun";
import { HostCapabilities } from "../interfaces";

export interface GunRegistryOptions {
  peers?: string[];
  namespace?: string;
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

  constructor(options: GunRegistryOptions = {}) {
    this.options = {
      peers: options.peers || ["http://nostalgiagame.go.ro:30876/gun"],
      namespace: options.namespace || "dig-nat-tools",
    };

    this.initializeGun();
  }

  private initializeGun(): void {
    try {
      this.gun = Gun(this.options.peers);
      this.isGunAvailable = true;
      console.log("Gun.js registry initialized");
    } catch {
      console.warn("Gun.js not available, peer discovery will not work");
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

    console.log(`🔧 [GunRegistry] Starting registration for host: ${capabilities.storeId}`);
    console.log(`🔧 [GunRegistry] Using namespace: ${this.options.namespace}`);
    console.log(`🔧 [GunRegistry] Peers configured: ${JSON.stringify(this.options.peers)}`);

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

    console.log(`🔧 [GunRegistry] Registration data:`, JSON.stringify(flatEntry, null, 2));

    try {
      // Store in Gun.js
      this.gun
        .get(this.options.namespace!)
        .get("hosts")
        .get(capabilities.storeId)
        .put(flatEntry);

      console.log(`✅ [GunRegistry] Successfully registered host ${capabilities.storeId} in Gun.js registry`);
      
      // Add a verification step
      setTimeout(() => {
        console.log(`🔍 [GunRegistry] Verifying registration for ${capabilities.storeId}...`);
        this.gun!.get(this.options.namespace!)
          .get("hosts")
          .get(capabilities.storeId)
          .once((data: Record<string, unknown>) => {
            if (data && data.storeId) {
              console.log(`✅ [GunRegistry] Registration verified for ${capabilities.storeId}`);
            } else {
              console.log(`❌ [GunRegistry] Registration verification failed for ${capabilities.storeId}`);
            }
          });
      }, 1000);
      
    } catch (error) {
      console.error(`❌ [GunRegistry] Registration failed for ${capabilities.storeId}:`, error);
      throw error;
    }
  }

  public async findPeer(storeId: string): Promise<HostCapabilities | null> {
    if (!this.isGunAvailable || !this.gun) {
      throw new Error("Gun.js registry not available");
    }

    console.log(`🔍 [GunRegistry] Looking for specific peer: ${storeId}`);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log(`⏰ [GunRegistry] Timeout searching for peer ${storeId}`);
        resolve(null);
      }, 10000); // 10 second timeout

      this.gun!.get(this.options.namespace!)
        .get("hosts")
        .get(storeId)
        .once((data: Record<string, unknown>) => {
          clearTimeout(timeout);
          console.log(`📊 [GunRegistry] Peer ${storeId} data:`, data);
          
          if (data && data.storeId === storeId) {
            // Filter out stale entries (older than 5 minutes)
            const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
            const lastSeen = data.lastSeen as number;
            
            console.log(`🕒 [GunRegistry] Peer ${storeId} last seen: ${lastSeen ? new Date(lastSeen).toLocaleString() : 'never'}`);
            
            if (lastSeen && lastSeen > fiveMinutesAgo) {
              console.log(`✅ [GunRegistry] Peer ${storeId} is fresh`);
              
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
              console.log(`⏰ [GunRegistry] Peer ${storeId} is stale`);
              resolve(null);
            }
          } else {
            console.log(`❌ [GunRegistry] Peer ${storeId} not found or invalid data`);
            resolve(null);
          }
        });
    });
  }

  public async findAvailablePeers(): Promise<HostCapabilities[]> {
    if (!this.isGunAvailable || !this.gun) {
      throw new Error("Gun.js registry not available");
    }

    console.log(`🔍 [GunRegistry] Searching for peers in namespace: ${this.options.namespace}`);
    console.log(`🔍 [GunRegistry] Connected to peers: ${JSON.stringify(this.options.peers)}`);

    return new Promise((resolve) => {
      const peers: HostCapabilities[] = [];
      const timeout = setTimeout(() => {
        console.log(`⏰ [GunRegistry] Search timeout reached, found ${peers.length} peers`);
        resolve(peers);
      }, 10000); // Increase timeout to 10 seconds

      this.gun!.get(this.options.namespace!)
        .get("hosts")
        .once(async (data: Record<string, unknown>) => {
          console.log(`📊 [GunRegistry] Raw hosts data received:`, data);

          if (data) {
            const allKeys = Object.keys(data);
            console.log(`🔑 [GunRegistry] All keys in hosts data:`, allKeys);
            
            const hostKeys = allKeys.filter(key => key !== "_");
            console.log(`🏠 [GunRegistry] Host keys (excluding Gun.js metadata):`, hostKeys);

            // Process each host key by fetching the actual data
            let processedHosts = 0;
            const totalHosts = hostKeys.length;

            if (totalHosts === 0) {
              console.log(`❌ [GunRegistry] No hosts found in namespace ${this.options.namespace}`);
              clearTimeout(timeout);
              resolve(peers);
              return;
            }

            for (const hostKey of hostKeys) {
              console.log(`🔍 [GunRegistry] Fetching detailed data for host: ${hostKey}`);
              
              // Fetch the actual host data by following the reference
              this.gun!.get(this.options.namespace!)
                .get("hosts")
                .get(hostKey)
                .once((hostData: Record<string, unknown>) => {
                  processedHosts++;
                  console.log(`� [GunRegistry] Host ${hostKey} detailed data:`, hostData);
                  
                  if (hostData && hostData.storeId && typeof hostData.storeId === 'string') {
                    // Filter out stale entries (older than 5 minutes)
                    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
                    const lastSeen = hostData.lastSeen as number;
                    
                    console.log(`🕒 [GunRegistry] Host ${hostKey} last seen: ${lastSeen ? new Date(lastSeen).toLocaleString() : 'never'}`);
                    console.log(`🕒 [GunRegistry] Five minutes ago: ${new Date(fiveMinutesAgo).toLocaleString()}`);
                    
                    if (lastSeen && lastSeen > fiveMinutesAgo) {
                      console.log(`✅ [GunRegistry] Host ${hostKey} is fresh, adding to results`);
                      
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
                      console.log(`✅ [GunRegistry] Added peer: ${capabilities.storeId}`);
                    } else {
                      console.log(`⏰ [GunRegistry] Host ${hostKey} is stale, skipping`);
                    }
                  } else {
                    console.log(`❌ [GunRegistry] Host ${hostKey} has invalid data structure:`, {
                      hasData: !!hostData,
                      hasStoreId: !!(hostData && hostData.storeId),
                      storeIdType: hostData && hostData.storeId ? typeof hostData.storeId : 'undefined'
                    });
                  }

                  // Check if we've processed all hosts
                  if (processedHosts >= totalHosts) {
                    clearTimeout(timeout);
                    console.log(`📋 [GunRegistry] Final peer list: ${peers.length} peers found`);
                    peers.forEach((peer, index) => {
                      console.log(`   ${index + 1}. ${peer.storeId} - HTTP: ${peer.directHttp?.available || false}, WebTorrent: ${peer.webTorrent?.available || false}`);
                    });
                    resolve(peers);
                  }
                });
            }
          } else {
            console.log(`❌ [GunRegistry] No hosts data found in namespace ${this.options.namespace}`);
            clearTimeout(timeout);
            resolve(peers);
          }
        });
    });
  }

  public async sendSignalingMessage(
    targetPeer: string,
    message: Record<string, unknown>
  ): Promise<void> {
    if (!this.isGunAvailable || !this.gun) {
      throw new Error("Gun.js registry not available");
    }

    const messageWithTimestamp = {
      ...message,
      timestamp: Date.now(),
    };

    this.gun
      .get(this.options.namespace!)
      .get("signaling")
      .get(targetPeer)
      .put(messageWithTimestamp);
  }

  public onSignalingMessage(
    storeId: string,
    callback: (message: Record<string, unknown>) => void
  ): void {
    if (!this.isGunAvailable || !this.gun) {
      console.warn("Gun.js not available, signaling will not work");
      return;
    }

    this.gun
      .get(this.options.namespace!)
      .get("signaling")
      .get(storeId)
      .on((data: Record<string, unknown>) => {
        if (data && data.timestamp) {
          callback(data);
        }
      });
  }

  public async unregister(storeId: string): Promise<void> {
    if (!this.isGunAvailable || !this.gun) {
      throw new Error("Gun.js registry not available");
    }

    // Remove from registry
    this.gun.get(this.options.namespace!).get("hosts").get(storeId).put(null);

    console.log(`Unregistered host ${storeId}`);
  }
}

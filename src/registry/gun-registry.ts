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
      peers: options.peers || ["http://localhost:8765/gun"],
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

    // Create a flattened structure that Gun.js can handle
    const flatEntry = {
      storeId: capabilities.storeId,
      lastSeen: Date.now(),
      externalIp: capabilities.externalIp || "localhost",
      port: capabilities.port || 0,
      upnp_available: capabilities.upnp?.available || false,
      webrtc_available: capabilities.webrtc?.available || false,
    };

    // Store in Gun.js
    this.gun
      .get(this.options.namespace!)
      .get("hosts")
      .get(capabilities.storeId)
      .put(flatEntry);

    console.log(`Registered host ${capabilities.storeId} in Gun.js registry`);
  }

  public async findPeer(storeId: string): Promise<HostCapabilities | null> {
    if (!this.isGunAvailable || !this.gun) {
      throw new Error("Gun.js registry not available");
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(null);
      }, 10000); // 10 second timeout

      this.gun!.get(this.options.namespace!)
        .get("hosts")
        .get(storeId)
        .once((data: Record<string, unknown>) => {
          clearTimeout(timeout);
          if (data && data.storeId === storeId) {
            resolve(data as HostCapabilities);
          } else {
            resolve(null);
          }
        });
    });
  }

  public async findAvailablePeers(): Promise<HostCapabilities[]> {
    if (!this.isGunAvailable || !this.gun) {
      throw new Error("Gun.js registry not available");
    }

    return new Promise((resolve) => {
      const peers: HostCapabilities[] = [];
      const timeout = setTimeout(() => {
        resolve(peers);
      }, 5000); // 5 second timeout

      this.gun!.get(this.options.namespace!)
        .get("hosts")
        .once((data: Record<string, unknown>) => {
          clearTimeout(timeout);

          if (data) {
            Object.keys(data).forEach((key) => {
              if (
                key !== "_" &&
                data[key] &&
                (data[key] as Record<string, unknown>).storeId
              ) {
                // Filter out stale entries (older than 5 minutes)
                const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
                const peerData = data[key] as Record<string, unknown>;
                if (
                  peerData.lastSeen &&
                  (peerData.lastSeen as number) > fiveMinutesAgo
                ) {
                  peers.push(peerData as HostCapabilities);
                }
              }
            });
          }

          resolve(peers);
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
      return;
    }

    // Remove from registry
    this.gun.get(this.options.namespace!).get("hosts").get(storeId).put(null);

    console.log(`Unregistered host ${storeId}`);
  }
}

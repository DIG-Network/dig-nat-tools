/**
 * Common Gun.js type definitions
 */

/**
 * Gun instance interface
 */
export interface GunInstance {
  get(key: string): GunChain<unknown>;
}

/**
 * Gun chain interface for method chaining
 */
export interface GunChain<T> {
  get(key: string): GunChain<T>;
  put(data: T): void;
  set(data: T): void;
  map<U = T>(): GunChain<U>;
  on(callback: (data: T | null, key: string) => void): void;
  once(callback: (data: T | null, key: string) => void): void;
  off(): void;
} 
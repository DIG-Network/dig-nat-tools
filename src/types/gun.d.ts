/**
 * Type definitions for Gun.js
 */

/**
 * Gun chain interface
 */
export interface GunChain {
  get(key: string): GunChain;
  put(data: unknown): GunChain;
  on(callback: (data: unknown, key: string) => void): GunChain;
  once(callback: (data: unknown, key: string) => void): GunChain;
  set(data: unknown): GunChain;
  map(): GunChain;
  path(path: string): GunChain;
  back(): GunChain;
  off(): void;
}

/**
 * Gun instance interface
 */
export interface GunInstance extends GunChain {
  opt(options: Record<string, unknown>): GunInstance;
  user(): GunInstance;
}

declare module 'gun' {
  interface GunOptions {
    peers?: string[];
    [key: string]: any;
  }

  interface GunChain<T = any> {
    get(key: string): GunChain;
    put(data: any): GunChain;
    on(callback: (data: T, key: string) => void): GunChain;
    once(callback: (data: T, key: string) => void): GunChain;
    map(callback?: (data: T, key: string) => any): GunChain;
    set(data: any): GunChain;
  }

  function Gun(options?: GunOptions): GunChain;

  namespace Gun {}

  export = Gun;
} 
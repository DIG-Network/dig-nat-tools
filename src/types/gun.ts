import { EventEmitter } from 'events';

/**
 * Gun chain interface
 */
export interface GunChain<T = any> {
  get(key: string): GunChain<T>;
  put(data: T | null): GunChain<T>;
  on(callback: (data: T, key: string) => void): GunChain<T>;
  once(callback: (data: T, key: string) => void): GunChain<T>;
  map<U = T>(callback?: (data: T, key: string) => U): GunChain<U>;
  set(data: T): GunChain<T>;
  off(): void;
}

/**
 * Gun instance interface
 */
export interface GunInstance extends EventEmitter {
  get(key: string): GunChain;
  put(data: any): GunChain;
  set(data: any): GunChain;
  on(event: string, callback: Function): GunChain;
  once(event: string, callback: Function): GunChain;
  map<T = any>(callback?: (data: T, key: string) => T): GunChain<T>;
  off(): void;
} 
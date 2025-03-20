/**
 * Type declarations for the lru-cache module
 */

declare module 'lru-cache' {
  export interface LRUCacheOptions<K = any, V = any> {
    /**
     * The maximum number of items to store in the cache
     */
    max?: number;
    
    /**
     * Maximum time in milliseconds for items to live in cache
     */
    ttl?: number;
    
    /**
     * Update the age of items when they are retrieved
     */
    updateAgeOnGet?: boolean;
    
    /**
     * Function to calculate size of items for maxSize
     */
    sizeCalculation?: (value: V, key: K) => number;
    
    /**
     * Maximum size of cache in bytes/units
     */
    maxSize?: number;
    
    /**
     * Allow fetching stale items
     */
    allowStale?: boolean;
    
    /**
     * Function to call when items are evicted
     */
    dispose?: (value: V, key: K) => void;
  }

  export default class LRUCache<K = any, V = any> {
    constructor(options?: LRUCacheOptions<K, V>);
    
    /**
     * Set a value in the cache
     */
    set(key: K, value: V): void;
    
    /**
     * Get a value from the cache
     */
    get(key: K): V | undefined;
    
    /**
     * Check if a key exists in the cache
     */
    has(key: K): boolean;
    
    /**
     * Delete an item from the cache
     */
    delete(key: K): boolean;
    
    /**
     * Clear all items from the cache
     */
    clear(): void;
    
    /**
     * Reset the TTL of an item
     */
    touch(key: K): boolean;
    
    /**
     * Return the keys in the cache
     */
    keys(): Iterable<K>;
    
    /**
     * Return the values in the cache
     */
    values(): Iterable<V>;
    
    /**
     * Return the entries in the cache
     */
    entries(): Iterable<[K, V]>;
    
    /**
     * Size of the cache
     */
    size: number;
  }
} 
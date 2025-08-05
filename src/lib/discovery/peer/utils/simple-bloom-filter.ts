/**
 * SimpleBloomFilter implementation
 * 
 * A lightweight Bloom filter implementation that doesn't require external dependencies.
 * Used for efficient set membership testing with a controllable false-positive rate.
 */

/**
 * Simple Bloom filter implementation with configurable false positive rate
 */
export class SimpleBloomFilter {
  private bits: Uint8Array;
  private hashFunctions: number;
  private size: number;

  /**
   * Create a new SimpleBloomFilter
   * 
   * @param capacity - Expected number of elements to store
   * @param falsePositiveRate - Desired false positive rate (0-1)
   */
  constructor(capacity: number, falsePositiveRate: number) {
    // Calculate optimal size and hash functions based on desired false positive rate
    const bitsPerElement = Math.ceil(-(Math.log(falsePositiveRate) / Math.log(2)) / Math.log(2));
    this.size = Math.ceil(capacity * bitsPerElement);
    this.hashFunctions = Math.max(1, Math.ceil(bitsPerElement * Math.log(2)));
    this.bits = new Uint8Array(Math.ceil(this.size / 8));
  }

  /**
   * Generate a hash for the value with the given seed
   * 
   * @param value - String value to hash
   * @param seed - Seed for the hash function
   * @returns A hash value
   * @private
   */
  private hash(value: string, seed: number): number {
    let h = seed;
    for (let i = 0; i < value.length; i++) {
      h = ((h << 5) + h) ^ value.charCodeAt(i);
    }
    return Math.abs(h % this.size);
  }

  /**
   * Add a value to the filter
   * 
   * @param value - String value to add
   */
  public add(value: string): void {
    for (let i = 0; i < this.hashFunctions; i++) {
      const position = this.hash(value, i);
      const byteIndex = Math.floor(position / 8);
      const bitIndex = position % 8;
      this.bits[byteIndex] |= (1 << bitIndex);
    }
  }

  /**
   * Check if a value might be in the filter
   * 
   * @param value - String value to check
   * @returns True if the value might be in the filter, false if it's definitely not
   */
  public has(value: string): boolean {
    for (let i = 0; i < this.hashFunctions; i++) {
      const position = this.hash(value, i);
      const byteIndex = Math.floor(position / 8);
      const bitIndex = position % 8;
      if ((this.bits[byteIndex] & (1 << bitIndex)) === 0) {
        return false;
      }
    }
    return true;
  }
}

export default SimpleBloomFilter; 
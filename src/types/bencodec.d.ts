declare module 'bencodec' {
  interface BencodecOptions {
    stringify?: boolean;
  }

  interface Bencodec {
    /**
     * Decode bencoded data
     * @param data The data to decode
     * @param options Decoding options
     */
    decode(data: Buffer | string, options?: BencodecOptions): any;

    /**
     * Encode data to bencode format
     * @param data The data to encode
     * @param options Encoding options
     */
    encode(data: any, options?: BencodecOptions): Buffer;
  }

  const bencodec: Bencodec;
  export default bencodec;
} 
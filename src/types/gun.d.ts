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
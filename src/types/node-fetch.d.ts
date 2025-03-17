/**
 * Type declarations for node-fetch
 * This is a simplified version for our use case
 */

declare module 'node-fetch' {
  export interface RequestInit {
    method?: string;
    headers?: Record<string, string> | Headers;
    body?: any;
    signal?: AbortSignal;
  }

  export interface Response {
    ok: boolean;
    status: number;
    statusText: string;
    headers: Headers;
    text(): Promise<string>;
    json<T>(): Promise<T>;
    arrayBuffer(): Promise<ArrayBuffer>;
    blob(): Promise<Blob>;
  }

  export class Headers {
    constructor(init?: Record<string, string> | Headers);
    append(name: string, value: string): void;
    delete(name: string): void;
    get(name: string): string | null;
    has(name: string): boolean;
    set(name: string, value: string): void;
    forEach(callback: (value: string, name: string) => void): void;
  }

  export default function fetch(url: string | Request, init?: RequestInit): Promise<Response>;
} 
declare module 'strong-soap' {
  import * as http from 'http';
  import * as https from 'https';

  export interface IOptions {
    url: string;
    endpoint?: string;
    wsdl?: string;
    httpClient?: typeof http | typeof https;
    [key: string]: any;
  }

  export interface Client {
    [method: string]: (args: Record<string, any>, callback: (error: Error | null, result: any) => void) => void;
  }

  export interface ClientCreator {
    create(options: IOptions, callback: (error: Error | null, client: Client) => void): void;
  }

  export const soap: {
    Client: ClientCreator;
  };
} 
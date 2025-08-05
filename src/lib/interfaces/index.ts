/**
 * Interfaces Layer - Core interfaces for the Dig NAT Tools library
 * 
 * This layer defines standard interfaces that are implemented throughout the library,
 * providing a common contract between different components.
 */

// Export file-related interfaces
export interface FileInfoInterface {
  hash: string;
  size: number;
  chunks: number;
  name?: string;
  contentType?: string;
  available: boolean;
}

// Export network-related interfaces
export interface PeerInterface {
  id: string;
  address?: string;
  port?: number;
  type?: string;
  capabilities?: string[];
  connectTime?: number;
  lastSeen?: number;
}

// Export content-related interfaces
export interface ContentInterface {
  id: string;
  fileHash: string;
  metadata?: Record<string, any>;
  peers?: string[];
  discoveryTime?: number;
  lastVerified?: number;
}

// Export transport-related interfaces
export interface TransportInterface {
  connect(peerId: string): Promise<boolean>;
  disconnect(peerId: string): Promise<void>;
  sendMessage(peerId: string, type: string, data: any): Promise<boolean>;
  addMessageHandler(type: string, handler: (peerId: string, data: any) => void): void;
} 
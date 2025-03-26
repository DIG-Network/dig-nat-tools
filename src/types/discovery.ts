/**
 * Discovery component interfaces
 */

import type { GunInstance } from './gun';
import { EventEmitter } from 'events';
import { PeerContentStatus } from './common';

/**
 * Base interface for discovered peers
 */
export interface DiscoveryPeer {
  id?: string;
  address: string;
  port: number;
  source?: string;
  confidence?: number;
  infoHashes?: string[];
}

/**
 * Discovery events interface
 */
export interface DiscoveryEvents {
  'peer-discovered': [peer: DiscoveryPeer];
  'peer-failed': [peer: DiscoveryPeer, infoHash: string];
  'peer-added': [peer: DiscoveryPeer, infoHash: string];
  'peer-removed': [peerId: string, infoHash: string];
  'peer-statusChanged': [{
    peerId: string;
    infoHash: string;
    previousStatus: PeerContentStatus;
    status: PeerContentStatus;
  }];
  'content:announced': [infoHash: string];
  'content:removed': [infoHash: string];
  'verification:needed': [peerId: string, infoHash: string];
}

/**
 * Base interface for discovery components
 */
export interface DiscoveryComponent extends Pick<EventEmitter, 'emit'> {
  start(): Promise<void>;
  stop(): Promise<void>;
  findPeers(infoHash: string): Promise<DiscoveryPeer[]>;
  on<E extends keyof DiscoveryEvents>(event: E, listener: (...args: DiscoveryEvents[E]) => void): this;
  off<E extends keyof DiscoveryEvents>(event: E, listener: (...args: DiscoveryEvents[E]) => void): this;
}

/**
 * DHT client interface
 */
export interface DHTClient extends DiscoveryComponent {
  addInfoHash(infoHash: string): void;
  removeInfoHash(infoHash: string): void;
  removePeer?(peerId: string, infoHash: string): void;
}

/**
 * PEX manager interface
 */
export interface PEXManager extends DiscoveryComponent {
  addInfoHash(infoHash: string): void;
  removeInfoHash(infoHash: string): void;
  addPeer(peerId: string, infoHash: string): void;
  removePeer(peerId: string, infoHash: string): void;
}

/**
 * Gun discovery interface
 */
export interface GunDiscovery extends DiscoveryComponent {
  gun: GunInstance;
  addInfoHash(infoHash: string, announce?: boolean): void;
  removeInfoHash(infoHash: string): void;
  addContentMapping(contentId: string, infoHash: string): void;
  removeContentMapping(contentId: string): void;
  announce(infoHash: string, peerId: string): void;
}

/**
 * Callback for peer content verification
 */
export type PeerVerificationCallback = (peerId: string, infoHash: string) => Promise<boolean>; 
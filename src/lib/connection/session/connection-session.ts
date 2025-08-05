/**
 * Connection Session Module
 * 
 * Provides types and functionality for connection sessions in the Dig NAT Tools system.
 */

import { CONNECTION_TYPE } from '../../../types/constants';
import type { Connection } from '../../types/connection';

/**
 * Session state tracking class
 */
export class ConnectionSession {
  private connections: Map<string, Connection> = new Map();
  
  /**
   * Register a connection in the session
   * @param id - Connection ID
   * @param connection - Connection object
   */
  public registerConnection(id: string, connection: Connection): void {
    this.connections.set(id, connection);
  }
  
  /**
   * Get a connection by ID
   * @param id - Connection ID
   * @returns Connection object or undefined if not found
   */
  public getConnection(id: string): Connection | undefined {
    return this.connections.get(id);
  }
  
  /**
   * Remove a connection from the session
   * @param id - Connection ID
   */
  public removeConnection(id: string): void {
    const connection = this.connections.get(id);
    if (connection) {
      connection.close();
      this.connections.delete(id);
    }
  }
  
  /**
   * Get all connections
   * @returns Map of all connections
   */
  public getAllConnections(): Map<string, Connection> {
    return this.connections;
  }
  
  /**
   * Get connections by type
   * @param type - Connection type
   * @returns Array of connections matching the specified type
   */
  public getConnectionsByType(type: CONNECTION_TYPE): Connection[] {
    const result: Connection[] = [];
    this.connections.forEach(connection => {
      if (connection.type === type) {
        result.push(connection);
      }
    });
    return result;
  }
  
  /**
   * Close all connections in the session
   */
  public closeAll(): void {
    this.connections.forEach(connection => {
      connection.close();
    });
    this.connections.clear();
  }
} 
/**
 * NAT-PMP Configuration
 * 
 * Configuration settings and error messages for NAT-PMP implementation.
 */

// Error messages
export const ERROR_MESSAGES = {
  GATEWAY_NOT_FOUND: 'NAT-PMP gateway not found',
  NOT_INITIALIZED: 'Client not initialized',
  MAPPING_NOT_FOUND: 'Mapping not found',
  NETWORK_ERROR: 'Network error occurred'
} as const; 
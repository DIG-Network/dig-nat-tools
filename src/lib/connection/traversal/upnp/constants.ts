/**
 * UPnP Constants
 * 
 * Constants and default values for UPnP functionality.
 */

export const UPNP_CONSTANTS = {
  // SSDP discovery
  SSDP_MULTICAST_ADDRESS: '239.255.255.250',
  SSDP_PORT: 1900,
  SSDP_MX: 2,
  SSDP_ST: 'urn:schemas-upnp-org:device:InternetGatewayDevice:1',
  SSDP_TIMEOUT: 5000,

  // Default ports
  DEFAULT_HTTP_PORT: 80,
  DEFAULT_HTTPS_PORT: 443,
  MIN_PORT: 1024,
  MAX_PORT: 65535,

  // Default timeouts and intervals
  DISCOVERY_TIMEOUT: 10000,
  MAPPING_TIMEOUT: 15000,
  VERIFICATION_INTERVAL: 3600000, // 60 minutes
  RETRY_INTERVAL: 1000,
  MAX_RETRIES: 3,

  // Default TTL values
  MIN_TTL: 120, // 2 minutes
  MAX_TTL: 86400, // 24 hours
  DEFAULT_TTL: 7200, // 2 hours

  // IGD Service Types
  IGD_SERVICE_TYPES: [
    'urn:schemas-upnp-org:service:WANIPConnection:1',
    'urn:schemas-upnp-org:service:WANIPConnection:2',
    'urn:schemas-upnp-org:service:WANPPPConnection:1'
  ],

  // Security defaults
  DEFAULT_SECURITY_OPTIONS: {
    allowedProtocols: ['TCP', 'UDP'],
    allowedPorts: { min: 1024, max: 65535 },
    maxMappings: 50,
    minTTL: 120,
    maxTTL: 86400,
    validateFingerprint: true,
    requireEncryption: true
  },

  // Signaling defaults
  DEFAULT_SIGNALING_OPTIONS: {
    channelPrefix: 'upnp',
    peerTimeout: 30000,
    verificationInterval: 3600000
  }
}; 
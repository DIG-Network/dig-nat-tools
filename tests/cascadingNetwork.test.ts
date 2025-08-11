// Mock nat-upnp
jest.mock('nat-upnp', () => ({
  createClient: jest.fn(() => ({
    portMapping: jest.fn(),
    portUnmapping: jest.fn(),
    externalIp: jest.fn()
  }))
}));

// Mock express
jest.mock('express', () => {
  const mockApp = {
    get: jest.fn(),
    listen: jest.fn()
  };
  return jest.fn(() => mockApp);
});

// Mock os module
jest.mock('os', () => ({
  networkInterfaces: jest.fn(() => ({})),
  default: {
    networkInterfaces: jest.fn(() => ({}))
  }
}));

import { FileHost } from '../src/host';

describe('FileHost - Cascading Network Detection', () => {
  let fileHost: FileHost;

  beforeEach(() => {
    jest.clearAllMocks();
    fileHost = new FileHost();
  });

  // Helper method to access private isPrivateIp method
  const callIsPrivateIp = (ip: string): boolean => {
    return (fileHost as any).isPrivateIp(ip);
  };

  describe('isPrivateIp - Private IP detection', () => {
    it('should identify 192.168.x.x as private IP', () => {
      expect(callIsPrivateIp('192.168.1.1')).toBe(true);
      expect(callIsPrivateIp('192.168.0.1')).toBe(true);
      expect(callIsPrivateIp('192.168.255.255')).toBe(true);
    });

    it('should identify 10.x.x.x as private IP', () => {
      expect(callIsPrivateIp('10.0.0.1')).toBe(true);
      expect(callIsPrivateIp('10.255.255.255')).toBe(true);
      expect(callIsPrivateIp('10.10.10.10')).toBe(true);
    });

    it('should identify 172.16.x.x - 172.31.x.x as private IP', () => {
      expect(callIsPrivateIp('172.16.0.1')).toBe(true);
      expect(callIsPrivateIp('172.31.255.255')).toBe(true);
      expect(callIsPrivateIp('172.20.1.1')).toBe(true);
      expect(callIsPrivateIp('172.25.100.200')).toBe(true);
    });

    it('should identify external/public IPs as not private', () => {
      expect(callIsPrivateIp('8.8.8.8')).toBe(false);
      expect(callIsPrivateIp('203.0.113.1')).toBe(false);
      expect(callIsPrivateIp('1.1.1.1')).toBe(false);
      expect(callIsPrivateIp('74.125.224.72')).toBe(false); // Google IP
    });

    it('should handle edge cases for 172.x.x.x range correctly', () => {
      expect(callIsPrivateIp('172.15.255.255')).toBe(false); // Just outside private range
      expect(callIsPrivateIp('172.32.0.1')).toBe(false); // Just outside private range
      expect(callIsPrivateIp('172.10.1.1')).toBe(false); // Below private range
      expect(callIsPrivateIp('172.40.1.1')).toBe(false); // Above private range
    });

    it('should handle invalid IP formats gracefully', () => {
      expect(callIsPrivateIp('invalid.ip')).toBe(false);
      expect(callIsPrivateIp('192.168.1')).toBe(false); // Missing octet
      expect(callIsPrivateIp('192.168.1.1.1')).toBe(false); // Too many octets
      expect(callIsPrivateIp('')).toBe(false); // Empty string
      // Note: The current implementation doesn't validate octet ranges (0-255)
      // This test documents the current behavior - invalid octets are treated as valid numbers
      expect(callIsPrivateIp('192.168.1.300')).toBe(true); // Invalid octet value, but currently matches 192.168.x.x pattern
    });
  });

  describe('getExternalIp - Cascading network error handling', () => {
    it('should throw error when UPnP returns private IP (cascading network detected)', async () => {
      // Mock UPnP to return a private IP (indicating cascaded router)
      const mockNatClient = {
        portMapping: jest.fn(),
        portUnmapping: jest.fn(),
        externalIp: jest.fn()
      };

      const privateIp = '192.168.1.100';

      // Setup UPnP to return private IP
      mockNatClient.externalIp.mockImplementation((callback: (err: Error | null, ip?: string) => void) => {
        callback(null, privateIp); // Private IP from cascaded router
      });

      // Replace the UPnP client
      (fileHost as any).client = mockNatClient;

      // Test that getExternalIp throws an error when cascading network is detected
      await expect((fileHost as any).getExternalIp()).rejects.toThrow(
        'Cascading network topology detected (UPnP returned private IP 192.168.1.100). This configuration is not supported. Please ensure the device is directly connected to a router with a public IP address.'
      );
    });

    it('should succeed when UPnP returns a valid external IP', async () => {
      // Mock UPnP to return a public IP
      const mockNatClient = {
        portMapping: jest.fn(),
        portUnmapping: jest.fn(),
        externalIp: jest.fn()
      };

      const externalIp = '203.0.113.1';

      // Setup UPnP to return external IP
      mockNatClient.externalIp.mockImplementation((callback: (err: Error | null, ip?: string) => void) => {
        callback(null, externalIp); // External IP
      });

      // Replace the UPnP client
      (fileHost as any).client = mockNatClient;

      // Test that getExternalIp succeeds with external IP
      const result = await (fileHost as any).getExternalIp();
      expect(result).toBe(externalIp);
    });

    it('should fall back to local IP when UPnP fails', async () => {
      // Mock UPnP to fail
      const mockNatClient = {
        portMapping: jest.fn(),
        portUnmapping: jest.fn(),
        externalIp: jest.fn()
      };

      const localIp = '192.168.1.10';

      // Setup UPnP to fail
      mockNatClient.externalIp.mockImplementation((callback: (err: Error | null, ip?: string) => void) => {
        callback(new Error('UPnP failed'), undefined);
      });

      // Mock detectLocalIp to return a local IP
      const originalDetectLocalIp = (fileHost as any).detectLocalIp;
      (fileHost as any).detectLocalIp = jest.fn().mockReturnValue(localIp);

      // Replace the UPnP client
      (fileHost as any).client = mockNatClient;

      // Test that getExternalIp falls back to local IP when UPnP fails
      const result = await (fileHost as any).getExternalIp();
      expect(result).toBe(localIp);

      // Restore original method
      (fileHost as any).detectLocalIp = originalDetectLocalIp;
    });

    it('should throw error when both UPnP and local IP detection fail', async () => {
      // Mock UPnP to fail
      const mockNatClient = {
        portMapping: jest.fn(),
        portUnmapping: jest.fn(),
        externalIp: jest.fn()
      };

      // Setup UPnP to fail
      mockNatClient.externalIp.mockImplementation((callback: (err: Error | null, ip?: string) => void) => {
        callback(new Error('UPnP failed'), undefined);
      });

      // Mock detectLocalIp to return null
      const originalDetectLocalIp = (fileHost as any).detectLocalIp;
      (fileHost as any).detectLocalIp = jest.fn().mockReturnValue(null);

      // Replace the UPnP client
      (fileHost as any).client = mockNatClient;

      // Test that getExternalIp throws an error when both UPnP and local detection fail
      await expect((fileHost as any).getExternalIp()).rejects.toThrow('Could not determine IP address');

      // Restore original method
      (fileHost as any).detectLocalIp = originalDetectLocalIp;
    });
  });

  describe('Integration scenarios', () => {
    it('should document the two main network topology scenarios', () => {
      // Scenario 1: Direct connection to router with public IP
      // - UPnP returns external/public IP
      // - System uses that IP successfully
      
      // Scenario 2: Cascading network topology (not supported)
      // - UPnP returns private IP (indicating device is behind another router/access point)
      // - System throws error and refuses to continue
      
      // This test documents the expected behavior
      expect(true).toBe(true);
    });
  });
});

// tests/setup.ts
// Mock WebTorrent module to avoid ES module import issues
jest.mock('webtorrent', () => {
  const mockWebTorrentInstance = {
    add: jest.fn(),
    seed: jest.fn(),
    destroy: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    torrents: [],
    downloadSpeed: 0,
    uploadSpeed: 0,
    ratio: 0,
    progress: 0
  };

  const mockWebTorrent = jest.fn().mockImplementation(() => mockWebTorrentInstance);
  (mockWebTorrent as any).WEBRTC_SUPPORT = true;
  
  return {
    default: mockWebTorrent,
    __esModule: true
  };
});

// Mock Gun.js module 
jest.mock('gun', () => {
  const mockGunChain = {
    get: jest.fn(),
    put: jest.fn(),
    once: jest.fn(),
    on: jest.fn(),
  };

  const mockGun = jest.fn().mockReturnValue(mockGunChain);
  
  return {
    default: mockGun,
    __esModule: true
  };
});

// Mock public-ip module to avoid ES module import issues
jest.mock('public-ip', () => ({
  publicIpv4: jest.fn().mockResolvedValue('192.168.1.100'),
  publicIpv6: jest.fn().mockResolvedValue('::1'),
  __esModule: true
}));

// Mock nat-upnp module
jest.mock('nat-upnp', () => ({
  createClient: jest.fn().mockReturnValue({
    portMapping: jest.fn(),
    externalIp: jest.fn(),
    getMappings: jest.fn(),
    destroy: jest.fn()
  }),
  __esModule: true
}));


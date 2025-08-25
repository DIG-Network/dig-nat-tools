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

// Mock Gun.js registry
jest.mock('../src/registry/gun-registry', () => ({
  GunRegistry: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    registerHost: jest.fn().mockResolvedValue(undefined),
    findHosts: jest.fn().mockResolvedValue([]),
    disconnect: jest.fn().mockResolvedValue(undefined)
  }))
}));

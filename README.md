# DIG NAT Tools

Decentralized P2P file transfer with NAT traversal.

## Features

- TCP, UDP, WebRTC, and GUN relay protocol support
- NAT traversal using NAT-PMP and PCP
- Public IP address discovery
- Multi-peer downloads
- Progress tracking

## Installation

```bash
npm install @dignetwork/dig-nat-tools
```

## Usage

Check the examples directory for complete usage examples:

- `simple-example.ts`: Simple file transfer example
- `host-example.ts`: Setting up a file host 
- `client-example.ts`: Client downloading a file
- `multi-peer-client-example.ts`: Downloading from multiple peers
- `ip-discovery-example.ts`: Discovering public IP addresses

## Development

### Setup

```bash
npm install
```

### Building

```bash
npm run build
```

### Running Tests

The project includes a comprehensive test suite that tests file transfers using each supported protocol (TCP, UDP, WebRTC, and GUN relay) as well as multi-protocol downloads.

There are several test commands available:

```bash
# Run all tests (may not work reliably in CI environments)
npm test

# Run only the protocol tests (may fail in CI environments)
npm run test:protocols

# Run specific protocol tests (not recommended for CI)
npm run test:tcp    # TCP tests only
npm run test:udp    # UDP tests only
npm run test:webrtc # WebRTC tests only
npm run test:gun    # GUN relay tests only
npm run test:multi  # Multi-protocol tests only

# Run all protocol tests sequentially with better error handling
npm run test:sequential

# CI-safe testing options (recommended for CI environments)
npm run test:all-safe       # Run all tests in a CI-safe manner with mocking (best for CI)
npm run test:ci-safe        # Run only the fully mocked network manager tests
npm run test:protocols-comprehensive  # Run all protocol tests with mocking enabled
npm run test:protocols-debug # Run protocol tests with enhanced debugging output

# Run individual protocol tests with mocking (safe for CI)
npm run test:tcp-safe    # TCP tests with mocking
npm run test:udp-safe    # UDP tests with mocking
npm run test:webrtc-safe # WebRTC tests with mocking
npm run test:gun-safe    # GUN relay tests with mocking
npm run test:multi-safe  # Multi-protocol tests with mocking
```

**Note:** P2P protocol tests can be flaky in CI environments due to network constraints. For reliable CI testing, use the `test:all-safe` script which enables comprehensive mocking of all network operations, ensuring tests run consistently without actual network connections. For more details on the testing approach, see the `README-TESTING.md` file.

### Protocols

This library uses multiple protocols to transfer files:

1. **TCP** - Most reliable, but requires port forwarding or NAT traversal
2. **UDP** - Can work through some NATs, but less reliable
3. **WebRTC** - Works through most NATs using STUN/TURN servers
4. **GUN relay** - Works through strict firewalls by using a relay, but slower

## License

MIT 
# IPv6 Prioritization Support

This document explains the implementation of IPv6 prioritization in the dig-nat-tools library. The library now supports dual-stack networking, preferring IPv6 connections when available and falling back to IPv4 when necessary.

## Key Features

1. **Dual-Stack Support**: Handles both IPv4 and IPv6 addresses throughout the networking stack
2. **IPv6 Prioritization**: Attempts IPv6 connections first with automatic fallback to IPv4
3. **Backward Compatibility**: Maintains compatibility with existing IPv4-only setups
4. **User Configurability**: Provides options to enable/disable IPv6 and control prioritization
5. **IP Detection**: Reliably detects and categorizes IP addresses across different formats

## Implementation Details

### Core Modules

1. **IP Helper Utilities** (`src/lib/utils/ip-helper.ts`)
   - Provides functions for IP version detection, categorization, and sorting
   - Handles different network interface formats across Node.js versions
   - Includes functions to collect and filter IP addresses from system interfaces

2. **Dual-Stack Socket Support** (`src/lib/utils/dual-stack.ts`)
   - Creates and manages dual-stack sockets for both TCP and UDP
   - Implements connection strategies with IPv6 preference
   - Provides robust error handling and fallback mechanisms

3. **Public IP Discovery** (`src/lib/utils/network.ts`)
   - Updated to support discovering both IPv4 and IPv6 public addresses
   - Prioritizes IPv6 when enabled and available
   - Uses multiple methods: STUN, NAT-PMP/PCP, and local network analysis

4. **Client Connection Logic** (`src/lib/client.ts`)
   - Implements connection strategies that prioritize IPv6
   - Sorts available peer addresses with IPv6 first when preferred
   - Creates sockets appropriate for the address format

### Key Configuration Options

```typescript
{
  enableIPv6: boolean;  // Enable IPv6 support (default: false)
  preferIPv6: boolean;  // Prioritize IPv6 over IPv4 when both available (default: true when IPv6 enabled)
}
```

These options can be passed to various components:
- `FileClient`
- `PeerDiscoveryManager`
- `NetworkManager`
- `discoverPublicIPs` function

## Connection Flow with IPv6 Prioritization

1. The system collects available peer addresses (both IPv4 and IPv6)
2. Addresses are sorted based on the `preferIPv6` setting
3. Connection attempts begin with the first address in the sorted list
4. If a connection attempt fails, the system tries the next address
5. This continues until a connection is established or all addresses fail

## Example Usage

```typescript
import FileClient from './lib/client';

// Create client with IPv6 prioritization enabled
const client = new FileClient({
  enableIPv6: true,
  preferIPv6: true,
  // other options...
});

// The client will automatically:
// 1. Discover public IPv6 and IPv4 addresses
// 2. Prioritize IPv6 connections when available
// 3. Fall back to IPv4 when IPv6 is unavailable or fails
```

## Performance Considerations

1. **Connection Timeout**: IPv6 connection attempts add slight overhead when they fail
2. **Multiple Addresses**: The system is optimized to try multiple addresses in parallel
3. **Caching**: IP address detection results are cached to improve performance

## Troubleshooting

Common issues when working with IPv6:

1. **ISP Support**: Some ISPs may not provide IPv6 connectivity
2. **Network Configuration**: Local network equipment may not support IPv6
3. **Firewall Issues**: Firewalls may block IPv6 traffic differently than IPv4

## Future Improvements

1. Add support for Happy Eyeballs algorithm for even faster connection establishment
2. Implement connection quality metrics to choose between IPv4 and IPv6
3. Add IPv6 support to more components like NAT-PMP client 
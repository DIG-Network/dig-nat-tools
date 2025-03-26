# Network Utils Usage Guidelines

This document provides guidelines for using the `network-utils.ts` module consistently throughout the Dig NAT Tools codebase to avoid duplicated logic and ensure consistent behavior.

## Overview

The `src/lib/connection/network/network-utils.ts` module provides essential network utilities for:

- Creating and managing IPv4/IPv6 dual-stack support
- Socket creation and connection establishment
- Address validation and preference handling
- Network interface discovery

## Preferred Functions

Always use these exported functions from `network-utils.ts` instead of direct Node.js socket creation:

| Function | Description | Instead of |
|----------|-------------|------------|
| `createTCPConnection()` | Creates and connects a TCP socket | `new net.Socket()` + `socket.connect()` |
| `createUDPConnection()` | Creates a "connected" UDP socket | `dgram.createSocket()` + `socket.bind()` |
| `createUDPSocketBound()` | Creates a bound UDP socket | `dgram.createSocket()` + `socket.bind()` |
| `createTCPServerBound()` | Creates a bound TCP server | `net.createServer()` + `server.listen()` |
| `createDualStackSocket()` | Creates a dual-stack capable socket | Custom socket configuration |
| `getSocketTypeForAddress()` | Determines socket type from address | Manual address format checking |
| `getBindAddressForSocketType()` | Gets correct bind address | Hardcoded `0.0.0.0` or `::` |
| `connectWithIPv6Preference()` | Connects with IPv6 preference | Custom connection logic |
| `connectToFirstAvailableAddress()` | Tries multiple addresses | Custom retry loops |

## Implementation Guidelines

### 1. Direct Socket Creation

❌ **Avoid This**:
```typescript
const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
socket.bind(port);
```

✅ **Use This**:
```typescript
const socket = await createUDPSocketBound(port, { enableIPv6: false, reuseAddr: true });
```

### 2. TCP Connection Establishment

❌ **Avoid This**:
```typescript
const socket = new net.Socket();
socket.connect({ port, host, family: 6 });
```

✅ **Use This**:
```typescript
const socket = await createTCPConnection(host, port, 'tcp6', timeout);
```

### 3. Address Family Detection

❌ **Avoid This**:
```typescript
const socketType = isIPv6(address) ? 'tcp6' : 'tcp4';
```

✅ **Use This**:
```typescript
const socketType = getSocketTypeForAddress(address, 'tcp', preferIPv6);
```

### 4. Binding to Correct Interface

❌ **Avoid This**:
```typescript
socket.bind(port, socketType.includes('6') ? '::' : '0.0.0.0');
```

✅ **Use This**:
```typescript
const bindAddress = getBindAddressForSocketType(socketType);
socket.bind(port, bindAddress);
```

## Modules That Should Use network-utils.ts

The following modules should consistently use network-utils functions:

- `nat-traversal-manager.ts` - For all connection attempts
- `connection-client.ts` - For creating connections from traversal results
- All traversal modules:
  - `hole-punch/base-client.ts`
  - `upnp/base-client.ts`
  - `nat-pmp/base-client.ts`
  - `ice/base-client.ts`
  - `turn/base-client.ts`
  - `stun-gun/base-client.ts`

## Benefits

- **Consistent behavior** across all network connection types
- **Reduced code duplication** and maintenance burden
- **Centralized improvements** to network handling
- **Better IPv6 support** throughout the codebase
- **Consistent error handling** 
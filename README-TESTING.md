# Dig Network Testing Guide

This document explains the approach to testing in the Dig Network project, with special focus on running tests in CI and automated environments.

## Testing Challenges

The Dig Network project includes tests for various network protocols (TCP, UDP, WebRTC, Gun, etc.) which can be problematic in certain environments:

1. **Network Dependencies**: Many tests require actual network connections
2. **Protocol Initialization**: Some protocols (like Gun) can hang indefinitely waiting for connections
3. **CI/Agent Environments**: Tests that wait for network events can time out or hang in CI pipelines

## Test Organization

Tests are organized into several categories:

### Protocol Tests
- Located in `src/__tests__/protocols/`
- Test individual protocol implementations (TCP, UDP, WebRTC, Gun)
- Require network connections and may hang in CI environments

### Network Manager Tests
- Located in `src/__tests__/network-manager.test.ts`
- Test the high-level NetworkManager functionality
- Can be run safely with environment variables to skip network-dependent portions

### CI-Safe Tests
- Located in `src/__tests__/network-manager-ci.test.ts`
- Completely mocked implementation that doesn't use any real network dependencies
- Safe to run in any environment, including CI systems and automated testing agents

## Running Tests

### Environment Variables

- `SKIP_NETWORK_TESTS=true`: Skip any tests that require network connections
- `TS_NODE_TRANSPILE_ONLY=true`: Skip TypeScript type checking during test execution

### Test Commands

The following npm scripts are available for running tests:

```bash
# Run all tests
npm test

# Run only the fully mocked tests that are guaranteed to work anywhere
npm run test:ci-safe

# Run only NetworkManager tests with network operations skipped
npm run test:safe

# Comprehensive CI-safe testing (recommended for CI)
npm run test:all-safe  # Runs all tests with mocking enabled

# Run all protocol tests with comprehensive mocking
npm run test:protocols-comprehensive

# Run specific protocol tests (not safe for CI)
npm run test:protocols
npm run test:tcp
npm run test:udp
npm run test:webrtc
npm run test:gun
npm run test:multi
```

## Test Implementation Notes

### Safe Testing Approach

The project provides two approaches for testing in CI environments:

1. **Isolated Mock Tests**: The `network-manager-ci.test.ts` file demonstrates a mock-only approach for testing core functionality.

2. **Comprehensive Mock Testing**: The `test:all-safe` script runs all tests including protocol tests with network operations fully mocked. This approach:
   - Leverages a global Jest setup file (`src/__tests__/jest.setup.ts`) to mock network operations
   - Mocks all network-related modules including fs-extra, crypto, net, dgram
   - Provides realistic simulations of network behavior without actual connections
   - Ensures tests run reliably in any environment, including CI

### Network Mocking Strategy

The `network-manager-ci.test.ts` file demonstrates the safest approach for testing in CI environments:

1. **Complete Mocking**: No dependencies on the actual implementation
2. **No Network Access**: All peer operations are simulated
3. **Fast Execution**: Tests complete quickly with predictable timing
4. **No External Dependencies**: No reliance on Gun, WebRTC, or other protocols

### Partial Safe Testing

The regular `network-manager.test.ts` can be run with the `SKIP_NETWORK_TESTS` environment variable to skip network operations.

### Timeout Management

All CI-safe tests include:
- Jest timeout limits
- No watchman dependencies
- Force exit to prevent hanging

## Adding New Tests

When adding new tests, consider:

1. Is this test safe to run in a CI environment?
2. Does it require actual network connections?
3. Should it be skipped when `SKIP_NETWORK_TESTS` is true?

Follow these guidelines for different test types:

### For Protocol Testing
```typescript
// In protocol test files
test('should connect to peers', async () => {
  // Skip in CI environments
  if (process.env.SKIP_NETWORK_TESTS === 'true') {
    console.log('Skipping network test in CI environment');
    return;
  }
  
  // Regular test code...
});
```

### For Fully Mocked Testing
```typescript
// Create a separate test file with mocked implementations
// No need for SKIP_NETWORK_TESTS checks
```

## Troubleshooting

If tests are hanging:

1. Ensure you're using the appropriate test command for your environment
2. Set `SKIP_NETWORK_TESTS=true` in CI environments
3. Use the `--no-watchman` and `--forceExit` flags with Jest
4. Set appropriate timeouts with `--testTimeout=5000`
5. Consider using the fully mocked tests in `network-manager-ci.test.ts`

## CI Pipeline Configuration

For CI pipelines, use:

```yaml
test:
  script:
    - npm run test:ci-safe
```

This ensures that only the fully isolated tests are run, preventing any hanging or network-dependent issues. 
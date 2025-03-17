/**
 * Jest setup file to handle skipping network-dependent tests
 * This file runs before each test file and can conditionally skip tests
 */

// Check if we should skip network tests based on environment variable
const skipNetworkTests = process.env.SKIP_NETWORK_TESTS === 'true';

// Add a global beforeAll that logs when tests are skipped
beforeAll(() => {
  if (skipNetworkTests) {
    console.log('Running with SKIP_NETWORK_TESTS=true - network tests will be skipped');
  }
});

// Override the test function to automatically skip tests when needed
// This only applies to test files in the protocols directory
const originalTest = global.test;
global.test = (name, fn, timeout) => {
  // If we're in a protocol test file and should skip network tests
  if (skipNetworkTests && 
      (expect.getState().testPath?.includes('/protocols/') || 
       name.toLowerCase().includes('network'))) {
    // Replace the test with a skipped version that logs
    return originalTest.skip(name, () => {
      console.log(`Skipping network test: ${name}`);
    }, timeout);
  }
  
  // Otherwise, run the test normally
  return originalTest(name, fn, timeout);
};

// Also handle test.only
global.test.only = (name, fn, timeout) => {
  if (skipNetworkTests && 
      (expect.getState().testPath?.includes('/protocols/') || 
       name.toLowerCase().includes('network'))) {
    return originalTest.skip(name, () => {
      console.log(`Skipping network test.only: ${name}`);
    }, timeout);
  }
  return originalTest.only(name, fn, timeout);
};

// Copy over other test properties
global.test.skip = originalTest.skip;
global.test.todo = originalTest.todo;
global.test.each = originalTest.each;
global.test.concurrent = originalTest.concurrent;

// Increase timeout for all tests
jest.setTimeout(60000);

// Mock debug to reduce noise in tests
jest.mock('debug', () => {
  return jest.fn(() => jest.fn());
});

// Create temporary directories for tests
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

const TEST_DIR = path.join(os.tmpdir(), 'dig-nat-tools-tests');

// Create test directories before tests
beforeAll(async () => {
  await fs.ensureDir(TEST_DIR);
  await fs.ensureDir(path.join(TEST_DIR, 'host'));
  await fs.ensureDir(path.join(TEST_DIR, 'client'));
});

// Clean up test directories after all tests
afterAll(async () => {
  try {
    await fs.remove(TEST_DIR);
  } catch (err) {
    console.error('Error cleaning up test directories:', err);
  }
});

// Make test directories available globally
global.TEST_DIR = TEST_DIR; 
/**
 * Run only safe tests that don't rely on network connections
 * This script is useful for CI environments or agents where network tests might hang
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Create a temporary tsconfig to ignore problematic modules
const tempTsConfigPath = path.join(__dirname, 'temp-tsconfig.json');
fs.writeFileSync(tempTsConfigPath, JSON.stringify({
  extends: './tsconfig.json',
  compilerOptions: {
    skipLibCheck: true,
    types: ['jest', 'node']
  },
  exclude: ["node_modules", "**/*.test.ts"],
  include: ["src/**/*.ts"]
}));

// Set environment variables to skip network tests and bypass TypeScript errors
process.env.SKIP_NETWORK_TESTS = 'true';
process.env.NODE_ENV = 'test';
process.env.TS_NODE_TRANSPILE_ONLY = 'true';
process.env.TS_NODE_PROJECT = tempTsConfigPath;

console.log('Running all CI-safe tests using test:all-safe...');

// Use npm run test:all-safe which runs all tests in a CI-safe manner
const testProcess = spawn('npm', [
  'run',
  'test:all-safe'
], {
  env: {
    ...process.env,
    SKIP_NETWORK_TESTS: 'true',
    NODE_ENV: 'test',
    TS_NODE_TRANSPILE_ONLY: 'true',
    TS_NODE_PROJECT: tempTsConfigPath
  },
  stdio: 'inherit' // Directly show output in console
});

// Set a global timeout for the entire test run
const timeout = setTimeout(() => {
  console.log('Test execution timed out after 5 minutes');
  testProcess.kill();
  fs.unlinkSync(tempTsConfigPath); // Clean up temp config
  process.exit(1);
}, 5 * 60 * 1000); // 5 minute timeout (increased to allow for all protocol tests)

testProcess.on('close', (code) => {
  clearTimeout(timeout); // Clear the timeout if tests complete
  
  // Clean up temp tsconfig
  try {
    fs.unlinkSync(tempTsConfigPath);
  } catch (error) {
    console.error('Error removing temp tsconfig:', error);
  }
  
  if (code === 0) {
    console.log('All safe tests passed successfully!');
    process.exit(0);
  } else {
    console.error(`Tests failed with exit code: ${code}`);
    process.exit(code || 1); // Use 1 as default if code is null or undefined
  }
});

// Handle process termination signals
process.on('SIGINT', () => {
  clearTimeout(timeout);
  try {
    fs.unlinkSync(tempTsConfigPath);
  } catch (e) {}
  console.log('Test execution interrupted by user');
  testProcess.kill('SIGINT');
  process.exit(130);
});

process.on('SIGTERM', () => {
  clearTimeout(timeout);
  try {
    fs.unlinkSync(tempTsConfigPath);
  } catch (e) {}
  console.log('Test execution terminated');
  testProcess.kill('SIGTERM');
  process.exit(143);
}); 
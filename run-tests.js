#!/usr/bin/env node

/**
 * This script runs protocol tests one by one with better error handling.
 * It allows tests to continue even if one test fails, providing a summary at the end.
 */

const { spawn } = require('child_process');
const path = require('path');

// Define all test categories to run
const testCategories = [
  { name: 'TCP Protocol Tests', command: 'npm', args: ['run', 'test:tcp'] },
  { name: 'UDP Protocol Tests', command: 'npm', args: ['run', 'test:udp'] },
  { name: 'WebRTC Protocol Tests', command: 'npm', args: ['run', 'test:webrtc'] },
  { name: 'GUN Relay Protocol Tests', command: 'npm', args: ['run', 'test:gun'] },
  { name: 'Multi-Protocol Tests', command: 'npm', args: ['run', 'test:multi'] }
];

// Results tracking
const results = {
  passed: [],
  failed: [],
  start: Date.now()
};

// Set colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

/**
 * Run a command and return a promise
 * @param {string} command Command to run
 * @param {string[]} args Arguments for the command
 * @returns {Promise<{success: boolean, output: string}>} Result of command execution
 */
function runCommand(command, args) {
  return new Promise((resolve) => {
    console.log(`${colors.bright}${colors.blue}> ${command} ${args.join(' ')}${colors.reset}\n`);
    
    const child = spawn(command, args, { 
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    });
    
    let output = '';
    
    child.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
    });
    
    child.stderr.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stderr.write(`${colors.yellow}${text}${colors.reset}`);
    });
    
    child.on('exit', (code) => {
      resolve({
        success: code === 0,
        output
      });
    });
  });
}

/**
 * Run all tests sequentially
 */
async function runTests() {
  console.log(`${colors.bright}${colors.cyan}=== DIG-NAT-TOOLS PROTOCOL TESTS ===\n${colors.reset}`);
  
  for (const test of testCategories) {
    console.log(`\n${colors.bright}${colors.cyan}Running ${test.name}...${colors.reset}\n`);
    
    try {
      const result = await runCommand(test.command, test.args);
      
      if (result.success) {
        console.log(`\n${colors.green}✓ ${test.name} passed${colors.reset}\n`);
        results.passed.push(test.name);
      } else {
        console.log(`\n${colors.red}✗ ${test.name} failed${colors.reset}\n`);
        results.failed.push(test.name);
      }
    } catch (error) {
      console.error(`\n${colors.red}Error running ${test.name}:${colors.reset}`, error);
      results.failed.push(test.name);
    }
    
    console.log(`${colors.dim}---------------------------------------${colors.reset}\n`);
  }
  
  // Print summary
  const duration = ((Date.now() - results.start) / 1000).toFixed(2);
  
  console.log(`${colors.bright}${colors.cyan}=== TEST SUMMARY ===\n${colors.reset}`);
  console.log(`Total time: ${duration} seconds`);
  console.log(`Tests run: ${testCategories.length}`);
  
  if (results.passed.length > 0) {
    console.log(`\n${colors.green}Tests passed (${results.passed.length}):${colors.reset}`);
    results.passed.forEach(name => console.log(`  ${colors.green}✓ ${name}${colors.reset}`));
  }
  
  if (results.failed.length > 0) {
    console.log(`\n${colors.red}Tests failed (${results.failed.length}):${colors.reset}`);
    results.failed.forEach(name => console.log(`  ${colors.red}✗ ${name}${colors.reset}`));
    process.exit(1);
  } else {
    console.log(`\n${colors.green}${colors.bright}All tests passed!${colors.reset}`);
  }
}

// Run the tests
runTests().catch(error => {
  console.error(`\n${colors.red}Error running tests:${colors.reset}`, error);
  process.exit(1);
}); 
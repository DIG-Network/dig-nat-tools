/**
 * This file helps debug Jest mocking issues
 */

// Print environment variables that affect test mocking
console.log('===== MOCK DEBUG INFORMATION =====');
console.log('process.env.CI:', process.env.CI);
console.log('process.env.SKIP_NETWORK_TESTS:', process.env.SKIP_NETWORK_TESTS);
console.log('typeof process.env.SKIP_NETWORK_TESTS:', typeof process.env.SKIP_NETWORK_TESTS);
console.log('process.env.NODE_ENV:', process.env.NODE_ENV);
console.log('jest.isMockFunction:', typeof jest.isMockFunction === 'function');

// Export a function to check if mocking should be enabled
export function shouldUseMocks(): boolean {
  const shouldSkip = process.env.CI === 'true' || 
                    process.env.SKIP_NETWORK_TESTS === 'true' || 
                    process.env.SKIP_NETWORK_TESTS === '1' || 
                    process.env.SKIP_NETWORK_TESTS !== undefined;
  
  console.log('shouldUseMocks() returning:', shouldSkip);
  return shouldSkip;
}

// This will run when the file is imported
shouldUseMocks(); 
/**
 * Test environment setup
 *
 * Configures the test environment with necessary variables and mocks
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.PROXY_FEE_PERCENT = '0';
process.env.MAX_BLOB_SIZE = '131072';
process.env.JOB_TIMEOUT = '300';

// Mock crypto if not available (for tests that don't need real crypto)
if (typeof globalThis.crypto === 'undefined') {
  const crypto = require('crypto');
  globalThis.crypto = {
    getRandomValues: (array: Uint8Array) => {
      const bytes = crypto.randomBytes(array.length);
      array.set(bytes);
      return array;
    },
    randomUUID: () => crypto.randomUUID(),
    subtle: {} as any
  } as any;
}

// Suppress console output during tests unless DEBUG is set
if (!process.env.DEBUG) {
  global.console.log = jest.fn();
  global.console.info = jest.fn();
  global.console.warn = jest.fn();
  global.console.debug = jest.fn();
}

// Export to make TypeScript happy
export {};

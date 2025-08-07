/**
 * Jest test setup - Configuration only, no logic
 *
 * This file configures Jest globals and test environment.
 * For test utilities and helpers, see utils.ts
 */

import { jest } from '@jest/globals';

// Configure test timeout
jest.setTimeout(30000);

// Extend global test environment types
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidHex(length?: number): R;
      toBeValidAddress(): R;
      toBeValidBlobHash(): R;
    }
  }
}

// Add custom matchers for common validations
expect.extend({
  toBeValidHex(received: unknown, length?: number) {
    const hexRegex = length ? new RegExp(`^0x[a-fA-F0-9]{${length}}$`) : /^0x[a-fA-F0-9]+$/;

    const pass = typeof received === 'string' && hexRegex.test(received);

    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be a valid hex string`
          : `expected ${received} to be a valid hex string${length ? ` of length ${length}` : ''}`
    };
  },

  toBeValidAddress(received: unknown) {
    const pass = typeof received === 'string' && /^0x[a-fA-F0-9]{40}$/.test(received);

    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be a valid Ethereum address`
          : `expected ${received} to be a valid Ethereum address`
    };
  },

  toBeValidBlobHash(received: unknown) {
    const pass = typeof received === 'string' && /^0x01[a-fA-F0-9]{62}$/.test(received); // Version 0x01 + 62 hex chars

    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be a valid blob hash`
          : `expected ${received} to be a valid blob hash (should start with 0x01)`
    };
  }
});

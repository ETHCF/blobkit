/**
 * Jest test setup for proxy server - Configuration only
 *
 * This file configures Jest globals and test environment.
 * For test utilities and helpers, see utils.ts
 */

import { jest } from '@jest/globals';

// Configure test timeout for proxy server tests
jest.setTimeout(30000);

// Extend global test environment types for proxy-specific matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidProxyResponse(): R;
      toBeValidHealthResponse(): R;
      toBeValidJobStatus(): R;
    }
  }
}

// Add custom matchers for proxy response validation
expect.extend({
  toBeValidProxyResponse(received: unknown) {
    const hasRequiredFields =
      received &&
      typeof received === 'object' &&
      'success' in received &&
      typeof (received as any).success === 'boolean' &&
      ((received as any).success
        ? 'blobHash' in received && 'blobTxHash' in received && 'jobId' in received
        : 'error' in received && 'message' in received);

    return {
      message: () =>
        hasRequiredFields
          ? `expected ${JSON.stringify(received)} not to be a valid proxy response`
          : `expected ${JSON.stringify(received)} to be a valid proxy response with success, blobHash/error fields`,
      pass: Boolean(hasRequiredFields)
    };
  },

  toBeValidHealthResponse(received: unknown) {
    const isValid =
      received &&
      typeof received === 'object' &&
      'healthy' in received &&
      typeof (received as any).healthy === 'boolean' &&
      'chainId' in received &&
      typeof (received as any).chainId === 'number' &&
      'feePercent' in received &&
      typeof (received as any).feePercent === 'number' &&
      'escrowContract' in received &&
      typeof (received as any).escrowContract === 'string';

    return {
      message: () =>
        isValid
          ? `expected ${JSON.stringify(received)} not to be a valid health response`
          : `expected ${JSON.stringify(received)} to be a valid health response with healthy, chainId, feePercent, escrowContract fields`,
      pass: Boolean(isValid)
    };
  },

  toBeValidJobStatus(received: unknown) {
    const isValid =
      received &&
      typeof received === 'object' &&
      'exists' in received &&
      'completed' in received &&
      'user' in received &&
      'amount' in received &&
      'timestamp' in received;

    return {
      message: () =>
        isValid
          ? `expected ${JSON.stringify(received)} not to be a valid job status`
          : `expected ${JSON.stringify(received)} to be a valid job status with exists, completed, user, amount, timestamp fields`,
      pass: Boolean(isValid)
    };
  }
});

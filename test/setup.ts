/**
 * Global test setup - Configuration only
 *
 * This file configures Jest for the entire monorepo.
 * No logic should be placed here, only configuration.
 */

import { jest } from '@jest/globals';

// Set global test timeout for integration tests
jest.setTimeout(120000);

// Ensure tests run in UTC timezone for consistency
process.env.TZ = 'UTC';

// Set test environment
process.env.NODE_ENV = 'test';

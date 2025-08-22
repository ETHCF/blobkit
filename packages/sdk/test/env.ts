/**
 * Test environment setup - sets up environment variables for testing
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file
dotenv.config({ 
  path: path.resolve(__dirname, '../.env')
});

// Set test defaults if not already defined
process.env.NODE_ENV = 'test';
process.env.BLOBKIT_RPC_URL = process.env.BLOBKIT_RPC_URL || 'http://localhost:8545';
process.env.BLOBKIT_CHAIN_ID = process.env.BLOBKIT_CHAIN_ID || '31337';
process.env.BLOBKIT_ESCROW_31337 = process.env.BLOBKIT_ESCROW_31337 || '0x1234567890123456789012345678901234567890';
process.env.BLOBKIT_LOG_LEVEL = process.env.BLOBKIT_LOG_LEVEL || 'silent';

// Mock trusted setup path for KZG tests
process.env.BLOBKIT_KZG_TRUSTED_SETUP_PATH = process.env.BLOBKIT_KZG_TRUSTED_SETUP_PATH || '';

/**
 * Test environment setup - sets up environment variables for testing
 */

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.BLOBKIT_RPC_URL = 'http://localhost:8545';
process.env.BLOBKIT_CHAIN_ID = '31337';
process.env.BLOBKIT_ESCROW_31337 = '0x1234567890123456789012345678901234567890';
process.env.BLOBKIT_LOG_LEVEL = 'silent';

// Mock trusted setup path for KZG tests
process.env.BLOBKIT_KZG_TRUSTED_SETUP_PATH = '';

import { loadTrustedSetup, createMockSetup } from './kzg';
import { BlobKit } from './client';
import { BlobKitConfig, BlobKitError } from './types';

/**
 * Initialize with mock trusted setup for development.
 * ⚠️ DO NOT use in production - uses known tau value.
 */
export async function initializeForDevelopment(): Promise<void> {
  const setup = createMockSetup();
  loadTrustedSetup(setup);
}

/**
 * Initialize with official Ethereum KZG trusted setup.
 * Download files from: https://github.com/ethereum/kzg-ceremony-sequencer
 */
export async function initializeForProduction(
  g1Path: string,
  g2Path: string,
  format: 'binary' | 'text' = 'text'
): Promise<void> {
  const { loadTrustedSetupFromBinary, loadTrustedSetupFromText } = await import('./kzg/setup');

  const setup = format === 'binary'
    ? await loadTrustedSetupFromBinary(g1Path, g2Path)
    : await loadTrustedSetupFromText(g1Path, g2Path);

  loadTrustedSetup(setup);
}

/**
 * Validates environment variable values for common issues.
 */
function validateEnvironmentVariables(config: BlobKitConfig, privateKey?: string): void {
  // Validate RPC URL format
  if (!config.rpcUrl.match(/^https?:\/\/.+/)) {
    throw new BlobKitError('Invalid RPC_URL format', 'INVALID_RPC_URL');
  }

  // Validate chain ID
  if (config.chainId !== undefined && (config.chainId < 1 || config.chainId > 4294967295)) {
    throw new BlobKitError('Invalid CHAIN_ID: must be between 1 and 2^32-1', 'INVALID_CHAIN_ID');
  }

  // Validate compression level
  if (config.compressionLevel !== undefined && (config.compressionLevel < 0 || config.compressionLevel > 11)) {
    throw new BlobKitError('Invalid COMPRESSION_LEVEL: must be between 0 and 11', 'INVALID_COMPRESSION_LEVEL');
  }

  // Validate private key format if provided
  if (privateKey !== undefined) {
    if (!privateKey.match(/^0x[0-9a-fA-F]{64}$/)) {
      throw new BlobKitError('Invalid PRIVATE_KEY format: must be 0x followed by 64 hex characters', 'INVALID_PRIVATE_KEY');
    }
  }

  // Validate archive URL format if provided
  if (config.archiveUrl && !config.archiveUrl.match(/^https?:\/\/.+/)) {
    throw new BlobKitError('Invalid ARCHIVE_URL format', 'INVALID_ARCHIVE_URL');
  }
}

/**
 * Safely parse integer from environment variable with validation.
 */
function parseIntegerFromEnv(value: string | undefined, min?: number, max?: number): number | undefined {
  if (!value) return undefined;
  
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new BlobKitError(`Invalid integer value: ${value}`, 'INVALID_INTEGER');
  }
  
  if (min !== undefined && parsed < min) {
    throw new BlobKitError(`Value ${parsed} is below minimum ${min}`, 'VALUE_TOO_LOW');
  }
  
  if (max !== undefined && parsed > max) {
    throw new BlobKitError(`Value ${parsed} is above maximum ${max}`, 'VALUE_TOO_HIGH');
  }
  
  return parsed;
}

/**
 * Create BlobKit instance from environment variables.
 * Requires: RPC_URL, PRIVATE_KEY
 * Optional: CHAIN_ID, ARCHIVE_URL, DEFAULT_CODEC, COMPRESSION_LEVEL
 */
export function createFromEnv(): BlobKit {
  const config: BlobKitConfig = {
    rpcUrl: process.env.RPC_URL || '',
    chainId: parseIntegerFromEnv(process.env.CHAIN_ID, 1, 4294967295) || 1,
    archiveUrl: process.env.ARCHIVE_URL,
    defaultCodec: process.env.DEFAULT_CODEC,
    compressionLevel: parseIntegerFromEnv(process.env.COMPRESSION_LEVEL, 0, 11)
  };

  if (!config.rpcUrl) {
    throw new BlobKitError('RPC_URL environment variable is required', 'MISSING_RPC_URL');
  }

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new BlobKitError('PRIVATE_KEY environment variable is required', 'MISSING_PRIVATE_KEY');
  }

  validateEnvironmentVariables(config, privateKey);
  return new BlobKit(config, privateKey);
}

/**
 * Create read-only BlobKit instance from environment variables.
 * Requires: RPC_URL
 * Optional: CHAIN_ID, ARCHIVE_URL, DEFAULT_CODEC
 */
export function createReadOnlyFromEnv(): BlobKit {
  const config: BlobKitConfig = {
    rpcUrl: process.env.RPC_URL || '',
    chainId: parseIntegerFromEnv(process.env.CHAIN_ID, 1, 4294967295) || 1,
    archiveUrl: process.env.ARCHIVE_URL,
    defaultCodec: process.env.DEFAULT_CODEC,
    compressionLevel: parseIntegerFromEnv(process.env.COMPRESSION_LEVEL, 0, 11)
  };

  if (!config.rpcUrl) {
    throw new BlobKitError('RPC_URL environment variable is required', 'MISSING_RPC_URL');
  }

  validateEnvironmentVariables(config);
  return new BlobKit(config);
}

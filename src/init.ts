import { loadTrustedSetup, createMockSetup } from './kzg';
import { BlobKit } from './client';
import { BlobKitConfig } from './types';

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
 * Create BlobKit instance from environment variables.
 * Requires: RPC_URL, PRIVATE_KEY
 * Optional: CHAIN_ID, ARCHIVE_URL, DEFAULT_CODEC, COMPRESSION_LEVEL
 */
export function createFromEnv(): BlobKit {
  const config: BlobKitConfig = {
    rpcUrl: process.env.RPC_URL || '',
    chainId: process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 1,
    archiveUrl: process.env.ARCHIVE_URL,
    defaultCodec: process.env.DEFAULT_CODEC,
    compressionLevel: process.env.COMPRESSION_LEVEL ? parseInt(process.env.COMPRESSION_LEVEL) : undefined
  };

  if (!config.rpcUrl) {
    throw new Error('RPC_URL environment variable is required');
  }

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY environment variable is required');
  }

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
    chainId: process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 1,
    archiveUrl: process.env.ARCHIVE_URL,
    defaultCodec: process.env.DEFAULT_CODEC,
    compressionLevel: process.env.COMPRESSION_LEVEL ? parseInt(process.env.COMPRESSION_LEVEL) : undefined
  };

  if (!config.rpcUrl) {
    throw new Error('RPC_URL environment variable is required');
  }

  return new BlobKit(config);
}

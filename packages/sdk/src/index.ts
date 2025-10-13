/**
 * BlobKit SDK - Main Entry Point
 *
 * This module exports the public API for the BlobKit SDK.
 */

// Main SDK class
export { BlobKit } from './blobkit.js';
import { BlobKit } from './blobkit.js';
import type { Signer, BlobKitConfig, ProcessEnv } from './types.js';

// Component modules
export { PaymentManager } from './payment.js';
export { ProxyClient } from './proxy-client.js';
export { BlobSubmitter } from './blob-submitter.js';
export { BlobReader } from './blob-reader.js';

// Core types and interfaces
export type {
  BlobKitConfig,
  BlobKitEnvironment,
  BlobMeta,
  BlobReceipt,
  BlobPaymentResult,
  BlobReadResult,
  CostEstimate,
  JobStatus,
  ProxyHealthResponse,
  Signer,
  TransactionRequest,
  TransactionResponse,
  TransactionReceipt,
  Provider,
  FeeData,
  ProcessEnv,
  KzgSetupOptions
} from './types.js';

// Error handling
export { BlobKitError, BlobKitErrorCode } from './types.js';

// Environment utilities
export { detectEnvironment, getEnvironmentCapabilities } from './environment.js';

// Codec system
export { defaultCodecRegistry, JsonCodec, RawCodec, TextCodec } from './codecs/index.js';

// Essential utilities (only public-facing ones)
export {
  generateJobId,
  calculatePayloadHash,
  formatEther,
  parseEther,
  isValidAddress,
  validateBlobSize,
  bytesToHex,
  hexToBytes
} from './utils.js';

// KZG utilities
export {
  initializeKzg,
  encodeBlob,
  decodeBlob,
  blobToKzgCommitment,
  computeKzgProof,
  commitmentToVersionedHash,
  loadTrustedSetupFromURL,
  loadTrustedSetupFromFile,
  FIELD_ELEMENTS_PER_BLOB,
  BYTES_PER_FIELD_ELEMENT,
  BLOB_SIZE
} from './kzg.js';

export { EscrowContractABI } from './abi/index.js';

/**
 * Convenience function to create BlobKit instance from environment variables
 * @param signer Optional signer for transactions
 * @returns Configured BlobKit instance
 */
export function createFromEnv(signer?: Signer): BlobKit {
  const env = process.env as ProcessEnv;

  const config: BlobKitConfig = {
    rpcUrl: env.BLOBKIT_RPC_URL || 'http://localhost:8545',
    archiveUrl: env.BLOBKIT_ARCHIVE_URL || 'https://api.blobscan.com',
    chainId: env.BLOBKIT_CHAIN_ID ? parseInt(env.BLOBKIT_CHAIN_ID, 10) : 31337,
    proxyUrl: env.BLOBKIT_PROXY_URL,
    logLevel: env.BLOBKIT_LOG_LEVEL || 'info'
  };

  // Add KZG setup from environment if available
  if (env.BLOBKIT_KZG_TRUSTED_SETUP_PATH) {
    config.kzgSetup = {
      trustedSetupPath: env.BLOBKIT_KZG_TRUSTED_SETUP_PATH
    };
  }

  return new BlobKit(config, signer);
}


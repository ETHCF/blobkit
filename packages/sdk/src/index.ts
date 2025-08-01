/**
 * BlobKit SDK - Main Entry Point
 * 
 * This module exports the public API for the BlobKit SDK.
 * All exports are production-ready and intended for external use.
 */

// Main SDK class
export { BlobKit } from './blobkit.js';
import { BlobKit } from './blobkit.js';
import type { Signer, BlobKitConfig, ProcessEnv } from './types.js';

// Core types and interfaces
export type {
  BlobKitConfig,
  BlobKitEnvironment,
  BlobMeta,
  BlobReceipt,
  BlobPaymentResult,
  CostEstimate,
  JobStatus,
  ProxyHealthResponse,
  Signer,
  TransactionRequest,
  TransactionResponse,
  TransactionReceipt,
  Provider,
  FeeData,
  ProcessEnv
} from './types.js';

// Error handling
export { BlobKitError, BlobKitErrorCode } from './types.js';

// Environment utilities
export {
  detectEnvironment,
  getEnvironmentCapabilities
} from './environment.js';

// Codec system
export {
  defaultCodecRegistry,
  JsonCodec,
  RawCodec,
  TextCodec
} from './codecs/index.js';

// Essential utilities (only public-facing ones)
export {
  generateJobId,
  calculatePayloadHash,
  formatEther,
  parseEther,
  isValidAddress,
  validateBlobSize,
  bytesToHex,
} from './utils.js';

// KZG utilities (production-grade implementations)
export {
  initializeKzg,
  encodeBlob,
  blobToKzgCommitment,
  computeKzgProof,
  commitmentToVersionedHash,
  // bytesToHex,
  FIELD_ELEMENTS_PER_BLOB,
  BYTES_PER_FIELD_ELEMENT,
  BLOB_SIZE
} from './kzg.js';

export {
  EscrowContractABI
} from './abi/index.js';

/**
 * Convenience function to create BlobKit instance from environment variables
 * @param signer Optional signer for transactions
 * @returns Configured BlobKit instance
 */
export function createFromEnv(signer?: Signer): BlobKit {
  const env = process.env as ProcessEnv;
  
  const config: BlobKitConfig = {
    rpcUrl: env.BLOBKIT_RPC_URL || 'http://localhost:8545',
    chainId: env.BLOBKIT_CHAIN_ID ? parseInt(env.BLOBKIT_CHAIN_ID, 10) : 31337,
    proxyUrl: env.BLOBKIT_PROXY_URL,
    logLevel: env.BLOBKIT_LOG_LEVEL || 'info'
  };
  
  return new BlobKit(config, signer);
}

/**
 * Package version
 */
export const VERSION = '1.1.0'; 
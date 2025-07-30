/**
 * BlobKit SDK - Main Entry Point
 *
 * This module exports the public API for the BlobKit SDK.
 * All exports are production-ready and intended for external use.
 */
export { BlobKit } from './blobkit.js';
import { BlobKit } from './blobkit.js';
import type { Signer } from './types.js';
export type { BlobKitConfig, BlobKitEnvironment, BlobMeta, BlobReceipt, BlobPaymentResult, CostEstimate, JobStatus, ProxyHealthResponse, Signer, TransactionRequest, TransactionResponse, TransactionReceipt, Provider, FeeData, ProcessEnv } from './types.js';
export { BlobKitError, BlobKitErrorCode } from './types.js';
export { detectEnvironment, getEnvironmentCapabilities } from './environment.js';
export { defaultCodecRegistry, JsonCodec, RawCodec, TextCodec } from './codecs/index.js';
export { generateJobId, calculatePayloadHash, formatEther, parseEther, isValidAddress, validateBlobSize } from './utils.js';
export { initializeKzg, encodeBlob, blobToKzgCommitment, computeKzgProof, commitmentToVersionedHash, bytesToHex, FIELD_ELEMENTS_PER_BLOB, BYTES_PER_FIELD_ELEMENT, BLOB_SIZE } from './kzg.js';
/**
 * Convenience function to create BlobKit instance from environment variables
 * @param signer Optional signer for transactions
 * @returns Configured BlobKit instance
 */
export declare function createFromEnv(signer?: Signer): BlobKit;
/**
 * Package version
 */
export declare const VERSION = "1.1.0";
//# sourceMappingURL=index.d.ts.map
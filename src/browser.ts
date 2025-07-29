/**
 * Browser entry point for BlobKit
 * This file uses browser-specific modules that contain NO Node.js imports
 */

// Re-export all public APIs
export { BlobKit } from './client';
export * from './types';
export * from './writer';
export * from './verifier';
export * from './blob/reader';
export * from './blob/utils';

// Export browser-specific initialization functions
export {
  initialize,
  initializeForDevelopment,
  initializeForBrowser,
  initializeFromUrl,
  // Note: initializeForProduction, createFromEnv, createReadOnlyFromEnv not available in browser
} from './init-browser';

// Codec utilities
export { registerCodec, hasCodec, listCodecs } from './codecs';

// KZG exports (browser-safe versions)
export {
  blobToKZGCommitment,
  computeKZGProof,
  verifyKZGProof,
  commitmentToVersionedHash,
  loadTrustedSetup,
  createMockSetup
} from './kzg';

// Export browser-specific environment utilities
export {
  isBrowser,
  isNode,
  nodeOnlyImport,
  getNodeFs,
  getNodeFsSync,
  getNodePath,
  getNodeHttps,
} from './utils/environment-browser';
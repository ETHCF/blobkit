// Browser-specific entry point
// This file is used when importing BlobKit in browser environments

export { BlobKit } from './client';
export * from './types';

// Browser-specific initialization
export { 
  initialize,
  initializeForDevelopment,
  initializeForBrowser
} from './init';

// Codec utilities
export { registerCodec, hasCodec, listCodecs } from './codecs';

// KZG exports (browser-safe versions)
export {
  blobToKZGCommitment,
  computeKZGProof,
  verifyKZGProof,
  commitmentToVersionedHash
} from './kzg';

// Note: createFromEnv and createReadOnlyFromEnv are not exported in browser
// as they rely on process.env which is not available in browsers
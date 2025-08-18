/**
 * Production KZG implementation with caching and integrity verification
 *
 * This module provides EIP-4844 compatible KZG commitments and proofs
 * with optimized trusted setup loading and verification
 */

import { loadKZG } from 'kzg-wasm';
import { BlobKitError, BlobKitErrorCode, KzgLibrary, KzgSetupOptions } from './types.js';
import { createHash } from 'crypto';

// Constants
export const FIELD_ELEMENTS_PER_BLOB = 4096;
export const BYTES_PER_FIELD_ELEMENT = 31;
export const BLOB_SIZE = 131072;
export const VERSIONED_HASH_VERSION_KZG = 0x01;

// Internal constants
const BYTES_PER_G1 = 48;
const BYTES_PER_G2 = 96;
const NUM_G1_POINTS = 4096;
const NUM_G2_POINTS = 65;

interface TrustedSetup {
  g1: string;
  n1: number;
  g2: string;
  n2: number;
}

interface KzgWasmLibrary {
  loadTrustedSetup: (trustedSetup?: TrustedSetup) => number;
  freeTrustedSetup: () => void;
  // kzg-wasm uses uppercase KZG in method names
  blobToKzgCommitment: (blob: Uint8Array | string) => Uint8Array;
  computeBlobKzgProof: (blob: Uint8Array | string, commitment: Uint8Array) => Uint8Array;
  verifyBlobKzgProof: (
    blob: Uint8Array | string,
    commitment: Uint8Array,
    proof: Uint8Array
  ) => boolean;
  verifyKzgProof: (
    commitment: Uint8Array,
    z: Uint8Array,
    y: Uint8Array,
    proof: Uint8Array
  ) => boolean;
}


// Module-level caching
let cachedKzg: KzgWasmLibrary | undefined;
let cachedSetupHash: string | undefined;
let initPromise: Promise<void> | undefined;

/**
 * Clear the KZG cache (for testing purposes)
 * @internal
 */
export function clearKzgCache(): void {
  cachedKzg = undefined;
  cachedSetupHash = undefined;
  initPromise = undefined;
}

/**
 * Initialize KZG with trusted setup
 * This function is idempotent and caches the setup for efficiency
 */
export async function initializeKzg(options?: KzgSetupOptions): Promise<void> {
  // Return existing initialization if in progress
  if (initPromise) {
    return initPromise;
  }

  // Check if we have a setup source
  const hasSetupSource =
    options?.trustedSetupData ||
    options?.trustedSetupUrl ||
    options?.trustedSetupPath ||
    (typeof process !== 'undefined' && process.env?.BLOBKIT_KZG_TRUSTED_SETUP_PATH);

  // Return immediately if already initialized with same setup
  if (cachedKzg && (!options?.expectedHash || cachedSetupHash === options.expectedHash)) {
    // But only if we had a setup source or are checking cache
    if (hasSetupSource || !options) {
      return;
    }
  }

  // Start new initialization
  initPromise = doInitialize(options).finally(() => {
    initPromise = undefined;
  });

  return initPromise;
}

async function doInitialize(options?: KzgSetupOptions): Promise<void> {
  try {
    // Load trusted setup data
    const setupData = await loadSetupData(options);

    // Verify integrity if hash provided
    if (options?.expectedHash) {
      const actualHash = await computeHash(setupData);
      if (actualHash !== options.expectedHash) {
        throw new BlobKitError(
          BlobKitErrorCode.KZG_ERROR,
          `Trusted setup integrity check failed. Expected: ${options.expectedHash}, Got: ${actualHash}`
        );
      }
    }

    // Parse and load setup
    const trustedSetup = await parseTrustedSetup(setupData);
    const kzg = await loadKZG(trustedSetup);

    // Cache for future use (cast to our interface)
    cachedKzg = kzg as unknown as KzgWasmLibrary;
    cachedSetupHash = options?.expectedHash || (await computeHash(setupData));
  } catch (error) {
    if (error instanceof BlobKitError) {
      throw error;
    }
    throw new BlobKitError(
      BlobKitErrorCode.KZG_ERROR,
      'Failed to initialize KZG',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Load trusted setup data based on options
 */
async function loadSetupData(options?: KzgSetupOptions): Promise<Uint8Array> {
  // Option 1: Direct data provided
  if (options?.trustedSetupData) {
    return options.trustedSetupData;
  }

  // Option 2: Load from URL
  if (options?.trustedSetupUrl) {
    return loadFromUrl(options.trustedSetupUrl);
  }

  // Option 3: Load from file path
  if (options?.trustedSetupPath) {
    return loadFromFile(options.trustedSetupPath);
  }

  // Option 4: Environment variable path
  if (typeof process !== 'undefined' && process.env?.BLOBKIT_KZG_TRUSTED_SETUP_PATH) {
    return loadFromFile(process.env.BLOBKIT_KZG_TRUSTED_SETUP_PATH);
  }

  throw new BlobKitError(
    BlobKitErrorCode.KZG_ERROR,
    'No trusted setup source provided. Specify one of: trustedSetupData, trustedSetupUrl, or trustedSetupPath'
  );
}

/**
 * Load trusted setup from URL with caching headers support
 */
async function loadFromUrl(url: string): Promise<Uint8Array> {
  try {
    const response = await fetch(url, {
      headers: {
        'Cache-Control': 'max-age=3600' // Cache for 1 hour
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  } catch (error) {
    throw new BlobKitError(
      BlobKitErrorCode.KZG_ERROR,
      `Failed to load trusted setup from URL: ${url}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Load trusted setup from file system
 */
async function loadFromFile(path: string): Promise<Uint8Array> {
  try {
    if (path.startsWith('http://') || path.startsWith('https://')) {
        return loadFromUrl(path);
    }
    const fs = await import('fs');
    const buffer = await fs.promises.readFile(path);
    return new Uint8Array(buffer);
  } catch (error) {
    throw new BlobKitError(
      BlobKitErrorCode.KZG_ERROR,
      `Failed to load trusted setup from file: ${path}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Compute SHA-256 hash of data for integrity verification
 */
async function computeHash(data: Uint8Array): Promise<string> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    // Browser environment
    const dataBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', dataBuffer as ArrayBuffer);
    const hashArray = new Uint8Array(hashBuffer);
    return (
      'sha256:' +
      Array.from(hashArray)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    );
  }

  // Node.js environment
  const hash = createHash('sha256');
  hash.update(data);
  return 'sha256:' + hash.digest('hex');
}

/**
 * Parse trusted setup data into format expected by KZG library
 */
async function parseTrustedSetup(data: Uint8Array): Promise<TrustedSetup> {
  const content = new TextDecoder('utf-8').decode(data);
  const lines = content.trim().split(/\s+/);

  if (lines.length < 2) {
    throw new Error('Invalid trusted setup format');
  }

  const numG1Points = parseInt(lines[0], 10);
  const numG2Points = parseInt(lines[1], 10);

  if (numG1Points !== NUM_G1_POINTS || numG2Points !== NUM_G2_POINTS) {
    throw new Error(`Invalid point counts: G1=${numG1Points}, G2=${numG2Points}`);
  }

  const dataHex = lines.slice(2).join('').replace(/\s/g, '');

  const g1Length = NUM_G1_POINTS * BYTES_PER_G1 * 2;
  const g2Length = NUM_G2_POINTS * BYTES_PER_G2 * 2;

  if (dataHex.length < g1Length + g2Length) {
    throw new Error(`Insufficient data in trusted setup: expected at least ${g1Length + g2Length} bytes, got ${dataHex.length}`);
  }

  return {
    g1: dataHex.substring(0, g1Length),
    n1: NUM_G1_POINTS,
    g2: dataHex.substring(g1Length, g1Length + g2Length),
    n2: NUM_G2_POINTS
  };
}

/**
 * Ensure KZG is initialized before use
 */
export function requireKzg(): KzgWasmLibrary {
  if (!cachedKzg) {
    throw new BlobKitError(
      BlobKitErrorCode.KZG_ERROR,
      'KZG not initialized. Call initializeKzg() first.'
    );
  }
  return cachedKzg;
}

const BLOB_HEADER_SIZE = 4;

function blobWithHeader(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(BLOB_HEADER_SIZE + data.length);
  const header = new Uint8Array(BLOB_HEADER_SIZE);
  // The first 3 bytes are reserved for the payload length,
  // we reserve an additional byte for future use
  header[0] = (data.length >> 16) & 0xFF;
  header[1] = (data.length >> 8) & 0xFF;
  header[2] = data.length & 0xFF;
  header[3] = 0;

  out.set(header, 0);
  out.set(data, BLOB_HEADER_SIZE);
  return out;
}

/**
 * Encode data into EIP-4844 blob format
 */
export function encodeBlob(inputData: Uint8Array): Uint8Array {
  if (!inputData || inputData.length === 0) {
    throw new BlobKitError(BlobKitErrorCode.INVALID_PAYLOAD, 'Data cannot be empty');
  }
  const data = blobWithHeader(inputData);

  if (data.length > FIELD_ELEMENTS_PER_BLOB * BYTES_PER_FIELD_ELEMENT) {
    throw new BlobKitError(
      BlobKitErrorCode.BLOB_TOO_LARGE,
      `Data too large: ${data.length} bytes, max: ${FIELD_ELEMENTS_PER_BLOB * BYTES_PER_FIELD_ELEMENT} bytes`
    );
  }

  const blob = new Uint8Array(BLOB_SIZE);
  

  // Pack data into field elements
  for (let i = 0; i < FIELD_ELEMENTS_PER_BLOB; i++) {
    const fieldStart = i * 32;
    const dataStart = i * BYTES_PER_FIELD_ELEMENT;
    const dataEnd = Math.min(dataStart + BYTES_PER_FIELD_ELEMENT, data.length);

    // First byte must be 0 for field element validity
    blob[fieldStart] = 0;

    // Copy data chunk if available
    if (dataStart < data.length) {
      blob.set(data.subarray(dataStart, dataEnd), fieldStart + 1);
    }
  }

  return blob;
}

/**
 * Decode EIP-4844 blob format back to original data
 */
export function decodeBlob(blob: Uint8Array): Uint8Array {
  if (blob.length !== BLOB_SIZE) {
    throw new BlobKitError(
      BlobKitErrorCode.INVALID_PAYLOAD,
      `Invalid blob size: expected ${BLOB_SIZE}, got ${blob.length}`
    );
  }

  let dataLength = blob[1] << 16 | blob[2] << 8 | blob[3]; // first byte is always 0
  const data = new Uint8Array(dataLength);
  let dataCounter = 0
  for(let i = BLOB_HEADER_SIZE+1; i < blob.length && dataCounter < dataLength; i++) {
    if(i % 32 == 0){
      // Start of a new element, this byte is always empty
      continue
    }
    data[i - BLOB_HEADER_SIZE - 1] = blob[i];
    dataCounter++;
  }

  return data;
}

/**
 * Create KZG commitment for a blob
 */
export function blobToKzgCommitment(blob: Uint8Array): Uint8Array {
  const kzg = requireKzg();

  if (blob.length !== BLOB_SIZE) {
    throw new BlobKitError(
      BlobKitErrorCode.INVALID_PAYLOAD,
      `Invalid blob size: expected ${BLOB_SIZE}, got ${blob.length}`
    );
  }

  try {
    // kzg-wasm expects hex strings
    const hexBlob = '0x' + Buffer.from(blob).toString('hex');
    return kzg.blobToKzgCommitment(hexBlob);
  } catch (error) {
    throw new BlobKitError(
      BlobKitErrorCode.KZG_ERROR,
      `Failed to compute KZG commitment: ${error}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Compute KZG proof for a blob
 */
export function computeKzgProof(blob: Uint8Array, commitment: Uint8Array): Uint8Array {
  const kzg = requireKzg();

  if (blob.length !== BLOB_SIZE) {
    throw new BlobKitError(
      BlobKitErrorCode.INVALID_PAYLOAD,
      `Invalid blob size: expected ${BLOB_SIZE}, got ${blob.length}`
    );
  }

  try {
    // kzg-wasm expects hex strings
    const hexBlob = '0x' + Buffer.from(blob).toString('hex');
    return kzg.computeBlobKzgProof(hexBlob, commitment);
  } catch (error) {
    throw new BlobKitError(
      BlobKitErrorCode.KZG_ERROR,
      'Failed to compute KZG proof',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Convert KZG commitment to versioned hash
 */
export async function commitmentToVersionedHash(commitment: Uint8Array): Promise<string> {
  if (commitment.length !== 48) {
    throw new BlobKitError(
      BlobKitErrorCode.INVALID_PAYLOAD,
      `Invalid commitment size: expected 48 bytes, got ${commitment.length}`
    );
  }

  // Use crypto.subtle if available, otherwise fall back to Node crypto
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const commitmentBuffer = commitment.buffer.slice(
      commitment.byteOffset,
      commitment.byteOffset + commitment.byteLength
    );
    const hashBuffer = await globalThis.crypto.subtle.digest(
      'SHA-256',
      commitmentBuffer as ArrayBuffer
    );
    const hashArray = new Uint8Array(hashBuffer);
    hashArray[0] = VERSIONED_HASH_VERSION_KZG;
    return (
      '0x' +
      Array.from(hashArray)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    );
  }

  // Node.js synchronous fallback
  const hash = createHash('sha256');
  hash.update(commitment);
  const hashBytes = hash.digest();
  hashBytes[0] = VERSIONED_HASH_VERSION_KZG;
  return '0x' + hashBytes.toString('hex');
}

/**
 * Export functions for loading setup data (for testing/advanced use)
 */
export { loadFromUrl as loadTrustedSetupFromURL, loadFromFile as loadTrustedSetupFromFile };

/**
 * Export alias for compatibility
 */
export { computeKzgProof as computeBlobKzgProof };

/**
 * KZG library implementation for ethers compatibility
 */
class CachedKzgLibrary implements KzgLibrary {
  blobToKzgCommitment(blob: Uint8Array): Uint8Array {
    return blobToKzgCommitment(blob);
  }

  computeBlobKzgProof(blob: Uint8Array, commitment: Uint8Array): Uint8Array {
    return computeKzgProof(blob, commitment);
  }
}

export const kzgLibrary: KzgLibrary = new CachedKzgLibrary();

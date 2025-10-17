/**
 * Production KZG implementation with caching and integrity verification
 *
 * This module provides EIP-4844 compatible KZG commitments and proofs
 * with optimized trusted setup loading and verification
 */

import { loadKZG } from '@blobkit/kzg-wasm';
import { BlobKitError, BlobKitErrorCode, BlobVersion } from './types.js';
import { createHash } from 'crypto';
import type { TrustedSetup, KZGProofWithCells } from '@blobkit/kzg-wasm';

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

interface KzgWasmLibrary {
  loadTrustedSetup: (trustedSetup?: TrustedSetup, precompute?: number) => number;
  freeTrustedSetup: () => void;
  blobToKZGCommitment: (blob: string) => string;
  computeBlobKZGProof: (blob: string, commitment: string) => string;
  verifyBlobKZGProofBatch: (blobs: string[], commitments: string[], proofs: string[]) => boolean;
  verifyKZGProof: (commitment: string, z: string, y: string, proof: string) => boolean;
  verifyBlobKZGProof: (blob: string, commitment: string, proof: string) => boolean;
  computeCellsAndKZGProofs: (blob: string) => KZGProofWithCells;
  recoverCellsFromKZGProofs: (cellIndices: number[], partial_cells: string[], numCells: number) => KZGProofWithCells;
  verifyCellKZGProof: (commitment: string, cells: string[], proofs: string[]) => boolean;
  verifyCellKZGProofBatch: (commitments: string[], cellIndices: number[], cells: string[], proofs: string[], numCells: number) => boolean;
  blobToKzgCommitment: (blob: string) => string;
  computeBlobProof: (blob: string, commitment: string) => string;
}

// Module-level caching
let cachedKzg: KzgWasmLibrary | undefined;
let initPromise: Promise<void> | undefined;

/**
 * Clear the KZG cache (for testing purposes)
 * @internal
 */
export function clearKzgCache(): void {
  cachedKzg = undefined;
  initPromise = undefined;
}

/**
 * Initialize KZG with trusted setup
 * This function is idempotent and caches the setup for efficiency
 */
export async function initializeKzg(): Promise<void> {
  // Return existing initialization if in progress
  if (initPromise) {
    return initPromise;
  }


  // Return immediately if already initialized with same setup
  if (cachedKzg) {
    return;
  }

  // Start new initialization
  initPromise = doInitialize().finally(() => {
    initPromise = undefined;
  });

  return initPromise;
}

async function doInitialize(): Promise<void> {
  try {

    const kzg = await loadKZG(); // Use default configuration

    // Cache for future use (cast to our interface)
    cachedKzg = kzg as unknown as KzgWasmLibrary;
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
    data[dataCounter] = blob[i];
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
    const resultHex = kzg.blobToKzgCommitment(hexBlob);
    return Uint8Array.from(Buffer.from(resultHex.slice(2), 'hex'));
  } catch (error) {
    throw new BlobKitError(
      BlobKitErrorCode.KZG_ERROR,
      `Failed to compute KZG commitment: ${error}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Compute KZG proofs for a blob, returns array of hex proof strings
 */
export function computeKzgProofs(blob: Uint8Array, commitment: Uint8Array, version: BlobVersion = '4844'): string[] {
  const kzg = requireKzg();

  if (blob.length !== BLOB_SIZE) {
    throw new BlobKitError(
      BlobKitErrorCode.INVALID_PAYLOAD,
      `Invalid blob size: expected ${BLOB_SIZE}, got ${blob.length}`
    );
  }

  const hexBlob = '0x' + Buffer.from(blob).toString('hex');
  const hexCommitment = '0x' + Buffer.from(commitment).toString('hex');

  if (version === '7594') {
    const result = kzg.computeCellsAndKZGProofs(hexBlob);
    return result.proofs.map(proofHex => proofHex.toLowerCase());
    // Special handling for version 7594
  }

  try {
    // kzg-wasm expects hex strings
    
    const resultHex = kzg.computeBlobKZGProof(hexBlob, hexCommitment);
    return [resultHex.toLowerCase()];
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


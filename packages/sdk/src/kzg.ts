/**
 * Production KZG implementation using c-kzg library
 * This module provides EIP-4844 compatible KZG commitments and proofs
 */

//import * as kzg from 'c-kzg';
import * as wkzg from 'kzg-wasm';
import { BlobKitError, BlobKitErrorCode } from './types.js';
import { TrustedSetup } from 'kzg-wasm';
import { hexToBytes, bytesToHex } from './utils.js';

// EIP-4844 constants
export const FIELD_ELEMENTS_PER_BLOB = 4096;
export const BYTES_PER_FIELD_ELEMENT = 31;
export const BLOB_SIZE = 131072; // 128KB
export const VERSIONED_HASH_VERSION_KZG = 0x01;

let isSetupLoaded = false;
let kzg: {
    loadTrustedSetup: (trustedSetup?: TrustedSetup) => number;
    freeTrustedSetup: () => void;
    blobToKZGCommitment: (blob: string) => string;
    computeBlobKZGProof: (blob: string, commitment: string) => string;
    verifyBlobKZGProofBatch: (blobs: string[], commitments: string[], proofs: string[]) => boolean;
    verifyKZGProof: (commitment: string, z: string, y: string, proof: string) => boolean;
    verifyBlobKZGProof: (blob: string, commitment: string, proof: string) => boolean;
};


// Constants from the C implementation
const BYTES_PER_G1 = 48;
const BYTES_PER_G2 = 96;
const NUM_G1_POINTS = 4096; 
const NUM_G2_POINTS = 65;

export async function parseTrustedSetupFile(filePath: string): Promise<TrustedSetup> {
    const fs = await import('fs');
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split(/\s+/);
    let index = 0;

    // Read the number of g1 points
    const numG1Points = parseInt(lines[index++], 10);
    if (numG1Points !== NUM_G1_POINTS) {
        throw new Error(`Expected ${NUM_G1_POINTS} G1 points, got ${numG1Points}`);
    }

    // Read the number of g2 points
    const numG2Points = parseInt(lines[index++], 10);
    if (numG2Points !== NUM_G2_POINTS) {
        throw new Error(`Expected ${NUM_G2_POINTS} G2 points, got ${numG2Points}`);
    }

    // Read all G1 points (hex bytes)
    let g1Hex = '';
    for (let i = 0; i < NUM_G1_POINTS * BYTES_PER_G1; i++) {
        const hexByte = lines[index++];
        if (!hexByte || hexByte.length !== 2) {
            throw new Error(`Invalid hex byte at G1 position ${i}: ${hexByte}`);
        }
        g1Hex += hexByte;
    }

    // Read all G2 points (hex bytes)
    let g2Hex = '';
    for (let i = 0; i < NUM_G2_POINTS * BYTES_PER_G2; i++) {
        const hexByte = lines[index++];
        if (!hexByte || hexByte.length !== 2) {
            throw new Error(`Invalid hex byte at G2 position ${i}: ${hexByte}`);
        }
        g2Hex += hexByte;
    }

    return {
        g1: g1Hex,
        n1: NUM_G1_POINTS,
        g2: g2Hex,
        n2: NUM_G2_POINTS,
    };
}




/**
 * Initialize KZG with trusted setup
 * Must be called before any KZG operations
 */
export async function initializeKzg(): Promise<void> {
  if (isSetupLoaded) {
    return;
  }

  try {
    // Get trusted setup path from environment or use testnet setup for development
    const trustedSetupPath = process.env.BLOBKIT_KZG_TRUSTED_SETUP_PATH;
    
    if (!trustedSetupPath) {
      // For development/testing, we'll create a minimal testnet setup
      // In production, this must be set to the official Ethereum trusted setup
      throw new BlobKitError(
        BlobKitErrorCode.KZG_ERROR,
        'BLOBKIT_KZG_TRUSTED_SETUP_PATH environment variable must be set. ' +
        'Download the official trusted setup from https://github.com/ethereum/c-kzg-4844/tree/main/src and set the path.'
      );
    }

    // Validate that the file exists
    try {
      const fs = await import('fs');
      await fs.promises.access(trustedSetupPath, fs.constants.F_OK);
    } catch {
      throw new BlobKitError(
        BlobKitErrorCode.KZG_ERROR,
        `Trusted setup file not found at path: ${trustedSetupPath}`
      );
    }
    const trustedSetup = await parseTrustedSetupFile(trustedSetupPath);
    kzg = await wkzg.loadKZG(trustedSetup);
    //kzg.loadTrustedSetup(trustedSetupPath);
    isSetupLoaded = true;
  } catch (error) {
    if (error instanceof BlobKitError) {
      throw error;
    }
    throw new BlobKitError(
      BlobKitErrorCode.KZG_ERROR,
      'Failed to initialize KZG trusted setup',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Encode data into EIP-4844 blob format
 * @param data Raw data to encode
 * @returns Encoded blob data (128KB)
 */
export function encodeBlob(data: Uint8Array): Uint8Array {
  if (!data || data.length === 0) {
    throw new BlobKitError(BlobKitErrorCode.INVALID_PAYLOAD, 'Data cannot be empty');
  }

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
 * Create KZG commitment for a blob
 * @param blob Blob data (must be 128KB)
 * @returns KZG commitment as bytes
 */
export function blobToKzgCommitment(blob: Uint8Array): Uint8Array {
  if (!isSetupLoaded) {
    throw new BlobKitError(BlobKitErrorCode.KZG_ERROR, 'KZG not initialized. Call initializeKzg() first.');
  }

  if (blob.length !== BLOB_SIZE) {
    throw new BlobKitError(
      BlobKitErrorCode.INVALID_PAYLOAD,
      `Invalid blob size: expected ${BLOB_SIZE}, got ${blob.length}`
    );
  }

  try {
    return hexToBytes(kzg.blobToKZGCommitment(bytesToHex(blob)));
  } catch (error) {
    throw new BlobKitError(
      BlobKitErrorCode.KZG_ERROR,
      'Failed to compute KZG commitment',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Compute KZG proof for a blob
 * @param blob Blob data (must be 128KB)
 * @param commitment KZG commitment
 * @returns KZG proof as bytes
 */
export function computeKzgProof(blob: Uint8Array, commitment: Uint8Array): Uint8Array {
  if (!isSetupLoaded) {
    throw new BlobKitError(BlobKitErrorCode.KZG_ERROR, 'KZG not initialized. Call initializeKzg() first.');
  }

  if (blob.length !== BLOB_SIZE) {
    throw new BlobKitError(
      BlobKitErrorCode.INVALID_PAYLOAD,
      `Invalid blob size: expected ${BLOB_SIZE}, got ${blob.length}`
    );
  }

  try {
    return hexToBytes(kzg.computeBlobKZGProof(bytesToHex(blob), bytesToHex(commitment)));
  } catch (error) {
    throw new BlobKitError(
      BlobKitErrorCode.KZG_ERROR,
      'Failed to compute KZG proof',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Verify KZG proof
 * @param blob Blob data
 * @param commitment KZG commitment
 * @param proof KZG proof
 * @returns True if proof is valid
 */
export function verifyKzgProof(blob: Uint8Array, commitment: Uint8Array, proof: Uint8Array): boolean {
  if (!isSetupLoaded) {
    throw new BlobKitError(BlobKitErrorCode.KZG_ERROR, 'KZG not initialized. Call initializeKzg() first.');
  }

  try {
    return kzg.verifyBlobKZGProof(bytesToHex(blob), bytesToHex(commitment), bytesToHex(proof));
  } catch (error) {
    throw new BlobKitError(
      BlobKitErrorCode.KZG_ERROR,
      'Failed to verify KZG proof',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Convert KZG commitment to versioned hash (blob hash)
 * @param commitment KZG commitment
 * @returns Versioned hash for use as blob hash
 */
export async function commitmentToVersionedHash(commitment: Uint8Array): Promise<Uint8Array> {
  if (commitment.length !== 48) {
    throw new BlobKitError(
      BlobKitErrorCode.INVALID_PAYLOAD,
      `Invalid commitment size: expected 48 bytes, got ${commitment.length}`
    );
  }

  // Compute SHA-256 hash of commitment
  const crypto = globalThis.crypto || (await import('node:crypto')).webcrypto;
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', commitment);
  const hashArray = new Uint8Array(hashBuffer);
  // Set version byte
  hashArray[0] = VERSIONED_HASH_VERSION_KZG;
  return hashArray;
}


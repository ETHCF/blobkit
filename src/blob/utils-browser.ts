import { keccak256 } from 'ethers';
import { BlobKitError } from '../types';
import { FIELD_ELEMENTS_PER_BLOB, BYTES_PER_FIELD_ELEMENT } from '../kzg/constants';

export const BLOB_SIZE = 131072;

/**
 * Encodes data into EIP-4844 blob format.
 * 
 * Format: 4096 field elements of 32 bytes each, first byte must be 0,
 * only 31 bytes per field element contain data.
 * 
 * Note: Browser version does not support compression to maintain sync API.
 * For compression, pre-compress your data before passing to encodeBlob.
 * 
 * @param data - Raw data to encode
 * @param shouldCompress - Ignored in browser (no compression)
 * @returns Encoded blob data
 */
export async function encodeBlob(data: Uint8Array, shouldCompress = true): Promise<Uint8Array> {
  if (!data || data.length === 0) {
    throw new BlobKitError('Data cannot be empty', 'EMPTY_DATA');
  }

  // Browser version: no compression to keep API synchronous
  if (shouldCompress) {
    console.warn('BlobKit: Compression not supported in browser. Data will be stored uncompressed.');
  }

  const encoded = data;
  // Size validation moved to BlobWriter to allow for future chunking support

  // Pre-allocate blob buffer
  const blob = new Uint8Array(BLOB_SIZE);

  // Pack data into field elements efficiently
  for (let i = 0; i < FIELD_ELEMENTS_PER_BLOB; i++) {
    const fieldStart = i * 32;
    const dataStart = i * BYTES_PER_FIELD_ELEMENT;
    const dataEnd = Math.min(dataStart + BYTES_PER_FIELD_ELEMENT, encoded.length);

    // First byte must be 0 for field element validity
    blob[fieldStart] = 0;

    // Copy data chunk if available
    if (dataStart < encoded.length) {
      blob.set(encoded.subarray(dataStart, dataEnd), fieldStart + 1);
    }
  }

  return blob;
}

/**
 * Decodes blob data back to original format.
 * 
 * Note: Browser version does not support decompression.
 * 
 * @param blob - Encoded blob data
 * @param compressed - Ignored in browser (no decompression)
 * @returns Decoded original data
 */
export async function decodeBlob(blob: Uint8Array, _compressed = true): Promise<Uint8Array> {
  if (!blob) {
    throw new BlobKitError('Blob data cannot be null', 'NULL_BLOB');
  }

  if (blob.length !== BLOB_SIZE) {
    throw new BlobKitError(
      `Invalid blob size: expected ${BLOB_SIZE}, got ${blob.length}`,
      'INVALID_BLOB_SIZE'
    );
  }

  // Pre-allocate data buffer
  const maxDataSize = FIELD_ELEMENTS_PER_BLOB * BYTES_PER_FIELD_ELEMENT;
  const data = new Uint8Array(maxDataSize);
  let writeIndex = 0;

  // Extract data from field elements
  for (let i = 0; i < FIELD_ELEMENTS_PER_BLOB; i++) {
    const fieldStart = i * 32;
    
    // Verify first byte is 0
    if (blob[fieldStart] !== 0) {
      throw new BlobKitError(
        `Invalid field element ${i}: first byte must be 0`,
        'INVALID_FIELD_ELEMENT'
      );
    }

    // Extract 31 bytes of data
    const chunkStart = fieldStart + 1;
    const chunk = blob.subarray(chunkStart, chunkStart + BYTES_PER_FIELD_ELEMENT);
    data.set(chunk, writeIndex);
    writeIndex += BYTES_PER_FIELD_ELEMENT;
  }

  // Trim trailing zeros efficiently
  let actualLength = data.length;
  while (actualLength > 0 && data[actualLength - 1] === 0) {
    actualLength--;
  }

  return data.subarray(0, actualLength);
}

/**
 * Computes SHA-256 hash of data for content verification.
 * 
 * @param data - Data to hash
 * @returns Hex-encoded hash string
 */
export function computeContentHash(data: Uint8Array): string {
  if (!data) {
    throw new BlobKitError('Data cannot be null for hashing', 'NULL_DATA');
  }

  try {
    return keccak256(data);
  } catch (error) {
    throw new BlobKitError('Failed to compute content hash', 'HASH_ERROR', error);
  }
}
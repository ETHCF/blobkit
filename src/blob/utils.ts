import { keccak256 } from 'ethers';
import { compress, decompress } from 'brotli';
import { BlobKitError } from '../types';
import { FIELD_ELEMENTS_PER_BLOB, BYTES_PER_FIELD_ELEMENT } from '../kzg/constants';

export const BLOB_SIZE = 131072;

/**
 * Encodes data into EIP-4844 blob format.
 * 
 * Format: 4096 field elements of 32 bytes each, first byte must be 0,
 * only 31 bytes per field element contain data.
 */
export function encodeBlob(data: Uint8Array, shouldCompress = true): Uint8Array {
  let encoded = data;

  if (shouldCompress) {
    const compressed = compress(Buffer.from(data), {
      mode: 0,
      quality: 3,
      lgwin: 22
    });

    if (!compressed) {
      throw new BlobKitError('Compression failed', 'COMPRESSION_ERROR');
    }

    encoded = new Uint8Array(compressed);
  }

  const maxSize = FIELD_ELEMENTS_PER_BLOB * BYTES_PER_FIELD_ELEMENT;
  if (encoded.length > maxSize) {
    throw new BlobKitError(
      `Data too large: ${encoded.length} bytes (max ${maxSize})`,
      'DATA_TOO_LARGE'
    );
  }

  const blob = new Uint8Array(BLOB_SIZE);

  // Pack data into field elements
  for (let i = 0; i < FIELD_ELEMENTS_PER_BLOB; i++) {
    const fieldStart = i * 32;
    const dataStart = i * BYTES_PER_FIELD_ELEMENT;
    const dataEnd = Math.min(dataStart + BYTES_PER_FIELD_ELEMENT, encoded.length);

    // First byte must be 0 for field element validity
    blob[fieldStart] = 0;

    if (dataStart < encoded.length) {
      const chunk = encoded.slice(dataStart, dataEnd);
      blob.set(chunk, fieldStart + 1);
    }
  }

  return blob;
}

export function decodeBlob(blob: Uint8Array, compressed = true): Uint8Array {
  if (blob.length !== BLOB_SIZE) {
    throw new BlobKitError(
      `Invalid blob size: ${blob.length}`,
      'INVALID_BLOB_SIZE'
    );
  }

  const data = new Uint8Array(FIELD_ELEMENTS_PER_BLOB * BYTES_PER_FIELD_ELEMENT);
  let writeIndex = 0;

  for (let i = 0; i < FIELD_ELEMENTS_PER_BLOB; i++) {
    const fieldStart = i * 32 + 1; // Skip first byte
    const chunk = blob.slice(fieldStart, fieldStart + BYTES_PER_FIELD_ELEMENT);
    data.set(chunk, writeIndex);
    writeIndex += BYTES_PER_FIELD_ELEMENT;
  }

  // Trim trailing zeros
  let actualLength = data.length;
  while (actualLength > 0 && data[actualLength - 1] === 0) {
    actualLength--;
  }

  const trimmed = data.slice(0, actualLength);

  if (compressed) {
    const decompressed = decompress(Buffer.from(trimmed));
    if (!decompressed) {
      throw new BlobKitError('Decompression failed', 'DECOMPRESSION_ERROR');
    }
    return new Uint8Array(decompressed);
  }

  return trimmed;
}

export function computeContentHash(data: Uint8Array): string {
  return keccak256(data);
}

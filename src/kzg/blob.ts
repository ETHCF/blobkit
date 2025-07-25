import { bls12_381 as bls } from '@noble/curves/bls12-381';
import { BlobKitError } from '../types';
import {
  FIELD_ELEMENTS_PER_BLOB,
  BYTES_PER_BLOB
} from './constants';

/**
 * Convert a blob to field elements.
 * Each field element is 32 bytes with the first byte set to 0.
 */
export function blobToFieldElements(blob: Uint8Array): bigint[] {
  if (blob.length !== BYTES_PER_BLOB) {
    throw new BlobKitError(
      `Invalid blob size: expected ${BYTES_PER_BLOB}, got ${blob.length}`,
      'INVALID_BLOB_SIZE'
    );
  }

  const fieldElements: bigint[] = [];

  for (let i = 0; i < FIELD_ELEMENTS_PER_BLOB; i++) {
    const chunk = blob.slice(i * 32, (i + 1) * 32);

    // First byte must be 0 to ensure value < BLS field modulus
    if (chunk[0] !== 0) {
      throw new BlobKitError(
        `Field element ${i}: first byte must be 0`,
        'INVALID_FIELD_ELEMENT'
      );
    }

    // Convert bytes to bigint (big-endian)
    let value = 0n;
    for (let j = 0; j < 32; j++) {
      value = (value << 8n) | BigInt(chunk[j]);
    }

    // Sanity check - should never happen with first byte = 0
    if (value >= bls.fields.Fr.ORDER) {
      throw new BlobKitError(
        `Field element ${i} exceeds modulus`,
        'FIELD_OVERFLOW'
      );
    }

    fieldElements.push(value);
  }

  return fieldElements;
}

/**
 * Evaluate polynomial at x using Horner's method.
 * More efficient than computing each power separately.
 */
export function evaluatePolynomial(
  coefficients: bigint[],
  x: bigint,
  Fr: any
): bigint {
  let result = Fr.ZERO;

  // Start from highest degree coefficient
  for (let i = coefficients.length - 1; i >= 0; i--) {
    result = Fr.mul(result, x);
    result = Fr.add(result, coefficients[i]);
  }

  return result;
}

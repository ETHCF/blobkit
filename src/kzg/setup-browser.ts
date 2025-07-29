import { bls12_381 as bls } from '@noble/curves/bls12-381';
import { BlobKitError } from '../types';
import { TrustedSetup } from './types';
import { FIELD_ELEMENTS_PER_BLOB } from './constants';
import { Fr } from './field';

type G1Point = ReturnType<typeof bls.G1.Point.fromHex>;
type G2Point = ReturnType<typeof bls.G2.Point.fromHex>;

/**
 * Browser-only version: Load trusted setup from binary data.
 * File paths are not supported in browser environments.
 */
export async function loadTrustedSetupFromBinary(g1Data: Uint8Array, g2Data: Uint8Array): Promise<TrustedSetup> {
  // Validate sizes first before attempting to parse points
  const g1PointSize = 48;
  const g2PointSize = 96;
  const expectedG1Size = 4096 * g1PointSize; // 196608
  const expectedG2Size = 2 * g2PointSize; // 192

  if (g1Data.length !== expectedG1Size) {
    throw new BlobKitError(
      `Expected ${expectedG1Size} bytes, got ${g1Data.length}`,
      'INVALID_SIZE'
    );
  }

  if (g2Data.length !== expectedG2Size) {
    throw new BlobKitError(
      `Expected ${expectedG2Size} bytes, got ${g2Data.length}`,
      'INVALID_SIZE'
    );
  }

  const g1Powers = parseG1Points(g1Data, 4096);
  const g2Powers = parseG2Points(g2Data, 2);

  validateSetup(g1Powers, g2Powers);
  return { g1Powers, g2Powers };
}

/**
 * Browser-only version: Load trusted setup from text data.
 * File paths are not supported in browser environments.
 */
export async function loadTrustedSetupFromText(g1Data: Uint8Array, g2Data: Uint8Array): Promise<TrustedSetup> {
  let g1Text: string, g2Text: string;

  // Safe TextDecoder with error handling
  try {
    g1Text = new TextDecoder('utf-8', { fatal: true }).decode(g1Data);
    g2Text = new TextDecoder('utf-8', { fatal: true }).decode(g2Data);
  } catch (e) {
    throw new BlobKitError(
      'Invalid UTF-8 encoding in trusted setup text files',
      'INVALID_ENCODING',
      e
    );
  }

  const g1Lines = g1Text.trim().split('\n').filter(Boolean);
  const g2Lines = g2Text.trim().split('\n').filter(Boolean);

  if (g1Lines.length !== 4096) {
    throw new BlobKitError(
      `Expected 4096 G1 points, got ${g1Lines.length}`,
      'INVALID_TRUSTED_SETUP'
    );
  }

  if (g2Lines.length !== 2) {
    throw new BlobKitError(
      `Expected 2 G2 points, got ${g2Lines.length}`,
      'INVALID_TRUSTED_SETUP'
    );
  }

  const g1Powers = g1Lines.map((hex, i) => {
    try {
      return bls.G1.Point.fromHex(hex.trim());
    } catch (e) {
      throw new BlobKitError(
        `Invalid G1 point at line ${i + 1}`,
        'INVALID_POINT',
        e
      );
    }
  });

  const g2Powers = g2Lines.map((hex, i) => {
    try {
      return bls.G2.Point.fromHex(hex.trim());
    } catch (e) {
      throw new BlobKitError(
        `Invalid G2 point at line ${i + 1}`,
        'INVALID_POINT',
        e
      );
    }
  });

  validateSetup(g1Powers, g2Powers);
  return { g1Powers, g2Powers };
}

/**
 * Create a mock trusted setup for testing.
 * DO NOT use in production - tau is known!
 */
export function createMockSetup(): TrustedSetup {
  const tau = 12345n;
  const g1Powers: G1Point[] = [];
  const g2Powers: G2Point[] = [];

  let power = Fr.ONE;
  for (let i = 0; i < FIELD_ELEMENTS_PER_BLOB; i++) {
    g1Powers.push(bls.G1.Point.BASE.multiply(power));
    if (i < 2) {
      g2Powers.push(bls.G2.Point.BASE.multiply(power));
    }
    power = Fr.mul(power, tau);
  }

  return { g1Powers, g2Powers };
}

function parseG1Points(data: Uint8Array, count: number): G1Point[] {
  const pointSize = 48;
  if (data.length !== count * pointSize) {
    throw new BlobKitError(
      `Expected ${count * pointSize} bytes, got ${data.length}`,
      'INVALID_SIZE'
    );
  }

  const points: G1Point[] = [];
  for (let i = 0; i < count; i++) {
    const start = i * pointSize;
    const pointData = data.subarray(start, start + pointSize);
    
    // Memory-efficient hex conversion
    let hexString = '0x';
    for (let j = 0; j < pointData.length; j++) {
      hexString += pointData[j].toString(16).padStart(2, '0');
    }
    
    try {
      points.push(bls.G1.Point.fromHex(hexString));
    } catch (e) {
      throw new BlobKitError(
        `Invalid G1 point at index ${i}`,
        'INVALID_POINT',
        e
      );
    }
  }
  return points;
}

function parseG2Points(data: Uint8Array, count: number): G2Point[] {
  const pointSize = 96;
  if (data.length !== count * pointSize) {
    throw new BlobKitError(
      `Expected ${count * pointSize} bytes, got ${data.length}`,
      'INVALID_SIZE'
    );
  }

  const points: G2Point[] = [];
  for (let i = 0; i < count; i++) {
    const start = i * pointSize;
    const pointData = data.subarray(start, start + pointSize);
    
    // Memory-efficient hex conversion
    let hexString = '0x';
    for (let j = 0; j < pointData.length; j++) {
      hexString += pointData[j].toString(16).padStart(2, '0');
    }
    
    try {
      points.push(bls.G2.Point.fromHex(hexString));
    } catch (e) {
      throw new BlobKitError(
        `Invalid G2 point at index ${i}`,
        'INVALID_POINT',
        e
      );
    }
  }
  return points;
}

function validateSetup(g1Powers: G1Point[], g2Powers: G2Point[]): void {
  // First elements should be generators
  if (!g1Powers[0].equals(bls.G1.Point.BASE)) {
    throw new BlobKitError('First G1 power must be generator', 'INVALID_SETUP');
  }

  if (!g2Powers[0].equals(bls.G2.Point.BASE)) {
    throw new BlobKitError('First G2 power must be generator', 'INVALID_SETUP');
  }
}
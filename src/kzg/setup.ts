import { readFile } from 'fs/promises';
import { bls12_381 as bls } from '@noble/curves/bls12-381';
import { BlobKitError } from '../types';
import { TrustedSetup } from './types';
import { FIELD_ELEMENTS_PER_BLOB } from './constants';
import { Fr } from './field';

type G1Point = ReturnType<typeof bls.G1.Point.fromHex>;
type G2Point = ReturnType<typeof bls.G2.Point.fromHex>;

/**
 * Load trusted setup from binary files.
 * G1: 4096 points * 48 bytes = 196,608 bytes
 * G2: 2 points * 96 bytes = 192 bytes
 */
export async function loadTrustedSetupFromBinary(
  g1Path: string,
  g2Path: string
): Promise<TrustedSetup> {
  const g1Data = await readFile(g1Path);
  const g2Data = await readFile(g2Path);

  const g1Powers = parseG1Points(g1Data, 4096);
  const g2Powers = parseG2Points(g2Data, 2);

  validateSetup(g1Powers, g2Powers);
  return { g1Powers, g2Powers };
}

/**
 * Load trusted setup from text files (hex strings, one per line).
 */
export async function loadTrustedSetupFromText(
  g1Path: string,
  g2Path: string
): Promise<TrustedSetup> {
  const g1Text = await readFile(g1Path, 'utf-8');
  const g2Text = await readFile(g2Path, 'utf-8');

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

function parseG1Points(data: Buffer, count: number): G1Point[] {
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
    points.push(bls.G1.Point.fromHex(pointData));
  }
  return points;
}

function parseG2Points(data: Buffer, count: number): G2Point[] {
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
    points.push(bls.G2.Point.fromHex(pointData));
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

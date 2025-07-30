import { bls12_381 as bls } from '@noble/curves/bls12-381';
import { BlobKitError } from '../types';
import { TrustedSetup } from './types';
import { FIELD_ELEMENTS_PER_BLOB } from './constants';
import { Fr } from './field';
import { isNode, getNodeFs } from '../utils/environment';

type G1Point = ReturnType<typeof bls.G1.Point.fromHex>;
type G2Point = ReturnType<typeof bls.G2.Point.fromHex>;

/**
 * Load trusted setup from binary files or data.
 * G1: 4096 points * 48 bytes = 196,608 bytes
 * G2: 2 points * 96 bytes = 192 bytes
 */
export async function loadTrustedSetupFromBinary(g1Path: string, g2Path: string): Promise<TrustedSetup>;
export async function loadTrustedSetupFromBinary(g1Data: Uint8Array, g2Data: Uint8Array): Promise<TrustedSetup>;
export async function loadTrustedSetupFromBinary(
  g1Source: string | Uint8Array,
  g2Source: string | Uint8Array
): Promise<TrustedSetup> {
  let g1Data: Buffer | Uint8Array, g2Data: Buffer | Uint8Array;

  if (typeof g1Source === 'string') {
    // Only attempt file operations in Node.js
    if (isNode()) {
      const fs = await getNodeFs();
      if (!fs) {
        throw new BlobKitError('Node.js fs module not available', 'FS_NOT_AVAILABLE');
      }
      
      try {
        g1Data = await fs.readFile(g1Source);
        g2Data = await fs.readFile(g2Source as string);
      } catch (e) {
        throw new BlobKitError('Failed to read files', 'FILE_READ_ERROR', e);
      }
    } else {
      throw new BlobKitError('File paths not supported in browser environment. Use Uint8Array data instead.', 'BROWSER_FILE_ERROR');
    }
  } else {
    // Browser raw data
    g1Data = g1Source;
    g2Data = g2Source as Uint8Array;
  }

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
 * Load trusted setup from text files or data.
 */
export async function loadTrustedSetupFromText(g1Path: string, g2Path: string): Promise<TrustedSetup>;
export async function loadTrustedSetupFromText(g1Data: Uint8Array, g2Data: Uint8Array): Promise<TrustedSetup>;
export async function loadTrustedSetupFromText(
  g1Source: string | Uint8Array,
  g2Source: string | Uint8Array
): Promise<TrustedSetup> {
  let g1Text: string, g2Text: string;

  if (typeof g1Source === 'string') {
    // Only attempt file operations in Node.js
    if (isNode()) {
      const fs = await getNodeFs();
      if (!fs) {
        throw new BlobKitError('Node.js fs module not available', 'FS_NOT_AVAILABLE');
      }
      
      try {
        g1Text = await fs.readFile(g1Source, 'utf-8');
        g2Text = await fs.readFile(g2Source as string, 'utf-8');
      } catch (e) {
        throw new BlobKitError('Failed to read files', 'FILE_READ_ERROR', e);
      }
    } else {
      throw new BlobKitError('File paths not supported in browser environment. Use Uint8Array data instead.', 'BROWSER_FILE_ERROR');
    }
  } else {
    // Safe TextDecoder with error handling
    try {
      g1Text = new TextDecoder('utf-8', { fatal: true }).decode(g1Source);
      g2Text = new TextDecoder('utf-8', { fatal: true }).decode(g2Source as Uint8Array);
    } catch (e) {
      throw new BlobKitError(
        'Invalid UTF-8 encoding in trusted setup text files',
        'INVALID_ENCODING',
        e
      );
    }
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
      // Remove 0x prefix if present
      const cleanHex = hex.trim().replace(/^0x/i, '');
      return bls.G1.Point.fromHex(cleanHex);
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
      // Remove 0x prefix if present
      const cleanHex = hex.trim().replace(/^0x/i, '');
      return bls.G2.Point.fromHex(cleanHex);
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

function parseG1Points(data: Buffer | Uint8Array, count: number): G1Point[] {
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

function parseG2Points(data: Buffer | Uint8Array, count: number): G2Point[] {
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
  // Basic validation - just check we have the right number of points
  if (g1Powers.length !== 4096) {
    throw new BlobKitError(
      `Invalid G1 powers count: expected 4096, got ${g1Powers.length}`,
      'INVALID_SETUP'
    );
  }

  if (g2Powers.length !== 2) {
    throw new BlobKitError(
      `Invalid G2 powers count: expected 2, got ${g2Powers.length}`,
      'INVALID_SETUP'
    );
  }

  // The official trusted setup does NOT start with the generator
  // It starts with g^tau^0, g^tau^1, etc. where g is the generator
  // and tau is the secret value from the ceremony
}
import { bls12_381 as bls } from '@noble/curves/bls12-381';
import { sha256 } from '@noble/hashes/sha2';
import { BlobKitError } from '../types';
import { TrustedSetup, KZGProof } from './types';
import { VERSIONED_HASH_VERSION_KZG } from './constants';
import { Fr } from './field';
import { blobToFieldElements, evaluatePolynomial } from './blob';

let trustedSetup: TrustedSetup | null = null;

export function loadTrustedSetup(setup: TrustedSetup): void {
  trustedSetup = setup;
}

export function getTrustedSetup(): TrustedSetup | null {
  return trustedSetup;
}

/**
 * Creates a KZG commitment to a blob.
 * Computes C = sum(blob[i] * G1[i])
 */
export async function blobToKZGCommitment(blob: Uint8Array): Promise<Uint8Array> {
  if (!trustedSetup) {
    throw new BlobKitError('Trusted setup not loaded', 'NO_TRUSTED_SETUP');
  }

  const coefficients = blobToFieldElements(blob);
  let commitment = bls.G1.ProjectivePoint.ZERO;

  for (let i = 0; i < coefficients.length; i++) {
    if (coefficients[i] === Fr.ZERO) continue;

    const term = trustedSetup.g1Powers[i].multiply(coefficients[i]);
    commitment = commitment.add(term);
  }

  return commitment.toRawBytes(true);
}

/**
 * Compute KZG proof that polynomial evaluates to y at z.
 */
export async function computeKZGProof(
  blob: Uint8Array,
  z: bigint
): Promise<KZGProof> {
  if (!trustedSetup) {
    throw new BlobKitError('Trusted setup not loaded', 'NO_TRUSTED_SETUP');
  }

  const coefficients = blobToFieldElements(blob);
  const y = evaluatePolynomial(coefficients, z, Fr);

  // Compute quotient polynomial: q(x) = (p(x) - y) / (x - z)
  const quotient = computeQuotient(coefficients, z, y);

  let proof = bls.G1.ProjectivePoint.ZERO;
  for (let i = 0; i < quotient.length; i++) {
    if (quotient[i] === Fr.ZERO) continue;

    const term = trustedSetup.g1Powers[i].multiply(quotient[i]);
    proof = proof.add(term);
  }

  return {
    proof: proof.toRawBytes(true),
    claimedValue: y
  };
}

/**
 * Verify KZG proof: e(C - y*G1, G2) = e(π, G2_τ - z*G2)
 */
export async function verifyKZGProof(
  commitment: Uint8Array,
  z: bigint,
  y: bigint,
  proof: Uint8Array
): Promise<boolean> {
  if (!trustedSetup) {
    throw new BlobKitError('Trusted setup not loaded', 'NO_TRUSTED_SETUP');
  }

  try {
    const C = bls.G1.ProjectivePoint.fromHex(commitment);
    const pi = bls.G1.ProjectivePoint.fromHex(proof);

    const G1 = trustedSetup.g1Powers[0];
    const G2 = trustedSetup.g2Powers[0];
    const G2_tau = trustedSetup.g2Powers[1];

    // Handle edge cases for y=0 or z=0
    const C_minus_yG1 = y === Fr.ZERO ? C : C.subtract(G1.multiply(y));
    const G2_tau_minus_zG2 = z === Fr.ZERO ? G2_tau : G2_tau.subtract(G2.multiply(z));

    const leftIsZero = C_minus_yG1.equals(bls.G1.ProjectivePoint.ZERO);
    const rightIsZero = pi.equals(bls.G1.ProjectivePoint.ZERO);
    
    if (leftIsZero && rightIsZero) return true;
    if (leftIsZero || rightIsZero) return false;

    const pairing1 = bls.pairing(C_minus_yG1, G2);
    const pairing2 = bls.pairing(pi, G2_tau_minus_zG2);

    return pairing1.toString() === pairing2.toString();
  } catch {
    return false;
  }
}

export function commitmentToVersionedHash(commitment: Uint8Array): Uint8Array {
  const hash = sha256(commitment);
  hash[0] = VERSIONED_HASH_VERSION_KZG;
  return hash;
}

/**
 * Polynomial division: (p(x) - y) / (x - z) using synthetic division
 */
function computeQuotient(coefficients: bigint[], z: bigint, y: bigint): bigint[] {
  const dividend = [...coefficients];
  dividend[0] = Fr.sub(dividend[0], y);

  let degree = dividend.length - 1;
  while (degree > 0 && dividend[degree] === Fr.ZERO) {
    degree--;
  }

  if (degree === 0) {
    if (dividend[0] !== Fr.ZERO) {
      throw new BlobKitError('Polynomial division failed', 'DIVISION_ERROR');
    }
    return new Array(coefficients.length - 1).fill(Fr.ZERO);
  }

  const quotient: bigint[] = new Array(coefficients.length - 1).fill(Fr.ZERO);
  const work = dividend.slice(0, degree + 1);
  
  for (let i = degree; i >= 1; i--) {
    quotient[i - 1] = work[i];
    work[i - 1] = Fr.sub(work[i - 1], Fr.mul(work[i], z));
  }

  if (work[0] !== Fr.ZERO) {
    throw new BlobKitError('Polynomial division failed', 'DIVISION_ERROR');
  }

  return quotient;
}

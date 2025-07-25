import { bls12_381 as bls } from '@noble/curves/bls12-381';

// Convenience wrapper for field arithmetic in Fr
export const Fr = {
  add: (a: bigint, b: bigint): bigint => bls.fields.Fr.add(a, b),
  sub: (a: bigint, b: bigint): bigint => bls.fields.Fr.sub(a, b),
  mul: (a: bigint, b: bigint): bigint => bls.fields.Fr.mul(a, b),
  div: (a: bigint, b: bigint): bigint => bls.fields.Fr.div(a, b),
  neg: (a: bigint): bigint => bls.fields.Fr.neg(a),
  inv: (a: bigint): bigint => bls.fields.Fr.inv(a),
  pow: (a: bigint, n: bigint): bigint => bls.fields.Fr.pow(a, n),
  ZERO: bls.fields.Fr.ZERO,
  ONE: bls.fields.Fr.ONE
} as const;

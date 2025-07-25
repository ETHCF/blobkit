// Just use BlobKitError from main types

// Avoiding circular deps - these are the actual point types from noble
export type G1Point = any;
export type G2Point = any;

export interface TrustedSetup {
  g1Powers: G1Point[];
  g2Powers: G2Point[];
}

export interface KZGProof {
  proof: Uint8Array;
  claimedValue: bigint;
}

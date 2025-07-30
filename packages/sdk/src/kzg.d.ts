/**
 * Production KZG implementation using c-kzg library
 * This module provides EIP-4844 compatible KZG commitments and proofs
 */
export declare const FIELD_ELEMENTS_PER_BLOB = 4096;
export declare const BYTES_PER_FIELD_ELEMENT = 31;
export declare const BLOB_SIZE = 131072;
export declare const VERSIONED_HASH_VERSION_KZG = 1;
/**
 * Initialize KZG with trusted setup
 * Must be called before any KZG operations
 */
export declare function initializeKzg(): Promise<void>;
/**
 * Encode data into EIP-4844 blob format
 * @param data Raw data to encode
 * @returns Encoded blob data (128KB)
 */
export declare function encodeBlob(data: Uint8Array): Uint8Array;
/**
 * Create KZG commitment for a blob
 * @param blob Blob data (must be 128KB)
 * @returns KZG commitment as bytes
 */
export declare function blobToKzgCommitment(blob: Uint8Array): Uint8Array;
/**
 * Compute KZG proof for a blob
 * @param blob Blob data (must be 128KB)
 * @param commitment KZG commitment
 * @returns KZG proof as bytes
 */
export declare function computeKzgProof(blob: Uint8Array, commitment: Uint8Array): Uint8Array;
/**
 * Verify KZG proof
 * @param blob Blob data
 * @param commitment KZG commitment
 * @param proof KZG proof
 * @returns True if proof is valid
 */
export declare function verifyKzgProof(blob: Uint8Array, commitment: Uint8Array, proof: Uint8Array): boolean;
/**
 * Convert KZG commitment to versioned hash (blob hash)
 * @param commitment KZG commitment
 * @returns Versioned hash for use as blob hash
 */
export declare function commitmentToVersionedHash(commitment: Uint8Array): Promise<Uint8Array>;
/**
 * Convert bytes to hex string
 * @param bytes Byte array
 * @returns Hex string with 0x prefix
 */
export declare function bytesToHex(bytes: Uint8Array): string;
//# sourceMappingURL=kzg.d.ts.map
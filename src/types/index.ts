/**
 * Metadata associated with blob data.
 */
export interface BlobMeta {
  /** Application identifier */
  appId: string;
  /** MIME type or codec identifier */
  codec: string;
  /** SHA-256 hash of the content */
  contentHash?: string;
  /** Time-to-live in blocks */
  ttlBlocks?: number;
  /** Unix timestamp of creation */
  timestamp?: number;
}

/**
 * Receipt returned after successfully writing a blob.
 */
export interface BlobReceipt {
  /** Transaction hash */
  txHash: string;
  /** Versioned hash of the blob */
  blobHash: string;
  /** Block number where transaction was included */
  blockNumber: number;
  /** Content hash for integrity verification */
  contentHash: string;
}

/**
 * EIP-4844 blob transaction structure.
 */
export interface BlobTransaction {
  /** Recipient address */
  to: string;
  /** Transaction data */
  data: string;
  /** Blob data array */
  blobs: Uint8Array[];
  /** KZG commitments for blobs */
  kzgCommitments: string[];
  /** KZG proofs for commitments */
  kzgProofs: string[];
  /** Maximum fee per blob gas unit */
  maxFeePerBlobGas?: bigint;
  /** Gas limit for transaction */
  gasLimit?: bigint;
}

/**
 * Generic codec interface for data encoding/decoding.
 */
export interface Codec<T = unknown> {
  /** Encode data to bytes */
  encode(data: T): Uint8Array;
  /** Decode bytes to data */
  decode(data: Uint8Array): T;
}

/**
 * Configuration for BlobKit client.
 */
export interface BlobKitConfig {
  /** Ethereum RPC endpoint URL */
  rpcUrl: string;
  /** Chain ID (defaults to 1) */
  chainId?: number;
  /** Archive service URL for historical blob retrieval */
  archiveUrl?: string;
  /** Default codec for data encoding */
  defaultCodec?: string;
  /** Brotli compression level (0-11) */
  compressionLevel?: number;
}

/**
 * Blob data with metadata and optional verification data.
 */
export interface BlobData {
  /** Decoded blob payload */
  data: Uint8Array;
  /** Blob metadata */
  meta: BlobMeta;
  /** Versioned hash of the blob */
  blobHash?: string;
  /** KZG commitment */
  kzgCommitment?: string;
}

/**
 * Custom error class for BlobKit operations.
 */
export class BlobKitError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'BlobKitError';
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, BlobKitError.prototype);
  }
}

/**
 * Type guard for checking if a string is a valid hex string.
 */
export function isValidHexString(value: string, expectedLength?: number): boolean {
  if (!value.startsWith('0x')) return false;
  const hex = value.slice(2);
  if (expectedLength && hex.length !== expectedLength) return false;
  return /^[0-9a-fA-F]*$/.test(hex);
}

/**
 * Type guard for checking if a value is a valid blob hash.
 */
export function isValidBlobHash(value: string): boolean {
  return isValidHexString(value, 64) && value.startsWith('0x01');
}

/**
 * Type guard for checking if a value is a valid transaction hash.
 */
export function isValidTxHash(value: string): boolean {
  return isValidHexString(value, 64);
}

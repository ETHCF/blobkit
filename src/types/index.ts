export interface BlobMeta {
  appId: string;
  codec: string;
  contentHash?: string;
  ttlBlocks?: number;
  timestamp?: number;
}

export interface BlobReceipt {
  txHash: string;
  blobHash: string;
  blockNumber: number;
  contentHash: string;
}

export interface BlobTransaction {
  to: string;
  data: string;
  blobs: Uint8Array[];
  kzgCommitments: string[];
  kzgProofs: string[];
  maxFeePerBlobGas?: bigint;
  gasLimit?: bigint;
}

export interface Codec<T = unknown> {
  encode(data: T): Uint8Array;
  decode(data: Uint8Array): T;
}

export interface BlobKitConfig {
  rpcUrl: string;
  chainId?: number;
  archiveUrl?: string;
  defaultCodec?: string;
  compressionLevel?: number;
}

export interface BlobData {
  data: Uint8Array;
  meta: BlobMeta;
  blobHash?: string;
  kzgCommitment?: string;
}

export class BlobKitError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'BlobKitError';
  }
}

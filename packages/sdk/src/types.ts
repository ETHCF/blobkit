/**
 * BlobKit SDK Types
 * Comprehensive TypeScript types for the BlobKit blob storage SDK
 */

/**
 * Re-export ethers types for compatibility
 */
import type {
  Signer as EthersSigner,
  Provider as EthersProvider,
  TransactionRequest as EthersTransactionRequest,
  TransactionResponse as EthersTransactionResponse,
  TransactionReceipt as EthersTransactionReceipt,
  FeeData as EthersFeeData,
  BytesLike,
  Signature
} from 'ethers';

// Re-export ethers types
export type Signer = EthersSigner & { signRawTransaction(rawTx: BytesLike): Promise<Signature> };
export type Provider = EthersProvider;
export type FeeData = EthersFeeData;
export type TransactionResponse = EthersTransactionResponse;
export type TransactionReceipt = EthersTransactionReceipt;

/**
 * Extended transaction request for blob transactions
 */
export interface TransactionRequest extends EthersTransactionRequest {
  blobs?: Uint8Array[];
  kzgCommitments?: string[];
  kzgProofs?: string[];
  maxFeePerBlobGas?: bigint;
  wrapperVersion?: number;
}

export type BlobTxData = {
  blob: string;
  commitment: string;
  proofs: string[];
  versionedHash: string;
};

export type BlobVersion = '7594' | '4844';

/**
 * Process environment variables required by BlobKit
 */
export interface ProcessEnv {
  readonly NODE_ENV?: 'development' | 'production' | 'test';
  readonly BLOBKIT_ESCROW_1?: string;
  readonly BLOBKIT_ESCROW_11155111?: string;
  readonly BLOBKIT_ESCROW_17000?: string;
  readonly BLOBKIT_RPC_URL?: string;
  readonly BLOBKIT_ARCHIVE_URL?: string;
  readonly BLOBKIT_CHAIN_ID?: string;
  readonly BLOBKIT_PROXY_URL?: string;
  readonly BLOBKIT_LOG_LEVEL?: 'debug' | 'info' | 'silent';
  readonly OVERRIDE_BLOBKIT_ENVIRONMENT?: BlobKitEnvironment;
}

/**
 * Environment types supported by BlobKit
 */
export type BlobKitEnvironment = 'node' | 'browser' | 'serverless';

/**
 * Blob metadata structure for additional context and categorization
 */
export interface BlobMeta {
  /** Application identifier */
  appId: string;
  /** MIME type or codec identifier */
  codec: string;
  /** SHA-256 hash of content */
  readonly contentHash?: string;
  /** Time-to-live in blocks */
  readonly ttlBlocks?: number;
  /** Unix timestamp of creation */
  readonly timestamp?: number;
  /** Optional filename for display */
  readonly filename?: string;
  /** Optional content type hint */
  readonly contentType?: string;
  /** Optional categorization tags */
  readonly tags?: string[];
}


/**
 * Metrics hooks for monitoring
 */
export interface MetricsHooks {
  onBlobWrite?: (size: number, duration: number, success: boolean) => void;
  onBlobRead?: (size: number, duration: number, success: boolean, source: string) => void;
  onProxyRequest?: (url: string, duration: number, success: boolean) => void;
  onKzgOperation?: (operation: string, duration: number, success: boolean) => void;
  onError?: (error: Error, context: string) => void;
}

/**
 * Enhanced configuration for BlobKit instances
 */
export interface BlobKitConfig {
  // Core configuration
  rpcUrl: string;
  chainId?: number;
  archiveUrl?: string;
  defaultCodec?: string;

  txTimeoutMs?: number;

  // Proxy configuration
  proxyUrl?: string;
  escrowContract?: string;
  maxProxyFeePercent?: number;
  callbackUrl?: string;
  logLevel?: 'debug' | 'info' | 'silent';

  // Monitoring hooks
  metricsHooks?: MetricsHooks;

  eip7594?: boolean;
}

/**
 * Cost estimation breakdown interface
 */
export interface CostEstimate {
  /** Network blob fee in ETH */
  blobFee: string;
  /** Transaction gas cost in ETH */
  gasFee: string;
  /** Proxy service fee in ETH (usually "0") */
  proxyFee: string;
  /** Total cost user will pay */
  totalETH: string;
}

/**
 * Standard blob receipt interface
 */
export interface BlobReceipt {
  /** Operation success status */
  success: boolean;
  /** Job ID for tracking */
  jobId: string;
  /** Transaction hash containing the blob */
  blobTxHash: string;
  /** Payment transaction hash */
  paymentTxHash: string | undefined;
  /** Block number where blob was included */
  blockNumber: number;
  /** Blob hash identifier */
  blobHash: string;
  /** KZG commitment */
  commitment: string;
  /** KZG proof */
  proofs: string[];
  /** Index of blob within transaction */
  blobIndex: number;
  /** Metadata associated with blob */
  meta: BlobMeta;
}

/**
 * Payment result from escrow deposit
 */
export interface BlobPaymentResult {
  /** Operation success status */
  success: boolean;
  /** Job ID for tracking */
  jobId: string;
  /** Payment transaction hash */
  paymentTxHash: string;
  /** Amount paid in ETH */
  amountPaid: string;
  /** Block number of payment */
  blockNumber: number;
}

/**
 * Result from reading a blob
 */
export interface BlobReadResult {
  /** Raw blob data */
  data: Uint8Array;
  /** Index of the blob within the transaction */
  blobIndex: number;
  /** Source of the blob data */
  source: 'rpc' | 'archive' | 'fallback';
}

/**
 * Error codes for BlobKit operations
 */
export enum BlobKitErrorCode {
  INVALID_CONFIG = 'INVALID_CONFIG',
  INVALID_PAYLOAD = 'INVALID_PAYLOAD',
  PROXY_NOT_FOUND = 'PROXY_NOT_FOUND',
  CONTRACT_NOT_DEPLOYED = 'CONTRACT_NOT_DEPLOYED',
  PAYMENT_TIMEOUT = 'PAYMENT_TIMEOUT',
  VERIFICATION_FAILED = 'VERIFICATION_FAILED',
  ENVIRONMENT_ERROR = 'ENVIRONMENT_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  BLOB_TOO_LARGE = 'BLOB_TOO_LARGE',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  JOB_EXPIRED = 'JOB_EXPIRED',
  JOB_NOT_EXPIRED = 'JOB_NOT_EXPIRED',
  PROXY_ERROR = 'PROXY_ERROR',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  KZG_ERROR = 'KZG_ERROR',
  JOB_ALREADY_EXISTS = 'JOB_ALREADY_EXISTS',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  JOB_NOT_FOUND = 'JOB_NOT_FOUND',
  JOB_ALREADY_COMPLETED = 'JOB_ALREADY_COMPLETED',
  REFUND_FAILED = 'REFUND_FAILED',
  BLOB_SUBMISSION_FAILED = 'BLOB_SUBMISSION_FAILED',
  JOB_TIMEOUT = 'JOB_TIMEOUT',
  BLOB_NOT_FOUND = 'BLOB_NOT_FOUND',
  BLOB_READ_FAILED = 'BLOB_READ_FAILED',
  ARCHIVE_READ_FAILED = 'ARCHIVE_READ_FAILED'
}

/**
 * Custom error class for BlobKit operations
 */
export class BlobKitError extends Error {
  public readonly code: BlobKitErrorCode;
  public readonly cause?: Error;

  constructor(code: BlobKitErrorCode, message: string, cause?: Error) {
    super(message);
    this.name = 'BlobKitError';
    this.code = code;
    this.cause = cause;
  }
}

/**
 * Proxy health check response
 */
export interface ProxyHealthResponse {
  status: 'healthy' | 'unhealthy';
  version: string;
  chainId: number;
  escrowContract: string;
  proxyFeePercent: number;
  maxBlobSize: number;
}

/**
 * Job status in escrow contract
 */
export interface JobStatus {
  exists: boolean;
  user: string;
  amount: string;
  completed: boolean;
  timestamp: number;
  blobTxHash: string;
}

/**
 * Codec interface for payload encoding/decoding
 */
export interface Codec {
  encode(data: unknown): Uint8Array;
  decode(data: Uint8Array): unknown;
  contentType: string;
}

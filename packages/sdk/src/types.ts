/**
 * BlobKit SDK Types
 * Comprehensive TypeScript types for the BlobKit blob storage SDK
 */

/**
 * Process environment variables required by BlobKit
 */
export interface ProcessEnv {
  readonly NODE_ENV?: 'development' | 'production' | 'test';
  readonly BLOBKIT_ESCROW_1?: string;
  readonly BLOBKIT_ESCROW_11155111?: string;
  readonly BLOBKIT_ESCROW_17000?: string;
  readonly BLOBKIT_RPC_URL?: string;
  readonly BLOBKIT_CHAIN_ID?: string;
  readonly BLOBKIT_PROXY_URL?: string;
  readonly BLOBKIT_LOG_LEVEL?: 'debug' | 'info' | 'silent';
  readonly BLOBKIT_KZG_TRUSTED_SETUP_PATH?: string;
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
 * Enhanced configuration for BlobKit instances
 */
export interface BlobKitConfig {
  // Core configuration
  rpcUrl: string;
  chainId?: number;
  archiveUrl?: string;
  defaultCodec?: string;
  compressionLevel?: number;

  // Proxy configuration
  proxyUrl?: string;
  escrowContract?: string;
  maxProxyFeePercent?: number;
  callbackUrl?: string;
  logLevel?: 'debug' | 'info' | 'silent';
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
  /** Transaction hash containing the blob */
  blobTxHash: string;
  /** Block number where blob was included */
  blockNumber: number;
  /** Blob hash identifier */
  blobHash: string;
  /** KZG commitment */
  commitment: string;
  /** KZG proof */
  proof: string;
  /** Index of blob within transaction */
  blobIndex: number;
  /** Metadata associated with blob */
  meta: BlobMeta;
}

/**
 * Extended result interface with payment information
 */
export interface BlobPaymentResult extends BlobReceipt {
  /** Escrow payment transaction */
  paymentTx?: string;
  /** Escrow tracking ID */
  jobId?: string;
  /** Proxy used for execution */
  proxyUrl?: string;
  /** Total cost paid */
  totalCostETH?: string;
  /** Transaction hash when proxy called completeJob */
  completionTxHash?: string;
  /** Payment method used */
  paymentMethod?: 'web3' | 'direct';
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
  PROXY_ERROR = 'PROXY_ERROR',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  KZG_ERROR = 'KZG_ERROR'
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

/**
 * Ethereum signer interface compatible with ethers.js
 */
export interface Signer {
  getAddress(): Promise<string>;
  signMessage(message: string | Uint8Array): Promise<string>;
  sendTransaction(transaction: TransactionRequest): Promise<TransactionResponse>;
  provider?: Provider;
}

/**
 * Transaction request interface
 */
export interface TransactionRequest {
  to?: string;
  value?: bigint;
  data?: string;
  gasLimit?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  maxFeePerBlobGas?: bigint;
  type?: number;
  blobs?: Uint8Array[];
  kzgCommitments?: string[];
  kzgProofs?: string[];
  chainId?: number;
}

/**
 * Transaction response interface
 */
export interface TransactionResponse {
  hash: string;
  wait(): Promise<TransactionReceipt>;
}

/**
 * Transaction receipt interface
 */
export interface TransactionReceipt {
  hash: string;
  blockNumber?: number;
  gasUsed?: bigint;
}

/**
 * Provider interface compatible with ethers.js
 */
export interface Provider {
  getFeeData(): Promise<FeeData>;
  getBlockNumber?(): Promise<number>;
  getNetwork?(): Promise<{ chainId: number }>;
}

/**
 * Fee data interface including blob gas pricing
 */
export interface FeeData {
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  maxFeePerBlobGas?: bigint;
} 
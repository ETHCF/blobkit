/**
 * Proxy Server Types
 * TypeScript interfaces for the BlobKit proxy server
 */

/**
 * Proxy server configuration
 */
export interface ProxyConfig {
  port: number;
  host: string;
  rpcUrl: string;
  chainId: number;
  escrowContract: string;
  privateKey: string;
  proxyFeePercent: number;
  maxBlobSize: number;
  rateLimitRequests: number;
  rateLimitWindow: number;
  jobTimeout: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  kzgTrustedSetupPath: string;
  httpProxyCount: number;
}

/**
 * Blob write request body
 */
export interface BlobWriteRequest {
  jobId: string;
  paymentTxHash: string;
  payload: string; // Base64 encoded binary data
  signature: string; // Base64 encoded signature of the payload
  meta: {
    appId: string;
    codec: string;
    contentHash?: string;
    ttlBlocks?: number;
    timestamp?: number;
    filename?: string;
    contentType?: string;
    tags?: string[];
    callbackUrl?: string;
  };
}

/**
 * Blob write response
 */
export interface BlobWriteResponse {
  success: true;
  blobTxHash: string;
  blockNumber: number;
  blobHash: string;
  commitment: string;
  proof: string;
  blobIndex: number;
  completionTxHash: string;
  jobId: string;
}

/**
 * Health check response
 */
export interface HealthResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  version: string;
  chainId: number;
  escrowContract: string;
  proxyFeePercent: number;
  maxBlobSize: number;
  uptime: number;
  signer: string;
  blocksLag?: number;
  rpcHealthy?: boolean;
  circuitBreakers?: Record<string, unknown>;
}

/**
 * Standardized error response
 */
export interface ErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Job verification result
 */
export interface JobVerification {
  valid: boolean;
  exists: boolean;
  user: string;
  amount: string;
  completed: boolean;
  timestamp: number;
  paymentTxHash?: string;
}

/**
 * Rate limit info
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: number;
}

/**
 * Proxy error codes
 */
export enum ProxyErrorCode {
  INVALID_REQUEST = 'INVALID_REQUEST',
  PAYMENT_INVALID = 'PAYMENT_INVALID',
  PAYMENT_NOT_FOUND = 'PAYMENT_NOT_FOUND',
  JOB_ALREADY_COMPLETED = 'JOB_ALREADY_COMPLETED',
  JOB_EXPIRED = 'JOB_EXPIRED',
  BLOB_TOO_LARGE = 'BLOB_TOO_LARGE',
  BLOB_EXECUTION_FAILED = 'BLOB_EXECUTION_FAILED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  CONTRACT_ERROR = 'CONTRACT_ERROR',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED'
}

/**
 * Custom proxy error class
 */
export class ProxyError extends Error {
  public readonly code: ProxyErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: ProxyErrorCode,
    message: string,
    statusCode: number = 400,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ProxyError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Blob execution job
 */
export interface BlobJob {
  jobId: string;
  user: string;
  paymentTxHash: string;
  payload: Uint8Array;
  meta: Record<string, unknown>;
  timestamp: number;
  retryCount: number;
}

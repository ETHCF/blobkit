import { BlobKit, Signer } from '@blobkit/sdk';
import { ethers } from 'ethers';
import { BlobJob, ProxyError, ProxyErrorCode } from '../types.js';
import { createLogger } from '../utils/logger.js';
import { TracingService, ExtendedTraceContext } from '../middleware/tracing.js';
// import type { TraceContext } from '../utils/logger.js';

const logger = createLogger('BlobExecutor');
const tracingService = new TracingService('blobkit-blob-executor');

/**
 * Service for executing blob transactions
 */
export class BlobExecutor {
  private blobkit: BlobKit | null = null;
  private config: { rpcUrl: string; chainId: number };
  private signer: Signer;
  private logger = createLogger('BlobExecutor');

  constructor(rpcUrl: string, chainId: number, signer: Signer) {
    this.config = { rpcUrl, chainId };
    this.signer = signer;
  }

  /**
   * Initialize BlobKit asynchronously
   */
  async ensureBlobKit(): Promise<BlobKit> {
    if (!this.blobkit) {
      // Initialize BlobKit with KZG setup for Node.js environment
      this.blobkit = await BlobKit.init(
        {
          rpcUrl: this.config.rpcUrl,
          chainId: this.config.chainId,
          logLevel: 'info',
        },
        this.signer
      );
    }
    return this.blobkit;
  }
  

  /**
   * Executes a blob transaction
   */
  async executeBlob(
    job: BlobJob,
    traceContext?: ExtendedTraceContext
  ): Promise<{
    blobTxHash: string;
    blockNumber: number;
    blobHash: string;
    commitment: string;
    proofs: string[];
    blobIndex: number;
  }> {
    const span = tracingService.startSpan('blob.execute', traceContext);
    span.setAttribute('job.id', job.jobId);
    span.setAttribute('job.user', job.user);
    span.setAttribute('payload.size', job.payload.length);

    const tracedLogger = traceContext
      ? tracingService.getLoggerWithTrace(logger, traceContext)
      : logger;

    try {
      tracedLogger.info(`Executing blob transaction for job ${job.jobId}`);

      // Validate blob size
      if (job.payload.length > 131072) {
        // 128KB
        throw new ProxyError(
          ProxyErrorCode.BLOB_TOO_LARGE,
          `Blob size ${job.payload.length} exceeds maximum 131072 bytes`,
          400
        );
      }

      // Convert payload back to the appropriate format based on codec
      let decodedPayload: unknown;

      const { codec } = job.meta as { codec?: string };
      switch (codec?.toLowerCase()) {
        case 'json':
        case 'application/json':
          decodedPayload = JSON.parse(new TextDecoder().decode(job.payload));
          break;
        case 'text':
        case 'text/plain':
          decodedPayload = new TextDecoder().decode(job.payload);
          break;
        case 'raw':
        case 'application/octet-stream':
          decodedPayload = job.payload;
          break;
        default:
          // Try to parse as JSON by default
          try {
            decodedPayload = JSON.parse(new TextDecoder().decode(job.payload));
          } catch {
            decodedPayload = job.payload;
          }
      }
      
      // Execute blob write using the SDK
      const result = await this.writeBlob(decodedPayload, job.meta, job.jobId);

      tracedLogger.info(
        `Blob transaction executed successfully for job ${job.jobId}: ${result.blobTxHash}`
      );

      span.setAttribute('blob.tx_hash', result.blobTxHash);
      span.setAttribute('blob.block_number', result.blockNumber);
      span.setAttribute('blob.index', result.blobIndex);
      span.setStatus({ code: 0 }); // Success

      return {
        blobTxHash: result.blobTxHash,
        blockNumber: result.blockNumber,
        blobHash: result.blobHash,
        commitment: result.commitment,
        proofs: result.proofs,
        blobIndex: result.blobIndex
      };
    } catch (error) {
      tracedLogger.error(`Blob execution failed for job ${job.jobId}:`, {
        error: error instanceof Error ? error.message : String(error)
      });

      span.recordException(error as Error);
      span.setStatus({
        code: 2,
        message: error instanceof Error ? error.message : 'Unknown error'
      }); // Error

      if (error instanceof ProxyError) {
        throw error;
      }

      throw new ProxyError(
        ProxyErrorCode.BLOB_EXECUTION_FAILED,
        `Failed to execute blob transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        { jobId: job.jobId, error: error instanceof Error ? error.message : 'Unknown error' }
      );
    } finally {
      span.end();
    }
  }

  /**
   * Writes blob data using the SDK
   */
  private async writeBlob(
    payload: unknown,
    meta: Record<string, unknown>,
    jobId: string
  ): Promise<{
    blobTxHash: string;
    blockNumber: number;
    blobHash: string;
    commitment: string;
    proofs: string[];
    blobIndex: number;
  }> {
    // Use the initialized BlobKit instance
    try {
      const blobkit = await this.ensureBlobKit();

      // Write blob directly (without proxy)
      const result = await blobkit.writeBlob(payload as Uint8Array | string | object, meta, jobId);

      return {
        blobTxHash: result.blobTxHash,
        blockNumber: result.blockNumber,
        blobHash: result.blobHash,
        commitment: result.commitment,
        proofs: result.proofs,
        blobIndex: result.blobIndex
      };
    } catch (error) {
      this.logger.error('Blob writing failed:', error);
      throw new ProxyError(
        ProxyErrorCode.BLOB_EXECUTION_FAILED,
        `Blob execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }
}

import { BlobKit } from '@blobkit/sdk';
import { ethers } from 'ethers';
import { BlobJob, ProxyError, ProxyErrorCode } from '../types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('BlobExecutor');

/**
 * Service for executing blob transactions
 */
export class BlobExecutor {
  private blobkit: BlobKit;
  private config: { rpcUrl: string; chainId: number };
  private signer: ethers.Signer;
  private logger = createLogger('BlobExecutor');

  constructor(rpcUrl: string, chainId: number, signer: ethers.Signer) {
    this.config = { rpcUrl, chainId };
    this.signer = signer;
    
    // Create BlobKit instance for direct transactions
    // Cast ethers.Signer to BlobKit's Signer interface for compatibility
    this.blobkit = new BlobKit({
      rpcUrl,
      chainId,
      logLevel: 'info'
    }, signer as any);
  }

  /**
   * Executes a blob transaction
   */
  async executeBlob(job: BlobJob): Promise<{
    blobTxHash: string;
    blockNumber: number;
    blobHash: string;
    commitment: string;
    proof: string;
    blobIndex: number;
  }> {
    try {
      logger.info(`Executing blob transaction for job ${job.jobId}`);

      // Validate blob size
      if (job.payload.length > 131072) { // 128KB
        throw new ProxyError(
          ProxyErrorCode.BLOB_TOO_LARGE,
          `Blob size ${job.payload.length} exceeds maximum 131072 bytes`,
          400
        );
      }

      // Convert payload back to the appropriate format based on codec
      let decodedPayload: unknown;
      
      switch (job.meta.codec?.toLowerCase()) {
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
      // Note: This would need to integrate with the existing BlobKit blob writing logic
      // For now, we'll simulate the response structure
      const result = await this.writeBlob(decodedPayload, job.meta);

      logger.info(`Blob transaction executed successfully for job ${job.jobId}: ${result.blobTxHash}`);

      return {
        blobTxHash: result.blobTxHash,
        blockNumber: result.blockNumber,
        blobHash: result.blobHash,
        commitment: result.commitment,
        proof: result.proof,
        blobIndex: result.blobIndex
      };
    } catch (error) {
      logger.error(`Blob execution failed for job ${job.jobId}:`, error);
      
      if (error instanceof ProxyError) {
        throw error;
      }

      throw new ProxyError(
        ProxyErrorCode.BLOB_EXECUTION_FAILED,
        `Failed to execute blob transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500,
        { jobId: job.jobId, error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Writes blob data using the SDK
   * Note: This is a placeholder that would integrate with existing blob writing logic
   */
  private async writeBlob(payload: unknown, meta: any): Promise<{
    blobTxHash: string;
    blockNumber: number;
    blobHash: string;
    commitment: string;
    proof: string;
    blobIndex: number;
  }> {
    // Use the BlobKit SDK for actual blob writing
    try {
      const blobKitConfig = {
        rpcUrl: this.config.rpcUrl,
        chainId: this.config.chainId,
        defaultCodec: 'application/json',
        logLevel: 'info' as const
      };

      // Create BlobKit instance with the signer
      // Cast ethers.Signer to BlobKit's Signer interface for compatibility
      const blobkit = new BlobKit(blobKitConfig, this.signer as any);
      
      // Write blob directly (without proxy)
      const result = await blobkit.writeBlob(payload, meta);
      
      return {
        blobTxHash: result.blobTxHash,
        blockNumber: result.blockNumber,
        blobHash: result.blobHash,
        commitment: result.commitment,
        proof: result.proof,
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
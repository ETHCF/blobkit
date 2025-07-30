import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { BlobWriteRequest, BlobWriteResponse, BlobJob, ProxyConfig } from '../types.js';
import { PaymentVerifier } from '../services/payment-verifier.js';
import { BlobExecutor } from '../services/blob-executor.js';
import { validateBlobWrite, handleValidationErrors } from '../middleware/validation.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('BlobRoute');

/**
 * Creates blob operation router
 */
export const createBlobRouter = (
  config: ProxyConfig,
  paymentVerifier: PaymentVerifier,
  blobExecutor: BlobExecutor,
  signer: ethers.Signer
) => {
  const router = Router();

  router.post('/write', validateBlobWrite, handleValidationErrors, async (req: Request, res: Response) => {
    const requestBody: BlobWriteRequest = req.body;
    const { jobId, paymentTxHash, payload, meta } = requestBody;

    try {
      logger.info(`Processing blob write request for job ${jobId}`);

      // Step 1: Verify payment
      logger.debug(`Verifying payment for job ${jobId}`);
      const verification = await paymentVerifier.verifyJobPayment(jobId, paymentTxHash);
      
      if (!verification.valid) {
        logger.warn(`Payment verification failed for job ${jobId}`);
        return res.status(400).json({
          error: 'PAYMENT_INVALID',
          message: 'Job payment verification failed'
        });
      }

      // Step 2: Create job for execution
      const job: BlobJob = {
        jobId,
        user: verification.user,
        paymentTxHash,
        payload: new Uint8Array(payload),
        meta,
        timestamp: Math.floor(Date.now() / 1000),
        retryCount: 0
      };

      // Step 3: Execute blob transaction
      logger.debug(`Executing blob transaction for job ${jobId}`);
      const blobResult = await blobExecutor.executeBlob(job);

      // Step 4: Complete job in escrow contract
      logger.debug(`Completing job ${jobId} in escrow contract`);
      const completionTxHash = await paymentVerifier.completeJob(
        jobId,
        blobResult.blobTxHash,
        signer
      );

      // Step 5: Return success response
      const response: BlobWriteResponse = {
        success: true,
        blobTxHash: blobResult.blobTxHash,
        blockNumber: blobResult.blockNumber,
        blobHash: blobResult.blobHash,
        commitment: blobResult.commitment,
        proof: blobResult.proof,
        blobIndex: blobResult.blobIndex,
        completionTxHash,
        jobId
      };

      logger.info(`Blob write completed successfully for job ${jobId}`);
      return res.json(response);

    } catch (error) {
      logger.error(`Blob write failed for job ${jobId}:`, error);
      throw error; // Let error handler middleware handle it
    }
  });

  return router;
}; 
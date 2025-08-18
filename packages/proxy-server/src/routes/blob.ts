import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { BlobWriteRequest, BlobWriteResponse, BlobJob, ProxyConfig, ProxyError } from '../types.js';
import { PaymentVerifier } from '../services/payment-verifier.js';
import { BlobExecutor } from '../services/blob-executor.js';
import { PersistentJobQueue } from '../services/persistent-job-queue.js';
import { JobCache } from '../services/job-cache.js';
import { validateBlobWrite, handleValidationErrors } from '../middleware/validation.js';
import { createLogger } from '../utils/logger.js';
import { MetricsCollector } from '../monitoring/metrics.js';
import { getPrometheusMetrics } from '../monitoring/prometheus-metrics.js';
import { getTraceContext, TracingService } from '../middleware/tracing.js';
import { bytesToHex } from "@blobkit/sdk"

const logger = createLogger('BlobRoute');
const tracingService = new TracingService('blobkit-blob-route');

/**
 * Execute callback URL with job completion data
 */
async function executeCallback(
  callbackUrl: string,
  response: BlobWriteResponse,
  tracedLogger: ReturnType<typeof createLogger>
): Promise<void> {
  try {
    const callbackResponse = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'BlobKit-Proxy/1.0'
      },
      body: JSON.stringify({
        jobId: response.jobId,
        blobTxHash: response.blobTxHash,
        blockNumber: response.blockNumber,
        blobHash: response.blobHash,
        commitment: response.commitment,
        proof: response.proof,
        blobIndex: response.blobIndex,
        completionTxHash: response.completionTxHash,
        timestamp: Date.now()
      }),
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!callbackResponse.ok) {
      throw new Error(
        `Callback returned ${callbackResponse.status}: ${callbackResponse.statusText}`
      );
    }

    tracedLogger.info(`Callback executed successfully for job ${response.jobId}`);
  } catch (error) {
    // Log but don't throw - callback failures shouldn't affect the main flow
    tracedLogger.warn(`Callback failed for job ${response.jobId}:`, error);
  }
}

/**
 * Creates blob operation router
 */
export const createBlobRouter = (
  config: ProxyConfig,
  paymentVerifier: PaymentVerifier,
  blobExecutor: BlobExecutor,
  jobCompletionQueue: PersistentJobQueue,
  jobCache: JobCache,
  signer: ethers.Signer,
  metrics: MetricsCollector = new MetricsCollector()
) => {
  const router = Router();


  router.get('/address', async (req: Request, res: Response) => {
    res.json({ address: await signer.getAddress() });
  });

  router.post(
    '/write',
    validateBlobWrite,
    handleValidationErrors,
    async (req: Request, res: Response) => {
      const startTime = Date.now();
      const requestBody: BlobWriteRequest = req.body;
      const { jobId, paymentTxHash, payload, meta, signature } = requestBody;


      const cachedResult = await jobCache.get(jobId);
      if(!!cachedResult) {
        return res.json(cachedResult);
      }

      const traceContext = getTraceContext(req);
      const span = tracingService.startSpan('blob.write', traceContext);
      span.setAttribute('job.id', jobId);
      span.setAttribute('job.payment_tx', paymentTxHash);

      const tracedLogger = tracingService.getLoggerWithTrace(logger, traceContext);
      let lockAcquired = false;
      try {
        tracedLogger.info(`Processing blob write request for job ${jobId}`);
        metrics.jobStarted(jobId);

        // Step 1: Verify payment
        tracedLogger.debug(`Verifying payment for job ${jobId}`);
        const paymentSpan = tracingService.startSpan('payment.verify', traceContext);
        const verification = await paymentVerifier.verifyJobPayment(jobId, paymentTxHash);
        paymentSpan.setAttribute('payment.valid', verification.valid);
        paymentSpan.end();

        if (!verification.valid) {
          tracedLogger.warn(`Payment verification failed for job ${jobId}`);
          return res.status(400).json({
            error: 'PAYMENT_INVALID',
            message: 'Job payment verification failed'
          });
        }

        if (verification.completed) {
          return res.status(404).json({
            error: 'JOB_ALREADY_COMPLETED',
            message: 'Job already completed'
          });
        }

        // Step 2: Create job for execution
        // Decode base64 payload
        const payloadBuffer = Buffer.from(payload, 'base64');
        const payloadArray = new Uint8Array(payloadBuffer);

        const signatureBuffer = Buffer.from(signature, 'base64');
        const signatureArray = new Uint8Array(signatureBuffer);

        if (verification.user !== ethers.verifyMessage(payloadArray, bytesToHex(signatureArray))) {
          tracedLogger.warn(`Signature verification failed for job ${jobId}`);
          return res.status(400).json({
            error: 'SIGNATURE_INVALID',
            message: 'Job signature verification failed'
          });
        }

        // Validate payload size
        if (payloadArray.length > config.maxBlobSize) {
          return res.status(400).json({
            error: 'BLOB_TOO_LARGE',
            message: `Payload size ${payloadArray.length} exceeds maximum ${config.maxBlobSize} bytes`
          });
        }

        // Note: Job ID validation is already done by verifying the job exists in the escrow contract.
        // Since the job ID is derived from the payload hash, a valid job ID proves the payload matches.

        const job: BlobJob = {
          jobId,
          user: verification.user,
          paymentTxHash,
          payload: payloadArray,
          meta,
          timestamp: Math.floor(Date.now() / 1000),
          retryCount: 0
        };

        // Step 3: Execute blob transaction
        tracedLogger.debug(`Submitting job ${jobId} to executor`);
       
        metrics.blobSubmitted(payloadArray.length);
        

        // Record Prometheus metrics for blob submission
        const promMetrics = getPrometheusMetrics();
        promMetrics.blobSizeBytes.observe({ codec: meta.codec || 'unknown' }, payloadArray.length);

        lockAcquired = await jobCache.acquireLock(jobId);
        if(!lockAcquired) {
          tracedLogger.warn(`Job ${jobId} is already being processed`);
          return res.status(425).json({
            error: 'JOB_LOCKED',
            message: 'Job is already being processed'
          });
        }
        const blobResult = await blobExecutor.executeBlob(job, traceContext);
        

        // Step 4: Complete job in escrow contract with retry handling
        tracedLogger.debug(`Completing job ${jobId} in escrow contract`);
        let completionTxHash: string;

        const completionSpan = tracingService.startSpan('job.complete', traceContext);
        try {
          completionTxHash = await paymentVerifier.completeJob(
            jobId,
            blobResult.blobTxHash,
            signer
          );
          completionSpan.setAttribute('completion.tx_hash', completionTxHash);
          completionSpan.setStatus({ code: 0 });
        } catch (error) {
          // Add to retry queue if completion fails
          completionSpan.recordException(error as Error);
          completionSpan.setStatus({ code: 2, message: 'Job completion failed' });
          tracedLogger.warn(`Job completion failed for ${jobId}, adding to retry queue`);
          await jobCompletionQueue.addPendingCompletion(jobId, blobResult.blobTxHash);
          metrics.jobRetried(jobId);

          // Mark completion as pending
          completionTxHash = 'pending';
        } finally {
          completionSpan.end();
        }

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

        {
          // Calculate fee collected (simplified - would need actual calculation)
          const feePercent = BigInt(config.proxyFeePercent);
          const jobAmount = BigInt(verification.amount);
          const feeCollected = (jobAmount * feePercent) / 100n;

          metrics.jobCompleted(jobId, feeCollected);
          tracedLogger.info(`Blob write completed successfully for job ${jobId}`);
          // Record Prometheus success metrics
          promMetrics.blobSubmissions.inc({ status: 'success', error_type: 'none' });
          promMetrics.jobProcessingDuration.observe(
            { status: 'success' },
            (Date.now() - startTime) / 1000
          );
          if (feeCollected > 0n) {
            promMetrics.feesCollected.inc(Number(feeCollected));
          }

          span.setAttribute('response.success', true);
          span.setAttribute('response.blob_tx_hash', response.blobTxHash);
          span.setAttribute('response.block_number', response.blockNumber);
          span.setStatus({ code: 0 });
          span.end();

          // Execute callback if provided
          if (meta?.callbackUrl && typeof meta.callbackUrl === 'string') {
            executeCallback(meta.callbackUrl, response, tracedLogger).catch(error => {
              tracedLogger.warn(`Callback execution failed for job ${jobId}:`, error);
            });
          }
        }

        await jobCache.set(jobId, response);

        return res.json(response);
      } catch (error) {
        tracedLogger.error(`Blob write failed for job ${jobId}:`, {
          error: error instanceof Error ? error.message : String(error)
        });
        metrics.jobFailed(jobId, error instanceof Error ? error.message : 'Unknown error');

        // Record Prometheus error metrics
        const promMetrics = getPrometheusMetrics();
        const errorCode = error instanceof ProxyError ? error.code : 'UNKNOWN';
        promMetrics.blobSubmissions.inc({ status: 'failure', error_type: errorCode });
        promMetrics.errors.inc({
          type: 'blob_write',
          code: errorCode,
          operation: 'write'
        });

        span.recordException(error as Error);
        span.setStatus({
          code: 2,
          message: error instanceof Error ? error.message : 'Unknown error'
        });
        span.end();
        

        throw error; // Let error handler middleware handle it
      }finally{
        if (lockAcquired) { 
          await jobCache.releaseLock(jobId); // Release the lock so retries can occur
        }
      }
    }
  );

  return router;
};

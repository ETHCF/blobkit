import { ethers } from 'ethers';
import { JobVerification, ProxyError, ProxyErrorCode } from '../types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('PaymentVerifier');

/**
 * Service for verifying payments in the escrow contract
 */
export class PaymentVerifier {
  private provider: ethers.Provider;
  private contract: ethers.Contract;

  constructor(rpcUrl: string, escrowContract: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // Escrow contract ABI - matches the one from SDK
    const escrowAbi = [
      'function jobs(bytes32) external view returns (address user, uint256 amount, bool completed, uint256 timestamp, bytes32 blobTxHash)',
      'function getJobTimeout() external view returns (uint256)',
      'function completeJob(bytes32 jobId, bytes32 blobTxHash, bytes calldata proof) external',
      'event JobCreated(bytes32 indexed jobId, address indexed user, uint256 amount)',
      'event JobCompleted(bytes32 indexed jobId, bytes32 blobTxHash, uint256 proxyFee)'
    ];

    this.contract = new ethers.Contract(escrowContract, escrowAbi, this.provider);
  }

  /**
   * Verifies that a job payment exists and is valid
   */
  async verifyJobPayment(jobId: string, paymentTxHash: string): Promise<JobVerification> {
    try {
      logger.debug(`Verifying job payment for job ${jobId}`);

      // Get job details from contract
      const job = await this.contract.jobs(jobId);
      
      const verification: JobVerification = {
        valid: false,
        exists: job.user !== '0x0000000000000000000000000000000000000000',
        user: job.user,
        amount: job.amount.toString(),
        completed: job.completed,
        timestamp: Number(job.timestamp),
        paymentTxHash
      };

      if (!verification.exists) {
        logger.warn(`Job ${jobId} does not exist in escrow contract`);
        return verification;
      }

      if (verification.completed) {
        logger.warn(`Job ${jobId} already completed`);
        throw new ProxyError(
          ProxyErrorCode.JOB_ALREADY_COMPLETED,
          `Job ${jobId} has already been completed`,
          400
        );
      }

      // Check if job is expired
      const jobTimeout = await this.contract.getJobTimeout();
      const currentTime = Math.floor(Date.now() / 1000);
      const isExpired = currentTime > verification.timestamp + Number(jobTimeout);

      if (isExpired) {
        logger.warn(`Job ${jobId} has expired`);
        throw new ProxyError(
          ProxyErrorCode.JOB_EXPIRED,
          `Job ${jobId} has expired and can be refunded`,
          400
        );
      }

      // Verify the payment transaction exists and matches the job
      if (paymentTxHash) {
        const isValidPayment = await this.verifyPaymentTransaction(jobId, paymentTxHash);
        if (!isValidPayment) {
          throw new ProxyError(
            ProxyErrorCode.PAYMENT_INVALID,
            `Payment transaction ${paymentTxHash} does not match job ${jobId}`,
            400
          );
        }
      }

      verification.valid = true;
      logger.info(`Job ${jobId} payment verification successful`);
      
      return verification;
    } catch (error) {
      if (error instanceof ProxyError) {
        throw error;
      }
      
      logger.error(`Payment verification failed for job ${jobId}:`, error);
      throw new ProxyError(
        ProxyErrorCode.CONTRACT_ERROR,
        `Failed to verify payment: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  /**
   * Verifies that a payment transaction is valid for the given job
   */
  private async verifyPaymentTransaction(jobId: string, paymentTxHash: string): Promise<boolean> {
    try {
      const receipt = await this.provider.getTransactionReceipt(paymentTxHash);
      if (!receipt) {
        return false;
      }

      // Check if the transaction was successful
      if (receipt.status !== 1) {
        return false;
      }

      // Parse logs to find JobCreated event
      const jobCreatedEvent = this.contract.interface.getEvent('JobCreated');
      const jobCreatedTopic = jobCreatedEvent?.topicHash || ethers.id('JobCreated(bytes32,address,uint256)');
      const jobIdBytes32 = ethers.keccak256(ethers.toUtf8Bytes(jobId));

      for (const log of receipt.logs) {
        if (log.topics[0] === jobCreatedTopic && log.topics[1] === jobIdBytes32) {
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error(`Failed to verify payment transaction ${paymentTxHash}:`, error);
      return false;
    }
  }

  /**
   * Completes a job in the escrow contract
   */
  async completeJob(jobId: string, blobTxHash: string, signer: ethers.Signer): Promise<string> {
    try {
      logger.info(`Completing job ${jobId} with blob tx ${blobTxHash}`);

      const contractWithSigner = this.contract.connect(signer);
      
      // Create proof (simple signature for now)
      const message = ethers.solidityPackedKeccak256(
        ['bytes32', 'bytes32'],
        [ethers.keccak256(ethers.toUtf8Bytes(jobId)), blobTxHash]
      );
      const proof = await signer.signMessage(ethers.getBytes(message));

      const tx = await (contractWithSigner as any).completeJob(
        ethers.keccak256(ethers.toUtf8Bytes(jobId)),
        blobTxHash,
        proof
      );

      const receipt = await tx.wait();
      logger.info(`Job ${jobId} completed with transaction ${receipt.hash}`);
      
      return receipt.hash;
    } catch (error) {
      logger.error(`Failed to complete job ${jobId}:`, error);
      throw new ProxyError(
        ProxyErrorCode.CONTRACT_ERROR,
        `Failed to complete job: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }
} 
import { ethers } from 'ethers';
import { JobVerification, ProxyError, ProxyErrorCode } from '../types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('PaymentVerifier');

interface EscrowContractMethods {
  completeJob(
    jobId: string,
    blobTxHash: string,
    proof: string
  ): Promise<ethers.TransactionResponse>;
}

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

  async checkJobStatus(jobId: string): Promise<JobVerification & {isExpired?: boolean}> {
    try {
      logger.debug(`Checking job status for job ${jobId}`);

      // Get job details from contract
      const job = await this.contract.jobs(jobId);

      if (!job) {
        logger.warn(`Job ${jobId} does not exist`);
        return {
          valid: false,
          exists: false,
          user: '',
          amount: '0',
          completed: false,
          timestamp: 0,
          isExpired: false
        };
      }

      const verification: JobVerification = {
        valid: true,
        exists: true,
        user: job.user,
        amount: job.amount.toString(),
        completed: job.completed,
        timestamp: Number(job.timestamp)
      };

      const jobTimeout = await this.contract.getJobTimeout();
      const currentTime = Math.floor(Date.now() / 1000);
      const isExpired = currentTime > verification.timestamp + Number(jobTimeout);

      return { ...verification, isExpired };
    } catch (error) {
      logger.error(`Failed to check job status for ${jobId}:`, error);
      throw new ProxyError(
        ProxyErrorCode.CONTRACT_ERROR,
        `Failed to check job status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
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
        logger.warn(`Payment transaction ${paymentTxHash} not found`);
        return false;
      }

      // Check if the transaction was successful
      if (receipt.status !== 1) {
        logger.warn(`Payment transaction ${paymentTxHash} failed`);
        return false;
      }

      // Parse logs to find JobCreated event
      const jobCreatedEvent = this.contract.interface.getEvent('JobCreated');
      const jobCreatedTopic =
        jobCreatedEvent?.topicHash || ethers.id('JobCreated(bytes32,address,uint256)');

      for (const log of receipt.logs) {
        if (log.topics[0] === jobCreatedTopic) {
          logger.info(
            `Found JobCreated event for job ${jobId} in payment transaction ${paymentTxHash}`
          );
          if (log.topics[1] === jobId) {
            return true;
          }
        }
      }
      logger.warn(
        `Payment transaction not found in tx receipt${paymentTxHash} does not match job ${jobId}`
      );
      return false;
    } catch (error) {
      logger.error(`Failed to verify payment transaction ${paymentTxHash}:`, error);
      return false;
    }
  }

  private async _completeJob(contract:ethers.Contract & EscrowContractMethods, jobId: string, blobTxHash: string, proof: string, retries: number = 3): Promise<ethers.TransactionReceipt | null> {
    for (let i = 0; i < retries; i++) {
      try {
        const tx = await contract.completeJob(jobId, blobTxHash, proof);
        return await tx.wait();
      } catch (error) {
        logger.error(`Failed to complete job ${jobId} (attempt ${i + 1}):`, error);
        if (i === retries - 1) {
          throw new ProxyError(
            ProxyErrorCode.CONTRACT_ERROR,
            `Failed to complete job: ${error instanceof Error ? error.message : 'Unknown error'}`,
            500
          );
        }
      }
    }
    throw new Error("Something went wrong"); // Should not reach here
  }
  /**
   * Completes a job in the escrow contract
   */
  async completeJob(jobId: string, blobTxHash: string, signer: ethers.Signer): Promise<string> {
    try {
      logger.info(`Completing job ${jobId} with blob tx ${blobTxHash}`);

      const contractWithSigner = this.contract.connect(signer);

      // Create proof that includes the proxy address
      const proxyAddress = await signer.getAddress();
      const messageHash = ethers.solidityPackedKeccak256(
        ['bytes32', 'bytes32', 'address'],
        [jobId, blobTxHash, proxyAddress]
      );

      // The contract expects a signature with the Ethereum prefix
      // We need to sign the message hash as bytes to get the correct signature
      // Convert the hash to bytes array for signing
      const messageBytes = ethers.getBytes(messageHash);

      // Sign the message hash - this will add the Ethereum prefix automatically
      const proof = await signer.signMessage(messageBytes);

      const receipt = await this._completeJob((contractWithSigner as ethers.Contract & EscrowContractMethods), jobId, blobTxHash, proof);
      if (!receipt) {
        throw new ProxyError(ProxyErrorCode.TRANSACTION_FAILED, 'Transaction receipt not found');
      }
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

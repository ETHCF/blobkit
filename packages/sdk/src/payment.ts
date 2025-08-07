/**
 * Payment operations for BlobKit
 *
 * Handles escrow deposits, refunds, and payment verification
 */

import { ethers } from 'ethers';
import { BlobPaymentResult, JobStatus, BlobKitError, BlobKitErrorCode } from './types.js';
import type { Signer, TransactionResponse } from 'ethers';
import { EscrowContractABI } from './abi/index.js';
import { parseEther, formatEther, isValidAddress } from './utils.js';

// Properly typed contract interface
interface BlobKitEscrowContract extends ethers.BaseContract {
  depositForBlob(
    jobId: string,
    overrides?: { value: bigint }
  ): Promise<ethers.ContractTransactionResponse>;
  refundExpiredJob(jobId: string): Promise<ethers.ContractTransactionResponse>;
  getJob(jobId: string): Promise<{
    user: string;
    amount: bigint;
    completed: boolean;
    timestamp: bigint;
    blobTxHash: string;
  }>;
  jobTimeout(): Promise<bigint>;
  proxyFees(proxy: string): Promise<bigint>;
}

export class PaymentManager {
  private escrowContract?: BlobKitEscrowContract;

  constructor(
    private rpcUrl: string,
    private escrowAddress: string,
    private signer?: Signer
  ) {
    if (!isValidAddress(escrowAddress)) {
      throw new BlobKitError(BlobKitErrorCode.INVALID_CONFIG, 'Invalid escrow contract address');
    }
  }

  /**
   * Deposit payment for a blob job
   */
  async depositForBlob(jobId: string, amountInEth: string): Promise<BlobPaymentResult> {
    if (!this.signer) {
      throw new BlobKitError(
        BlobKitErrorCode.INVALID_CONFIG,
        'Signer required for payment operations'
      );
    }

    const contract = await this.getContract();
    const amountInWei = parseEther(amountInEth);

    try {
      // Check if job already exists
      const existingJob = await this.getJobStatus(jobId);
      if (existingJob.exists) {
        throw new BlobKitError(BlobKitErrorCode.JOB_ALREADY_EXISTS, `Job ${jobId} already exists`);
      }

      // Submit deposit transaction
      const signedContract = contract.connect(this.signer!) as BlobKitEscrowContract;
      const tx = await signedContract.depositForBlob(jobId, {
        value: amountInWei
      });

      // Wait for confirmation
      const receipt = await tx.wait();

      if (!receipt || receipt.status !== 1) {
        throw new BlobKitError(BlobKitErrorCode.TRANSACTION_FAILED, 'Payment transaction failed');
      }

      return {
        success: true,
        jobId,
        paymentTxHash: receipt.hash,
        amountPaid: formatEther(amountInWei),
        blockNumber: receipt.blockNumber
      };
    } catch (error) {
      if (error instanceof BlobKitError) {
        throw error;
      }

      // Handle contract errors
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('JobAlreadyExists')) {
        throw new BlobKitError(BlobKitErrorCode.JOB_ALREADY_EXISTS, `Job ${jobId} already exists`);
      }

      throw new BlobKitError(BlobKitErrorCode.PAYMENT_FAILED, `Payment failed: ${message}`);
    }
  }

  /**
   * Request refund for an expired job
   */
  async refundIfExpired(jobId: string): Promise<TransactionResponse> {
    if (!this.signer) {
      throw new BlobKitError(
        BlobKitErrorCode.INVALID_CONFIG,
        'Signer required for refund operations'
      );
    }

    const contract = await this.getContract();

    try {
      // Check job status first
      const job = await this.getJobStatus(jobId);

      if (!job.exists) {
        throw new BlobKitError(BlobKitErrorCode.JOB_NOT_FOUND, `Job ${jobId} not found`);
      }

      if (job.completed) {
        throw new BlobKitError(
          BlobKitErrorCode.JOB_ALREADY_COMPLETED,
          `Job ${jobId} already completed`
        );
      }

      // Check if job is expired
      const currentTime = Math.floor(Date.now() / 1000);
      const jobTimeout = await contract.jobTimeout();
      const expiryTime = job.timestamp + Number(jobTimeout);

      if (currentTime < expiryTime) {
        throw new BlobKitError(
          BlobKitErrorCode.JOB_NOT_EXPIRED,
          `Job ${jobId} not expired yet. Expires at ${new Date(expiryTime * 1000).toISOString()}`
        );
      }

      // Submit refund transaction
      const signedContract = contract.connect(this.signer!) as BlobKitEscrowContract;
      const tx = await signedContract.refundExpiredJob(jobId);
      return tx;
    } catch (error) {
      if (error instanceof BlobKitError) {
        throw error;
      }

      throw new BlobKitError(
        BlobKitErrorCode.REFUND_FAILED,
        `Refund failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get job status from escrow contract
   */
  async getJobStatus(jobId: string): Promise<JobStatus> {
    const contract = await this.getContract();
    const job = await contract.getJob(jobId);

    return {
      exists: job.user !== '0x0000000000000000000000000000000000000000',
      user: job.user,
      amount: formatEther(job.amount),
      completed: job.completed,
      timestamp: Number(job.timestamp),
      blobTxHash: job.blobTxHash
    };
  }

  /**
   * Get proxy fee percentage
   */
  async getProxyFeePercent(proxyAddress?: string): Promise<number> {
    const contract = await this.getContract();

    if (proxyAddress) {
      const fee = await contract.proxyFees(proxyAddress);
      return Number(fee);
    }

    // If no proxy address, return 0
    return 0;
  }

  /**
   * Get the escrow contract instance
   */
  private async getContract(): Promise<BlobKitEscrowContract> {
    if (this.escrowContract) {
      return this.escrowContract;
    }

    const provider = new ethers.JsonRpcProvider(this.rpcUrl);
    this.escrowContract = new ethers.Contract(
      this.escrowAddress,
      EscrowContractABI,
      provider
    ) as unknown as BlobKitEscrowContract;

    return this.escrowContract;
  }
}

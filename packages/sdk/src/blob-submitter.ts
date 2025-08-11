/**
 * Direct blob submission for Node.js environments
 *
 * Handles blob transaction construction and submission
 * without going through the proxy server
 */

import { ethers } from 'ethers';
import {
  Signer,
  TransactionRequest,
  TransactionResponse,
  BlobKitError,
  BlobKitErrorCode
} from './types.js';
import {
  encodeBlob,
  blobToKzgCommitment,
  computeKzgProof,
  commitmentToVersionedHash
} from './kzg.js';

export interface BlobSubmitterConfig {
  rpcUrl: string;
  chainId: number;
  escrowAddress: string;
}

export interface DirectSubmitResult {
  blobTxHash: string;
  blockNumber: number;
  blobHash: string;
  commitment: string;
  proof: string;
  blobIndex: number;
}

export class BlobSubmitter {
  private provider: ethers.JsonRpcProvider;

  constructor(private config: BlobSubmitterConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
  }

  /**
   * Submit blob transaction directly to the network
   */
  async submitBlob(
    signer: Signer,
    jobId: string,
    payload: Uint8Array,
    kzg: ethers.KzgLibraryLike
  ): Promise<DirectSubmitResult> {
    try {
      // Encode blob data
      const blob = encodeBlob(payload);

      // Generate KZG commitment and proof
      const commitment = blobToKzgCommitment(blob);
      const proof = computeKzgProof(blob, commitment);
      const versionedHash = await commitmentToVersionedHash(commitment);

      // Get current fee data
      const feeData = await this.provider.getFeeData();
      if (!feeData.maxFeePerGas || !feeData.maxPriorityFeePerGas) {
        throw new BlobKitError(
          BlobKitErrorCode.NETWORK_ERROR,
          'Unable to fetch current gas prices'
        );
      }

      // Get blob base fee
      const block = await this.provider.getBlock('latest');
      if (!block) {
        throw new BlobKitError(BlobKitErrorCode.NETWORK_ERROR, 'Unable to fetch latest block');
      }

      // Construct blob transaction
      const tx: TransactionRequest = {
        type: 3, // EIP-4844 blob transaction
        to: '0x0000000000000000000000000000000000000000', // must be 0
        data: '0x',
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        maxFeePerBlobGas: BigInt(1000000000), // 1 gwei default
        blobs: [blob],
        kzgCommitments: ['0x' + Buffer.from(commitment).toString('hex')],
        kzgProofs: ['0x' + Buffer.from(proof).toString('hex')],
        kzg: kzg, // This is necessary for the EIP-4844 transaction, do not remove
      };

      // Estimate gas
      try {
        const provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
        const gasLimit = await provider.estimateGas(tx);
        tx.gasLimit = (gasLimit * BigInt(110)) / BigInt(100); // Add 10% buffer
      } catch (error) {
        // If estimation fails, use a reasonable default
        tx.gasLimit = BigInt(200000);
      }

      // Submit transaction
      const txResponse = await signer.sendTransaction(tx);

      // Wait for confirmation
      const receipt = await txResponse.wait();

      if (!receipt || receipt.status !== 1) {
        throw new BlobKitError(BlobKitErrorCode.TRANSACTION_FAILED, 'Blob transaction failed');
      }

      return {
        blobTxHash: receipt.hash,
        blockNumber: receipt.blockNumber!,
        blobHash: versionedHash,
        commitment: '0x' + Buffer.from(commitment).toString('hex'),
        proof: '0x' + Buffer.from(proof).toString('hex'),
        blobIndex: 0 // Single blob per transaction
      };
    } catch (error) {
      if (error instanceof BlobKitError) {
        throw error;
      }

      throw new BlobKitError(
        BlobKitErrorCode.BLOB_SUBMISSION_FAILED,
        `Failed to submit blob: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }


  /**
   * Estimate the cost of submitting a blob
   */
  async estimateCost(payloadSize: number): Promise<{
    blobFee: bigint;
    executionFee: bigint;
    total: bigint;
  }> {
    try {
      // Get current fee data
      const feeData = await this.provider.getFeeData();
      const block = await this.provider.getBlock('latest');

      if (!feeData.maxFeePerGas || !block) {
        throw new Error('Unable to fetch fee data');
      }

      // Calculate blob gas (1 blob = 131072 gas)
      const blobGas = BigInt(131072);

      // Get actual blob base fee from network (EIP-4844)
      let blobBaseFee = 1n; // 1 wei minimum
      const hasBlobFeeFields = (block as unknown as { blobGasUsed?: bigint | null; excessBlobGas?: bigint | null }).blobGasUsed != null
        && (block as unknown as { blobGasUsed?: bigint | null; excessBlobGas?: bigint | null }).excessBlobGas != null;

      if (hasBlobFeeFields) {
        // Calculate blob base fee from excess blob gas
        const MIN_BLOB_BASE_FEE = 1n;
        const BLOB_BASE_FEE_UPDATE_FRACTION = 3338477n;
        const excess = (block as unknown as { excessBlobGas: bigint }).excessBlobGas;
        blobBaseFee = excess > 0n ? MIN_BLOB_BASE_FEE + excess / BLOB_BASE_FEE_UPDATE_FRACTION : MIN_BLOB_BASE_FEE;
      } else {
        // Pre-4844 or no blob data, use reasonable default
        blobBaseFee = 1_000_000_000n; // 1 gwei fallback
      }

      const blobFee = blobGas * blobBaseFee;

      // Estimate execution gas
      const executionGas = BigInt(200000); // Reasonable estimate
      const executionFee = executionGas * feeData.maxFeePerGas;

      return {
        blobFee,
        executionFee,
        total: blobFee + executionFee
      };
    } catch (error) {
      throw new BlobKitError(
        BlobKitErrorCode.NETWORK_ERROR,
        `Failed to estimate cost: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

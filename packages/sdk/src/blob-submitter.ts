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
  txTimeoutMs?: number; // Optional timeout for transactions
  eip7918?: boolean; // Whether to use EIP-7918 for fee payment, active after Fukasa upgrade
}

export interface DirectSubmitResult {
  blobTxHash: string;
  blockNumber: number;
  blobHash: string;
  commitment: string;
  proof: string;
  blobIndex: number;
}

const BLOB_BASE_FEE_UPDATE_FRACTION = 3338477n;
const MIN_BASE_FEE_PER_BLOB_GAS = 1n;
const GAS_PER_BLOB = 131072n; // (1 blob = 131072 gas)
const BLOB_BASE_COST = 8192n;
const TARGET_BLOB_GAS_PER_BLOCK = 393216n;

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
    payload: Uint8Array,
    kzg: ethers.KzgLibraryLike,
    gasPriceMultiplier: number = 1
  ): Promise<DirectSubmitResult> {
    try {
      // Encode blob data
      const blob = encodeBlob(payload);

      // Generate KZG commitment and proof
      const commitment = blobToKzgCommitment(blob);
      const proof = computeKzgProof(blob, commitment);
      const versionedHash = await commitmentToVersionedHash(commitment);

      const cost = await this.estimateCost(1);
      // Construct blob transaction
      const tx: TransactionRequest = {
        chainId: this.config.chainId,
        type: 3, // EIP-4844 blob transaction
        to: '0x0000000000000000000000000000000000000000', // must be 0
        from: await signer.getAddress(),
        data: '0x',
        maxFeePerGas: cost.maxFeePerGas,
        maxPriorityFeePerGas: cost.maxPriorityFeePerGas,
        maxFeePerBlobGas: cost.maxFeePerBlobGas,
        blobs: [blob],
        kzgCommitments: ['0x' + Buffer.from(commitment).toString('hex')],
        kzgProofs: ['0x' + Buffer.from(proof).toString('hex')],
        kzg: kzg, // This is necessary for the EIP-4844 transaction, do not remove
      };

      // Estimate gas
      try {
        const gasLimit = await this.provider.estimateGas(tx);
        tx.gasLimit = (gasLimit * BigInt(110)) / BigInt(100); // Add 10% buffer
      } catch (error) {
        // If estimation fails, use a reasonable default
        tx.gasLimit = BigInt(200000);
      }

      // Submit transaction
      const txResponse = await signer.sendTransaction(tx);

      // Wait for confirmation
      const receipt = await txResponse.wait(undefined, this.config.txTimeoutMs);

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
      if (!!(error as any).message && (error as any).message.length > 4000 ) {
        let firstEnd = (error as any).message.indexOf("params");
        if (firstEnd < 0 || firstEnd > 2000) firstEnd = 2000;
        (error as any).message = (error as any).message.substring(0, firstEnd) + '...(truncated)...' +  (error as any).message.substring(-2000);
      }
      if (error instanceof BlobKitError) {
        throw error;
      }

      throw new BlobKitError(
        BlobKitErrorCode.BLOB_SUBMISSION_FAILED,
        `Failed to submit blob trx: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  fakeExponential(factor: bigint, numerator: bigint, denominator: bigint): bigint {
    let i = 1n;
    let output = 0n;
    let numerator_accum = factor * denominator;
    while (numerator_accum > 0n) {
        output += numerator_accum;
        numerator_accum = (numerator_accum * numerator) / (denominator * i);
        i += 1n;
    }
    return output; // denominator
  }

  getTotalBlobGas(blobCount: number): bigint {
    return GAS_PER_BLOB * BigInt(blobCount);
  }

  getBaseFeePerBlobGas(lastBlockExcessBlobGas: bigint): bigint {
    return this.fakeExponential(
        MIN_BASE_FEE_PER_BLOB_GAS,
        lastBlockExcessBlobGas,
        BLOB_BASE_FEE_UPDATE_FRACTION
    );
  }

  calcBlobFee(blobCount: number, lastBlockExcessBlobGas: bigint): bigint {
    return this.getTotalBlobGas(blobCount) * this.getBaseFeePerBlobGas(lastBlockExcessBlobGas);
  }

  calcExcessBlobGas(excessBlobGas: bigint, blobGasUsed: bigint): bigint {
    if (excessBlobGas + blobGasUsed < TARGET_BLOB_GAS_PER_BLOCK) {
        return 0n;
    } else {
        return excessBlobGas + blobGasUsed - TARGET_BLOB_GAS_PER_BLOCK;
    }
  }


  /**
   * Estimate the cost of submitting a blob
   */
  async estimateCost(blobCount: number): Promise<{
    blobFee: bigint;
    executionFee: bigint;
    total: bigint;
    maxFeePerBlobGas: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
  }> {
    try {
      // Get current fee data
      const feeData = await this.provider.getFeeData();
      const block = await this.provider.getBlock('latest');

      if (!feeData.maxFeePerGas || !block) {
        throw new Error('Unable to fetch fee data');
      }

      let maxFeePerGas = feeData.maxFeePerGas
      let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || 1000000000n;

      // Get actual blob base fee from network (EIP-4844)
      let blobFee = 1n; // 1 wei minimum
      const hasBlobFeeFields = (block as unknown as { blobGasUsed?: bigint | null; excessBlobGas?: bigint | null }).blobGasUsed != null
        && (block as unknown as { blobGasUsed?: bigint | null; excessBlobGas?: bigint | null }).excessBlobGas != null;
      let maxFeePerBlobGas = 1_000_000_000n; // 1 gwei minimum
      if (block.excessBlobGas === null) {
        console.warn('Block does not have excessBlobGas field, pre-4844 network?');
        console.log(`Block data: ${JSON.stringify(block)}`);
        // Pre-4844 or no blob data, use reasonable default
        blobFee = 1_000_000_000n * GAS_PER_BLOB; // 1 gwei fallback
        maxFeePerBlobGas = 1_000_000_000n; // 1 gwei fallback
 
      } else if (!this.config.eip7918) {
        blobFee = this.calcBlobFee(blobCount, block.excessBlobGas)
        maxFeePerBlobGas = this.getBaseFeePerBlobGas(block.excessBlobGas)
      }else { // EIP-7918 active
        blobFee = this.calcBlobFee(blobCount, block.excessBlobGas)
        maxFeePerBlobGas = this.getBaseFeePerBlobGas(block.excessBlobGas)
      }


      // Estimate execution gas
      const executionGas = BigInt(200000); // Reasonable estimate
      const executionFee = executionGas * maxFeePerGas + executionGas * maxPriorityFeePerGas;

      return {
        blobFee,
        executionFee,
        total: blobFee + executionFee,
        maxFeePerGas,
        maxPriorityFeePerGas,
        maxFeePerBlobGas: maxFeePerBlobGas,
      };
    } catch (error) {
      throw new BlobKitError(
        BlobKitErrorCode.NETWORK_ERROR,
        `Failed to estimate cost: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

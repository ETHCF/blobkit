/**
 * Direct blob submission for Node.js environments
 *
 * Handles blob transaction construction and submission
 * without going through the proxy server
 */

import { ethers, Transaction, Signature, ZeroAddress } from 'ethers';
import {
  Signer,
  TransactionRequest,
  BlobVersion,
  BlobKitError,
  BlobKitErrorCode,
  BlobTxData
} from './types.js';
import {
  encodeBlob,
  blobToKzgCommitment,
  computeKzgProofs,
  commitmentToVersionedHash
} from './kzg.js';
import { SerializeEIP7495 } from './serialize.js';

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
  proofs: string[];
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
    blobVersion: BlobVersion = '4844'
  ): Promise<DirectSubmitResult> {
    try {
      // Encode blob data
      const blob = encodeBlob(payload);

      // Generate KZG commitment and proof
      const commitmentHex = blobToKzgCommitment(blob);
      const proofs = computeKzgProofs(blob, commitmentHex, blobVersion);
      const versionedHash = await commitmentToVersionedHash(commitmentHex);
      const cost = await this.estimateCost(1);
      const fromAddr = await signer.getAddress();
      const nonce = await this.provider.getTransactionCount(fromAddr);
      // Construct blob transaction
      const tx: TransactionRequest = {
        chainId: this.config.chainId,
        type: 3, // EIP-4844 blob transaction
        to: '0x0000000000000000000000000000000000000000', // must be 0
        from: fromAddr,
        data: '0x',
        value: 0n,
        nonce: nonce,
        maxFeePerGas: cost.maxFeePerGas,
        maxPriorityFeePerGas: cost.maxPriorityFeePerGas,
        maxFeePerBlobGas: cost.maxFeePerBlobGas,
        blobs: [blob],
        kzgCommitments: [commitmentHex],
        kzgProofs: proofs,
        kzg: kzg, // This is necessary for the EIP-4844 transaction, do not remove
        blobVersionedHashes: [versionedHash],
      };

       // Estimate gas
      try {
        const gasLimit = await this.provider.estimateGas(tx);
        tx.gasLimit = (gasLimit * BigInt(110)) / BigInt(100); // Add 10% buffer
      } catch (error) {
        // If estimation fails, use a reasonable default
        tx.gasLimit = BigInt(200000);
      }

      let txResponse: ethers.TransactionResponse;
      let receipt: ethers.TransactionReceipt | null = null;
      if(blobVersion === '7594') {
        const blobs: BlobTxData[] = [
          {
            blob: '0x' + Buffer.from(blob).toString('hex'),
            commitment: commitmentHex,
            proofs,
            versionedHash
          }
        ]
        const unsignedSerializedTX = SerializeEIP7495(tx, null, blobs);
        const signature = await signer.signRawTransaction(unsignedSerializedTX)
        const serializedTX = SerializeEIP7495(tx, signature, blobs);
        const txHash = await this.provider._perform({
            method: "broadcastTransaction",
            signedTransaction: serializedTX
        })
        console.log(`Submitted EIP-7594 blob transaction: ${txHash}`);
        receipt = await this.provider.waitForTransaction(txHash, undefined, this.config.txTimeoutMs);
      }else{
        txResponse = await signer.sendTransaction(tx)
        receipt = await txResponse.wait(undefined, this.config.txTimeoutMs);
      }
    
      if (!receipt || receipt.status !== 1) {
        throw new BlobKitError(BlobKitErrorCode.TRANSACTION_FAILED, 'Blob transaction failed');
      }

      return {
        blobTxHash: receipt.hash,
        blockNumber: receipt.blockNumber!,
        blobHash: versionedHash,
        commitment: commitmentHex,
        proofs: proofs,
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
    return output / denominator;
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
      let maxFeePerBlobGas = 1_000_000_000n; // 1 gwei minimum
      if (block.excessBlobGas === null || block.excessBlobGas === undefined) {
        console.warn('Block does not have excessBlobGas field, pre-4844 network?');
        console.log(`Block data: ${JSON.stringify(block)}`);
        // Pre-4844 or no blob data, use reasonable default
        blobFee = 1_000_000_000n * GAS_PER_BLOB; // 1 gwei fallback
        maxFeePerBlobGas = 1_000_000_000n; // 1 gwei fallback
 
      } else if(this.config.eip7918) {
        const feeHistory = await this.provider.send("eth_feeHistory", [5, "latest", []]);
        const latestBlobFees: bigint[] = feeHistory.baseFeePerBlobGas.map((amountHex:string) => BigInt(amountHex));
        const maxFee = latestBlobFees.reduce((a, b) => a > b ? a : b, 0n);
        maxFeePerBlobGas = maxFee;
        blobFee = maxFee * this.getTotalBlobGas(blobCount);
      } else { 
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

import { ethers } from 'ethers';
import { BlobKitError, BlobKitConfig } from '../types';
import { computeContentHash } from '../blob/utils';
import { blobToKZGCommitment, commitmentToVersionedHash } from '../kzg';

export class BlobVerifier {
  private provider: ethers.JsonRpcProvider;

  constructor(config: BlobKitConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
  }

  async verifyBlob(
    data: Uint8Array,
    blobHash: string,
    blockNumber?: number
  ): Promise<boolean> {
    try {
      if (!blobHash.startsWith('0x01')) {
        throw new BlobKitError('Invalid blob hash format', 'INVALID_BLOB_HASH');
      }

      if (blockNumber !== undefined) {
        const included = await this.verifyBlobInclusion(blobHash, blockNumber);
        if (!included) return false;
      }

      return this.verifyKzgCommitment(data, blobHash);
    } catch (error) {
      throw new BlobKitError('Blob verification failed', 'VERIFICATION_FAILED', error);
    }
  }

  async verifyBlobInclusion(blobHash: string, blockNumber: number): Promise<boolean> {
    try {
      const block = await this.provider.getBlock(blockNumber);
      if (!block) {
        throw new BlobKitError(`Block not found: ${blockNumber}`, 'BLOCK_NOT_FOUND');
      }

      // Check if any transaction in the block contains this blob hash
      const blockWithTxs = await this.provider.getBlock(blockNumber, true);
      if (!blockWithTxs?.transactions) {
        return false;
      }

      for (const tx of blockWithTxs.transactions) {
        const blobHashes = (tx as any).blobVersionedHashes;
        if (blobHashes?.includes(blobHash)) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  async verifyContentHash(data: Uint8Array, expectedHash: string): Promise<boolean> {
    return computeContentHash(data) === expectedHash;
  }

  private async verifyKzgCommitment(data: Uint8Array, blobHash: string): Promise<boolean> {
    try {
      const commitment = await blobToKZGCommitment(data);
      const versionedHash = commitmentToVersionedHash(commitment);
      const computedBlobHash = '0x' + Buffer.from(versionedHash).toString('hex');
      return computedBlobHash === blobHash;
    } catch {
      return false;
    }
  }

  async verifyBlobTransaction(txHash: string): Promise<{
    valid: boolean;
    blobHashes: string[];
    blockNumber: number;
  }> {
    const [receipt, tx] = await Promise.all([
      this.provider.getTransactionReceipt(txHash),
      this.provider.getTransaction(txHash)
    ]);

    if (!receipt || !tx) {
      throw new BlobKitError(`Transaction not found: ${txHash}`, 'TX_NOT_FOUND');
    }

    const blobHashes = (tx as any).blobVersionedHashes || [];

    const validations = await Promise.all(
      blobHashes.map((hash: string) => this.verifyBlobInclusion(hash, receipt.blockNumber))
    );

    return {
      valid: validations.every(Boolean),
      blobHashes,
      blockNumber: receipt.blockNumber
    };
  }
}

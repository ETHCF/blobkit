import { ethers } from 'ethers';
import { BlobMeta, BlobReadResult, BlobKitError, BlobKitConfig, BlobKitErrorCode } from './types';
import { decodeBlob } from './kzg';
import { defaultCodecRegistry } from './codecs';

export class BlobReader {
  private provider: ethers.JsonRpcProvider;

  constructor(private config: BlobKitConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
  }

  async readBlob(blobHashOrTxHash: string, index: number = 0): Promise<BlobReadResult> {
    return this.getBlobData(blobHashOrTxHash, index);
  }

  async readBlobWithMeta(blobHashOrTxHash: string, index: number = 0): Promise<BlobReadResult> {
    return this.getBlobData(blobHashOrTxHash, index);
  }

  private async getBlobData(input: string, index: number): Promise<BlobReadResult> {
    if (input.startsWith('0x01')) {
      return this.getBlobByHash(input);
    } else {
      return this.getBlobByTxHash(input, index);
    }
  }

  private async getBlobByTxHash(txHash: string, index: number): Promise<BlobReadResult> {
    const tx = await this.provider.getTransaction(txHash);
    if (!tx) {
      throw new BlobKitError(BlobKitErrorCode.BLOB_NOT_FOUND, `Transaction not found: ${txHash}`);
    }

    const blobHashes = (tx as any).blobVersionedHashes;
    if (!blobHashes?.length) {
      throw new BlobKitError(BlobKitErrorCode.BLOB_NOT_FOUND, 'No blobs found in transaction');
    }

    return this.getBlobByHash(blobHashes[index]);
  }


  private async getBlobByHash(blobHash: string): Promise<BlobReadResult> {
    let blob = await this.fetchBlobFromNode(blobHash);
    
    if (!blob && this.config.archiveUrl) {
      blob = await this.fetchBlobFromArchive(blobHash);
    }

    if (!blob) {
      throw new BlobKitError(BlobKitErrorCode.BLOB_NOT_FOUND, `Blob not found: ${blobHash}`);
    }

    const blobData =  decodeBlob(blob);
    return {
      data: blobData,
      blobIndex: 0,
      source: 'rpc'
    }
  }

  private async fetchBlobFromNode(blobHash: string): Promise<Uint8Array | null> {
    try {
      const result = await this.provider.send('eth_getBlobSidecars', [blobHash]);
      if (result?.[0]?.blob) {
        return ethers.getBytes(result[0].blob);
      }
    } catch {
      // Node doesn't have blob
    }
    return null;
  }

  private async fetchBlobFromArchive(blobHash: string): Promise<Uint8Array | null> {
    try {
      const response = await fetch(`${this.config.archiveUrl}/blob/${blobHash}`);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        return new Uint8Array(arrayBuffer);
      }
    } catch {
      // Archive fetch failed
    }
    return null;
  }
  static decodeToString(data: Uint8Array): string {
    // Remove trailing zeros (blob padding)
    let end = data.length;
    while (end > 0 && data[end - 1] === 0) {
      end--;
    }
    const trimmed = data.slice(0, end);
    return new TextDecoder().decode(trimmed);
  }

  /**
   * Decode blob data to JSON object
   */
  static decodeToJSON(data: Uint8Array): unknown {
    const str = BlobReader.decodeToString(data);
    return JSON.parse(str);
  }
}
import { ethers } from 'ethers';
import { BlobMeta, BlobReadResult, BlobKitError, BlobKitConfig, BlobKitErrorCode } from './types';
import { decodeBlob } from './kzg';
import { defaultCodecRegistry } from './codecs';
import { hexToBytes } from './utils';

export class BlobReader {
  private provider: ethers.JsonRpcProvider;
  private archiveUrl?: string;

  constructor(config: BlobKitConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.archiveUrl = config.archiveUrl;
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

    let blob: Uint8Array<ArrayBufferLike> | null = null;
    if (this.archiveUrl) {
      blob = await this.fetchBlobFromArchive(blobHash);
    }
    if (!blob ) {
      blob = await this.fetchBlobFromNode(blobHash);
    }

    if (!blob) {
      throw new BlobKitError(BlobKitErrorCode.BLOB_NOT_FOUND, `Blob not found: ${blobHash}`);
    }

    const blobData = decodeBlob(blob);
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
    } catch (error) {
      console.error('Error fetching blob from node:', error);
    }
    return null;
  }

  private async fetchBlobFromArchive(blobHash: string): Promise<Uint8Array | null> {
    try {
      const endpointUrl = `${this.archiveUrl}/blobs/${blobHash}/data`
      const response = await fetch(endpointUrl);
      if (response.ok) {
        let dataHex = await response.text();
        if(dataHex[0]=='"')
          dataHex = dataHex.slice(1, -1);
        return hexToBytes(dataHex)
      }else{
        console.error(await response.text())
      }
    } catch (error) {
      console.error('Error fetching blob from archive:', error);
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
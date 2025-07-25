import { ethers } from 'ethers';
import { BlobMeta, BlobData, BlobKitError, BlobKitConfig } from '../types';
import { decodeBlob } from './utils';
import { getCodec } from '../codecs/registry';

export class BlobReader {
  private provider: ethers.JsonRpcProvider;

  constructor(private config: BlobKitConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
  }

  async readBlob(blobHashOrTxHash: string): Promise<Uint8Array> {
    const blobData = await this.getBlobData(blobHashOrTxHash);
    return blobData.data;
  }

  async readBlobWithMeta(blobHashOrTxHash: string): Promise<BlobData> {
    return this.getBlobData(blobHashOrTxHash);
  }

  private async getBlobData(input: string): Promise<BlobData> {
    if (input.startsWith('0x01')) {
      return this.getBlobByHash(input);
    } else {
      return this.getBlobByTxHash(input);
    }
  }

  private async getBlobByTxHash(txHash: string): Promise<BlobData> {
    const tx = await this.provider.getTransaction(txHash);
    if (!tx) {
      throw new BlobKitError(`Transaction not found: ${txHash}`, 'TX_NOT_FOUND');
    }

    const blobHashes = (tx as any).blobVersionedHashes;
    if (!blobHashes?.length) {
      throw new BlobKitError('No blobs found in transaction', 'NO_BLOBS');
    }

    return this.getBlobByHash(blobHashes[0]);
  }

  private async getBlobByHash(blobHash: string): Promise<BlobData> {
    let blob = await this.fetchBlobFromNode(blobHash);
    
    if (!blob && this.config.archiveUrl) {
      blob = await this.fetchBlobFromArchive(blobHash);
    }

    if (!blob) {
      throw new BlobKitError(`Blob not found: ${blobHash}`, 'BLOB_NOT_FOUND');
    }

    return this.decodeBlobData(blob);
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

  private decodeBlobData(blob: Uint8Array): BlobData {
    const decodedData = decodeBlob(blob, true);
    const dataView = new DataView(decodedData.buffer);
    const metaLength = dataView.getUint32(0, false);

    const metaBytes = decodedData.slice(4, 4 + metaLength);
    const meta: BlobMeta = JSON.parse(new TextDecoder().decode(metaBytes));

    const payloadBytes = decodedData.slice(4 + metaLength);
    const codec = getCodec(meta.codec);
    
    if (!codec) {
      throw new BlobKitError(`Unknown codec: ${meta.codec}`, 'UNKNOWN_CODEC');
    }

    return {
      data: codec.decode(payloadBytes) as Uint8Array,
      meta
    };
  }
}

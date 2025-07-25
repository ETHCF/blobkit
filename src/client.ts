import { BlobWriter } from './writer';
import { BlobReader } from './blob/reader';
import { BlobVerifier } from './verifier';
import { registerDefaultCodecs } from './codecs';
import { BlobKitConfig, BlobMeta, BlobReceipt, BlobData } from './types';

export class BlobKit {
  private readonly writer: BlobWriter;
  private readonly reader: BlobReader;
  private readonly verifier: BlobVerifier;

  constructor(config: BlobKitConfig, privateKey?: string) {
    this.writer = new BlobWriter(config, privateKey);
    this.reader = new BlobReader(config);
    this.verifier = new BlobVerifier(config);

    registerDefaultCodecs();
  }

  writeBlob(payload: unknown, meta?: Partial<BlobMeta>): Promise<BlobReceipt> {
    return this.writer.writeBlob(payload, meta);
  }

  readBlob(blobHashOrTxHash: string): Promise<Uint8Array> {
    return this.reader.readBlob(blobHashOrTxHash);
  }

  readBlobWithMeta(blobHashOrTxHash: string): Promise<BlobData> {
    return this.reader.readBlobWithMeta(blobHashOrTxHash);
  }

  async verifyBlob(
    data: Uint8Array,
    blobHash: string,
    blockNumber?: number
  ): Promise<boolean> {
    return this.verifier.verifyBlob(data, blobHash, blockNumber);
  }

  verifyBlobTransaction(txHash: string): Promise<{
    valid: boolean;
    blobHashes: string[];
    blockNumber: number;
  }> {
    return this.verifier.verifyBlobTransaction(txHash);
  }
}

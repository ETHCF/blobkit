import { ethers } from 'ethers';
import { BlobMeta, BlobReceipt, BlobKitError, BlobKitConfig } from '../types';
import { encodeBlob, computeContentHash } from '../blob/utils';
import { getCodec } from '../codecs/registry';
import { blobToKZGCommitment, computeKZGProof, commitmentToVersionedHash } from '../kzg';

export class BlobWriter {
  private provider: ethers.JsonRpcProvider;
  private wallet?: ethers.Wallet;

  constructor(private config: BlobKitConfig, privateKey?: string) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    if (privateKey) {
      this.wallet = new ethers.Wallet(privateKey, this.provider);
    }
  }

  async writeBlob(payload: unknown, meta: Partial<BlobMeta> = {}): Promise<BlobReceipt> {
    if (!this.wallet) {
      throw new BlobKitError('No wallet configured', 'NO_WALLET');
    }

    const fullMeta: BlobMeta = {
      appId: meta.appId || 'blobkit',
      codec: meta.codec || this.config.defaultCodec || 'application/json',
      timestamp: meta.timestamp || Date.now(),
      ...meta
    };

    const codec = getCodec(fullMeta.codec);
    if (!codec) {
      throw new BlobKitError(`Unknown codec: ${fullMeta.codec}`, 'UNKNOWN_CODEC');
    }

    const encodedPayload = codec.encode(payload);
    fullMeta.contentHash = computeContentHash(encodedPayload);

    // Pack metadata and payload
    const metaBytes = new TextEncoder().encode(JSON.stringify(fullMeta));
    const combined = new Uint8Array(4 + metaBytes.length + encodedPayload.length);
    
    new DataView(combined.buffer).setUint32(0, metaBytes.length, false);
    combined.set(metaBytes, 4);
    combined.set(encodedPayload, 4 + metaBytes.length);

    const blob = encodeBlob(combined, true);
    const commitment = await blobToKZGCommitment(blob);
    const { proof } = await computeKZGProof(blob, 0n);

    const commitmentHex = '0x' + Buffer.from(commitment).toString('hex');
    const proofHex = '0x' + Buffer.from(proof).toString('hex');
    const blobHash = '0x' + Buffer.from(commitmentToVersionedHash(commitment)).toString('hex');

    const txResponse = await this.sendBlobTransaction(blob, commitmentHex, proofHex);
    const receipt = await txResponse.wait();

    if (!receipt) {
      throw new BlobKitError('Transaction failed', 'TX_FAILED');
    }

    return {
      txHash: receipt.hash,
      blobHash,
      blockNumber: receipt.blockNumber,
      contentHash: fullMeta.contentHash!
    };
  }

  private async sendBlobTransaction(
    blob: Uint8Array,
    commitment: string,
    proof: string
  ): Promise<ethers.TransactionResponse> {
    const feeData = await this.provider.getFeeData();
    const blobGasPrice = await this.estimateBlobGasPrice();

    const tx = {
      type: 3,
      to: '0x0000000000000000000000000000000000000000',
      data: '0x',
      value: 0n,
      gasLimit: 21000n,
      maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits('20', 'gwei'),
      maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei'),
      maxFeePerBlobGas: blobGasPrice,
      blobs: [blob],
      kzgCommitments: [commitment],
      kzgProofs: [proof],
      chainId: this.config.chainId || 1
    };

    return this.wallet!.sendTransaction(tx as any);
  }

  private async estimateBlobGasPrice(): Promise<bigint> {
    try {
      const block = await this.provider.getBlock('latest');
      if (block && 'blobGasPrice' in block) {
        return BigInt((block as any).blobGasPrice);
      }
    } catch {
      // Fallback
    }
    return ethers.parseUnits('1', 'gwei');
  }
}

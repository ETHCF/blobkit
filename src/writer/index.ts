import { ethers } from 'ethers';
import { BlobMeta, BlobReceipt, BlobKitError, BlobKitConfig } from '../types';
import { encodeBlob, computeContentHash } from '../blob/utils';
import { getCodec } from '../codecs/registry';
import { blobToKZGCommitment, computeKZGProof, commitmentToVersionedHash } from '../kzg';

export class BlobWriter {
  private provider: ethers.JsonRpcProvider;
  private signer?: ethers.Signer;

  constructor(config: BlobKitConfig, privateKey?: string);
  constructor(config: BlobKitConfig, signer?: ethers.Signer);
  constructor(private config: BlobKitConfig, signerOrPrivateKey?: string | ethers.Signer) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    
    if (signerOrPrivateKey) {
      if (typeof signerOrPrivateKey === 'string') {
        // Backward compatibility: private key string
        this.signer = new ethers.Wallet(signerOrPrivateKey, this.provider);
      } else {
        // Modern usage: external signer (MetaMask, WalletConnect, etc.)
        this.signer = signerOrPrivateKey;
      }
    }
  }

  async writeBlob(payload: unknown, meta: Partial<BlobMeta> = {}): Promise<BlobReceipt> {
    if (!this.signer) {
      throw new BlobKitError('No signer configured', 'NO_SIGNER');
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

    // Size validation removed to allow applications to implement their own chunking
    // The encodeBlob function will handle the data regardless of size

    const blob = await encodeBlob(combined, true);
    const commitment = await blobToKZGCommitment(blob);
    const { proof } = await computeKZGProof(blob, 0n);

    // Convert Uint8Array to hex without Buffer
    const commitmentHex = '0x' + Array.from(commitment).map(b => b.toString(16).padStart(2, '0')).join('');
    const proofHex = '0x' + Array.from(proof).map(b => b.toString(16).padStart(2, '0')).join('');
    const versionedHash = commitmentToVersionedHash(commitment);
    const blobHash = '0x' + Array.from(versionedHash).map(b => b.toString(16).padStart(2, '0')).join('');

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
    // Check if we're using MetaMask or another injected wallet
    const isInjectedWallet = await this.isInjectedWallet();
    
    if (isInjectedWallet) {
      throw new BlobKitError(
        'MetaMask and browser wallets do not yet support EIP-4844 blob transactions (type 0x3). ' +
        'Please use a Node.js environment with a private key, or wait for wallet support. ' +
        'Track MetaMask support at: https://github.com/MetaMask/metamask-extension/issues',
        'WALLET_NOT_SUPPORTED'
      );
    }

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

    return this.signer!.sendTransaction(tx as any);
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

  private async isInjectedWallet(): Promise<boolean> {
    if (!this.signer) return false;
    
    try {
      // Check if the signer has a provider
      const provider = (this.signer as any).provider;
      if (!provider) return false;
      
      // Check for common injected wallet properties
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        // Check if the provider is the same as window.ethereum
        const connection = (provider as any)._getConnection?.();
        if (connection?.url === 'metamask' || connection?.url === 'eip-1193:') {
          return true;
        }
        
        // Check if provider is a Web3Provider wrapping window.ethereum
        if ((provider as any)._isProvider && (provider as any).provider === (window as any).ethereum) {
          return true;
        }
        
        // Check for MetaMask specific properties
        if ((window as any).ethereum.isMetaMask) {
          return true;
        }
      }
      
      return false;
    } catch {
      return false;
    }
  }
}

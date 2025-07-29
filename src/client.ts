import { ethers } from 'ethers';
import { BlobWriter } from './writer';
import { BlobReader } from './blob/reader';
import { BlobVerifier } from './verifier';
import { registerDefaultCodecs } from './codecs';
import { 
  BlobKitConfig, 
  BlobMeta, 
  BlobReceipt, 
  BlobData, 
  BlobKitError,
  isValidBlobHash,
  isValidTxHash 
} from './types';

/**
 * Main BlobKit client for interacting with Ethereum blob space.
 * Provides high-level APIs for writing, reading, and verifying blob data.
 */
export class BlobKit {
  private readonly writer: BlobWriter;
  private readonly reader: BlobReader;
  private readonly verifier: BlobVerifier;

  /**
   * Creates a new BlobKit instance.
   * @param config - Configuration for the client
   * @param privateKey - Optional private key for write operations
   */
  constructor(config: BlobKitConfig, privateKey?: string);
  /**
   * Creates a new BlobKit instance.
   * @param config - Configuration for the client
   * @param signer - Optional ethers Signer for write operations (MetaMask, WalletConnect, etc.)
   */
  constructor(config: BlobKitConfig, signer?: ethers.Signer);
  /**
   * Creates a new BlobKit instance.
   * @param config - Configuration for the client
   * @param signerOrPrivateKey - Either a private key string or ethers Signer
   */
  constructor(config: BlobKitConfig, signerOrPrivateKey?: string | ethers.Signer);
  constructor(config: BlobKitConfig, signerOrPrivateKey?: string | ethers.Signer) {
    // Validate configuration
    if (!config.rpcUrl) {
      throw new BlobKitError('RPC URL is required', 'INVALID_CONFIG');
    }

    this.writer = new BlobWriter(config, signerOrPrivateKey as any);
    this.reader = new BlobReader(config);
    this.verifier = new BlobVerifier(config);

    registerDefaultCodecs();
  }

  /**
   * Writes data to blob space as an ephemeral, verifiable blob.
   * @param payload - Data to store in the blob
   * @param meta - Optional metadata for the blob
   * @returns Promise resolving to a receipt with blob hash and transaction details
   */
  async writeBlob(payload: unknown, meta?: Partial<BlobMeta>): Promise<BlobReceipt> {
    if (payload === null || payload === undefined) {
      throw new BlobKitError('Payload cannot be null or undefined', 'INVALID_PAYLOAD');
    }

    return this.writer.writeBlob(payload, meta);
  }

  /**
   * Reads blob data by blob hash or transaction hash.
   * @param blobHashOrTxHash - Blob hash (0x01...) or transaction hash (0x...)
   * @returns Promise resolving to the raw blob data
   */
  async readBlob(blobHashOrTxHash: string): Promise<Uint8Array> {
    this.validateBlobOrTxHash(blobHashOrTxHash);
    return this.reader.readBlob(blobHashOrTxHash);
  }

  /**
   * Reads blob data with metadata by blob hash or transaction hash.
   * @param blobHashOrTxHash - Blob hash (0x01...) or transaction hash (0x...)
   * @returns Promise resolving to blob data with metadata
   */
  async readBlobWithMeta(blobHashOrTxHash: string): Promise<BlobData> {
    this.validateBlobOrTxHash(blobHashOrTxHash);
    return this.reader.readBlobWithMeta(blobHashOrTxHash);
  }

  /**
   * Verifies the integrity and authenticity of blob data.
   * @param data - Raw blob data to verify
   * @param blobHash - Expected blob hash
   * @param blockNumber - Optional block number for inclusion verification
   * @returns Promise resolving to true if verification passes
   */
  async verifyBlob(
    data: Uint8Array,
    blobHash: string,
    blockNumber?: number
  ): Promise<boolean> {
    if (!data || data.length === 0) {
      throw new BlobKitError('Data cannot be empty', 'INVALID_DATA');
    }

    if (!isValidBlobHash(blobHash)) {
      throw new BlobKitError('Invalid blob hash format', 'INVALID_BLOB_HASH');
    }

    if (blockNumber !== undefined && (blockNumber < 0 || !Number.isInteger(blockNumber))) {
      throw new BlobKitError('Block number must be a non-negative integer', 'INVALID_BLOCK_NUMBER');
    }

    return this.verifier.verifyBlob(data, blobHash, blockNumber);
  }

  /**
   * Verifies a blob transaction and all its blobs.
   * @param txHash - Transaction hash to verify
   * @returns Promise resolving to verification results
   */
  async verifyBlobTransaction(txHash: string): Promise<{
    valid: boolean;
    blobHashes: string[];
    blockNumber: number;
  }> {
    if (!isValidTxHash(txHash)) {
      throw new BlobKitError('Invalid transaction hash format', 'INVALID_TX_HASH');
    }

    return this.verifier.verifyBlobTransaction(txHash);
  }

  /**
   * Validates blob hash or transaction hash format.
   * @private
   */
  private validateBlobOrTxHash(hash: string): void {
    if (!hash || typeof hash !== 'string') {
      throw new BlobKitError('Hash must be a non-empty string', 'INVALID_HASH');
    }

    const isValidBlob = isValidBlobHash(hash);
    const isValidTx = isValidTxHash(hash);

    if (!isValidBlob && !isValidTx) {
      throw new BlobKitError(
        'Invalid hash format: must be a valid blob hash (0x01...) or transaction hash',
        'INVALID_HASH_FORMAT'
      );
    }
  }
}

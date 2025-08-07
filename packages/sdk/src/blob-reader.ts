/**
 * BlobKit Blob Reader
 *
 * Handles reading blob data from Ethereum nodes and archive sources
 */

import { ethers } from 'ethers';
import { BlobKitError, BlobKitErrorCode, BlobReadResult } from './types.js';
import { Logger } from './logger.js';
import { hexToBytes } from './utils.js';

interface BlobReaderConfig {
  rpcUrl: string;
  archiveUrl?: string;
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'silent';
}

/**
 * Service for reading blob data from various sources
 */
export class BlobReader {
  private provider: ethers.JsonRpcProvider;
  private logger: Logger;

  constructor(private config: BlobReaderConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.logger = new Logger({ context: 'BlobReader', level: config.logLevel as any });
  }

  /**
   * Read blob data by transaction hash and optional index
   * @param blobTxHash Transaction hash containing the blob
   * @param blobIndex Index of blob within transaction (default: 0)
   * @returns Raw blob data
   */
  async readBlob(blobTxHash: string, blobIndex: number = 0): Promise<BlobReadResult> {
    this.logger.debug(`Reading blob from tx ${blobTxHash} at index ${blobIndex}`);

    // Validate inputs
    if (!blobTxHash || !blobTxHash.match(/^0x[a-fA-F0-9]{64}$/)) {
      throw new BlobKitError(BlobKitErrorCode.INVALID_CONFIG, 'Invalid blob transaction hash');
    }

    if (blobIndex < 0 || blobIndex > 5) {
      throw new BlobKitError(BlobKitErrorCode.INVALID_CONFIG, 'Blob index must be between 0 and 5');
    }

    // Try archive URL first if configured
    if (this.config.archiveUrl) {
      try {
        const result = await this.readFromArchive(blobTxHash, blobIndex);
        if (result) {
          this.logger.debug(`Successfully read blob from archive`);
          return result;
        }
      } catch (error) {
        this.logger.debug(`Archive read failed, falling back to RPC: ${error}`);
      }
    }

    // Try reading from RPC
    try {
      return await this.readFromRPC(blobTxHash, blobIndex);
    } catch (rpcError) {
      // Try fallback services as last resort
      try {
        return await this.readFromFallback(blobTxHash, blobIndex);
      } catch (fallbackError) {
        throw new BlobKitError(
          BlobKitErrorCode.BLOB_NOT_FOUND,
          `Failed to read blob: ${rpcError instanceof Error ? rpcError.message : String(rpcError)}`
        );
      }
    }
  }

  /**
   * Read blob from archive URL
   */
  private async readFromArchive(
    blobTxHash: string,
    blobIndex: number
  ): Promise<BlobReadResult | null> {
    if (!this.config.archiveUrl) {
      return null;
    }

    const url = `${this.config.archiveUrl}/${blobTxHash}`;
    if (blobIndex > 0) {
      // Archive might store blobs with index suffix
      const indexedUrl = `${this.config.archiveUrl}/${blobTxHash}_${blobIndex}`;
      try {
        const response = await fetch(indexedUrl, {
          method: 'GET',
          headers: {
            Accept: 'application/octet-stream'
          },
          signal: AbortSignal.timeout(30000) // 30 second timeout
        });

        if (response.ok) {
          const data = new Uint8Array(await response.arrayBuffer());
          return {
            data,
            blobTxHash,
            blobIndex,
            source: 'archive'
          };
        }
      } catch {
        // Try without index suffix
      }
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/octet-stream'
      },
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new BlobKitError(
        BlobKitErrorCode.ARCHIVE_READ_FAILED,
        `Archive returned ${response.status}: ${response.statusText}`
      );
    }

    const data = new Uint8Array(await response.arrayBuffer());
    return {
      data,
      blobTxHash,
      blobIndex,
      source: 'archive'
    };
  }

  /**
   * Read blob from Ethereum RPC
   */
  private async readFromRPC(blobTxHash: string, blobIndex: number): Promise<BlobReadResult> {
    // First, get the transaction to verify it exists and has blobs
    const tx = await this.provider.getTransaction(blobTxHash);
    if (!tx) {
      throw new BlobKitError(
        BlobKitErrorCode.BLOB_NOT_FOUND,
        `Transaction ${blobTxHash} not found`
      );
    }

    // Check if transaction is type 3 (blob transaction)
    if (tx.type !== 3) {
      throw new BlobKitError(
        BlobKitErrorCode.BLOB_NOT_FOUND,
        `Transaction ${blobTxHash} is not a blob transaction`
      );
    }

    // Try eth_getBlobs if available (not standard yet)
    try {
      const blobs = await this.provider.send('eth_getBlobs', [blobTxHash]);
      if (blobs && Array.isArray(blobs) && blobs[blobIndex]) {
        const data = hexToBytes(blobs[blobIndex]);
        return {
          data,
          blobTxHash,
          blobIndex,
          source: 'rpc'
        };
      }
    } catch {
      // Method might not be available
    }

    // Try eth_getBlobByHash if available
    try {
      const blobHashes = tx.blobVersionedHashes;
      if (!blobHashes || blobHashes.length <= blobIndex) {
        throw new BlobKitError(
          BlobKitErrorCode.BLOB_NOT_FOUND,
          `Transaction has no blob at index ${blobIndex}`
        );
      }

      const blobHash = blobHashes[blobIndex];
      const blob = await this.provider.send('eth_getBlobByHash', [blobHash]);
      if (blob) {
        const data = hexToBytes(blob);
        return {
          data,
          blobTxHash,
          blobIndex,
          source: 'rpc'
        };
      }
    } catch {
      // Method might not be available
    }

    // Try getting full block with blobs bundle
    const block = await this.provider.getBlock(tx.blockNumber!, true);
    if (!block) {
      throw new BlobKitError(BlobKitErrorCode.BLOB_READ_FAILED, 'Failed to get block data');
    }

    // Try eth_getBlockByHash with includeBlobs parameter
    try {
      const blockWithBlobs = await this.provider.send('eth_getBlockByHash', [
        block.hash,
        true, // include transactions
        true // include blobs (non-standard parameter)
      ]);

      if (blockWithBlobs?.blobsBundle?.blobs) {
        // Find the transaction index
        const txIndex = blockWithBlobs.transactions.findIndex(
          (t: { hash: string }) => t.hash === blobTxHash
        );

        if (txIndex >= 0) {
          // Calculate blob position in the bundle
          let blobPosition = 0;
          for (let i = 0; i < txIndex; i++) {
            const prevTx = blockWithBlobs.transactions[i];
            if (prevTx.type === '0x3' && prevTx.blobVersionedHashes) {
              blobPosition += prevTx.blobVersionedHashes.length;
            }
          }
          blobPosition += blobIndex;

          const blobData = blockWithBlobs.blobsBundle.blobs[blobPosition];
          if (blobData) {
            const data = hexToBytes(blobData);
            return {
              data,
              blobTxHash,
              blobIndex,
              source: 'rpc'
            };
          }
        }
      }
    } catch {
      // Non-standard method, might not be available
    }

    throw new BlobKitError(
      BlobKitErrorCode.BLOB_READ_FAILED,
      'RPC does not support blob reading methods'
    );
  }

  /**
   * Read blob from fallback services
   */
  private async readFromFallback(blobTxHash: string, blobIndex: number): Promise<BlobReadResult> {
    // Try blobscan.io API
    try {
      const response = await fetch(`https://api.blobscan.io/blobs/${blobTxHash}/${blobIndex}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        },
        signal: AbortSignal.timeout(30000)
      });

      if (response.ok) {
        const result = await response.json();
        if (result.data) {
          const data = hexToBytes(result.data);
          return {
            data,
            blobTxHash,
            blobIndex,
            source: 'fallback'
          };
        }
      }
    } catch {
      // Try next fallback
    }

    // Try blob.ethpandaops.io
    try {
      const tx = await this.provider.getTransaction(blobTxHash);
      if (!tx || !tx.blobVersionedHashes || tx.blobVersionedHashes.length <= blobIndex) {
        throw new BlobKitError(BlobKitErrorCode.BLOB_NOT_FOUND, `No blob at index ${blobIndex}`);
      }

      const blobHash = tx.blobVersionedHashes[blobIndex];
      const response = await fetch(`https://blob.ethpandaops.io/api/blob/${blobHash}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        },
        signal: AbortSignal.timeout(30000)
      });

      if (response.ok) {
        const result = await response.json();
        if (result.blob_data) {
          const data = hexToBytes(result.blob_data);
          return {
            data,
            blobTxHash,
            blobIndex,
            source: 'fallback'
          };
        }
      }
    } catch {
      // No more fallbacks
    }

    throw new BlobKitError(BlobKitErrorCode.BLOB_NOT_FOUND, 'All fallback services failed');
  }

  /**
   * Decode blob data to UTF-8 string
   */
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

/**
 * Proxy client for BlobKit
 *
 * Handles communication with the BlobKit proxy server
 */

import { BlobMeta, ProxyHealthResponse, BlobKitError, BlobKitErrorCode } from './types.js';
import { sleep } from './utils.js';
import { Logger } from './logger.js';

export interface ProxyClientConfig {
  proxyUrl: string;
  requestSigningSecret?: string;
  logLevel?: 'debug' | 'info' | 'silent';
}

export interface BlobSubmitResult {
  blobTxHash: string;
  blockNumber: number;
  blobHash: string;
  commitment: string;
  proofs: string[];
  blobIndex: number;
  completionTxHash: string;
}

export class ProxyClient {
  private logger: Logger;

  constructor(private config: ProxyClientConfig) {
    this.logger = new Logger({ context: 'ProxyClient', level: config.logLevel as any });
  }

  /**
   * Submit blob data to proxy server
   */
  async submitBlob(data: {
    jobId: string;
    paymentTxHash: string;
    payload: Uint8Array;
    signature: Uint8Array;
    meta: BlobMeta;
  }): Promise<BlobSubmitResult> {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const requestBody = {
          jobId: data.jobId,
          paymentTxHash: data.paymentTxHash,
          payload: Buffer.from(data.payload).toString('base64'),
          signature: Buffer.from(data.signature).toString('base64'),
          meta: data.meta
        };

        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };


        const response = await fetch(`${this.config.proxyUrl}/api/v1/blob/write`, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(60000) // 60 second timeout
        });

        if (!response || !response.ok) {
          const errorText = response ? await response.text() : 'No response received';

          // Don't retry on client errors (4xx)
          if (response && response.status >= 400 && response.status < 500) {
            throw new BlobKitError(
              BlobKitErrorCode.PROXY_ERROR,
              `Proxy request failed: ${response.status} ${errorText}`
            );
          }

          // Retry on server errors (5xx)
          if (attempt < maxRetries && response && response.status >= 500) {
            const delay = baseDelay * Math.pow(2, attempt);
            this.logger.info(
              `Proxy request failed with ${response.status}, retrying in ${delay}ms...`
            );
            await sleep(delay);
            continue;
          }

          throw new BlobKitError(
            BlobKitErrorCode.PROXY_ERROR,
            `Proxy request failed: ${errorText}`
          );
        }

        const result = await response.json();

        if (!result.success) {
          throw new BlobKitError(
            BlobKitErrorCode.PROXY_ERROR,
            result.error || 'Proxy request failed'
          );
        }

        return {
          blobTxHash: result.blobTxHash,
          blockNumber: result.blockNumber,
          blobHash: result.blobHash,
          commitment: result.commitment,
          proofs: result.proofs,
          blobIndex: result.blobIndex,
          completionTxHash: result.completionTxHash
        };
      } catch (error) {
        // If it's already a BlobKitError, re-throw
        if (error instanceof BlobKitError) {
          throw error;
        }

        // Network errors - retry if we have attempts left
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          this.logger.info(`Network error, retrying in ${delay}ms...`, { error: String(error) });
          await sleep(delay);
          continue;
        }

        throw new BlobKitError(
          BlobKitErrorCode.NETWORK_ERROR,
          `Failed to submit blob: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    throw new BlobKitError(BlobKitErrorCode.PROXY_ERROR, 'Max retries exceeded');
  }

  /**
   * Get proxy health status
   */
  async getHealth(): Promise<ProxyHealthResponse> {
    try {
      const response = await fetch(`${this.config.proxyUrl}/api/v1/health`, {
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      throw new BlobKitError(
        BlobKitErrorCode.NETWORK_ERROR,
        `Failed to check proxy health: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Discover proxy URL for a given chain
   */
  static async discover(chainId: number, currentUrl?: string): Promise<string> {
    // Check current URL first
    if (currentUrl) {
      try {
        const response = await fetch(`${currentUrl}/api/v1/health`, {
          signal: AbortSignal.timeout(5000)
        });

        if (response.ok) {
          const health = await response.json();
          if (health.chainId === chainId) {
            return currentUrl;
          }
        }
      } catch {
        // Continue to discovery
      }
    }

    // Check environment variable
    const envUrl = process.env?.BLOBKIT_PROXY_URL;
    if (envUrl) {
      try {
        const response = await fetch(`${envUrl}/api/v1/health`, {
          signal: AbortSignal.timeout(5000)
        });

        if (response.ok) {
          const health = await response.json();
          if (health.chainId === chainId) {
            return envUrl;
          }
        }
      } catch {
        // Continue to error
      }
    }

    throw new BlobKitError(
      BlobKitErrorCode.PROXY_NOT_FOUND,
      `No proxy found for chain ${chainId}. Please configure proxyUrl.`
    );
  }
}

/**
 * BlobKit SDK - Browser Entry Point
 * Optimized build for browser environments with MetaMask integration
 * Exposes only browser-safe APIs (no Node.js built-ins like 'crypto' or 'fs')
 */

import type { BlobKitConfig } from './types.js';
import type { Signer } from 'ethers';
export type {
  BlobKitConfig,
  BlobKitEnvironment,
  BlobMeta,
  BlobReceipt,
  BlobReadResult,
  CostEstimate,
  JobStatus,
  ProxyHealthResponse,
  TransactionRequest,
  TransactionResponse,
  TransactionReceipt,
  Provider,
  FeeData,
} from './types.js';

export { BlobKit } from './blobkit.js';
export { BlobReader } from './blob-reader.js';
export { detectEnvironment, getEnvironmentCapabilities } from './environment.js';
export { defaultCodecRegistry, JsonCodec, RawCodec, TextCodec } from './codecs/index.js';
export {
  generateJobId,
  calculatePayloadHash,
  formatEther,
  parseEther,
  isValidAddress,
  validateBlobSize,
  bytesToHex,
  hexToBytes
} from './utils.js';

// Browser-specific utilities
// Window type extension for MetaMask
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      isMetaMask?: boolean;
    };
  }
}

export const connectMetaMask = async (): Promise<Signer> => {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error(
      'MetaMask not detected. Please install MetaMask to use BlobKit in the browser.'
    );
  }

  const ethereum = window.ethereum;

  try {
    // Request account access
    await ethereum.request({ method: 'eth_requestAccounts' });

    // Create ethers provider and signer
    const { ethers } = await import('ethers');
    const provider = new ethers.BrowserProvider(ethereum);
    const signer = await provider.getSigner();

    return signer;
  } catch (error) {
    throw new Error(
      `Failed to connect to MetaMask: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

/**
 * Creates a BlobKit instance with MetaMask integration
 * @param config BlobKit configuration
 * @returns BlobKit Ready-to-use BlobKit instance
 */
export const createWithMetaMask = async (config: BlobKitConfig) => {
  const { BlobKit } = await import('./blobkit.js');
  const signer = await connectMetaMask();
  // Signer from ethers is now directly compatible
  return new BlobKit(config, signer as any);
};

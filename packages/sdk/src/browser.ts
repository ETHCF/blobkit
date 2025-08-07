/**
 * BlobKit SDK - Browser Entry Point
 * Optimized build for browser environments with MetaMask integration
 */

// Re-export everything from main index
export * from './index.js';
import type { BlobKitConfig } from './types.js';
import type { Signer } from 'ethers';

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
  return new BlobKit(config, signer);
};

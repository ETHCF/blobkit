/**
 * BlobKit SDK - Browser Entry Point
 * Optimized build for browser environments with MetaMask integration
 */

// Re-export everything from main index
export * from './index.js';

// Browser-specific utilities
export const connectMetaMask = async () => {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('MetaMask not detected. Please install MetaMask to use BlobKit in the browser.');
  }

  const ethereum = (window as any).ethereum;
  
  try {
    // Request account access
    await ethereum.request({ method: 'eth_requestAccounts' });
    
    // Create ethers provider and signer
    const { ethers } = await import('ethers');
    const provider = new ethers.BrowserProvider(ethereum);
    const signer = await provider.getSigner();
    
    return signer;
  } catch (error) {
    throw new Error(`Failed to connect to MetaMask: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Creates a BlobKit instance with MetaMask integration
 * @param config BlobKit configuration
 * @returns Promise<BlobKit> Ready-to-use BlobKit instance
 */
export const createWithMetaMask = async (config: any) => {
  const { BlobKit } = await import('./blobkit.js');
  const signer = await connectMetaMask();
  return new BlobKit(config, signer);
}; 
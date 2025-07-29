/**
 * Embedded minimal trusted setup for immediate use
 * This contains just enough data to get started without downloads
 * For production use, the full setup will be loaded automatically
 */

import { bls12_381 as bls } from '@noble/curves/bls12-381';
import { Fr } from './field';

// First few G1 points from mainnet (for emergency fallback)
export const EMBEDDED_G1_POINTS_HEX = [
  '0xa0413c0dcafec6dbc9f47d66785cf1e8c981044f7d13cfe3e4fcbb71b5408dfde6312493cb3c1d30516cb3ca88c03654',
  '0x8b997fb25730d661918371bb41f2a6e899cac23f04fc5365800b75433c0a953250e15e7a98fb5ca5cc56a8cd34c20c57'
];

// First 2 G2 points from mainnet (all we need for verification)
export const EMBEDDED_G2_POINTS_HEX = [
  '0xa759c48b7e4a685e735c01e5aa6ef9c248705001f470f9ad856cd87806983e917a8742a3bd5ee27db8d76080269b7c83',
  '0x967f8dc45ebc3be14c8705f43249a30ff48e96205fb02ae28daeab47b72eb3f45df0625928582aa1eb4368381c33e127'
];

/**
 * Generate a minimal mock setup if we can't download the full one
 * This allows the SDK to work immediately while downloading in background
 */
export function createMinimalSetup() {
  // For a minimal setup, we'll generate enough points to work
  // This is NOT secure for production but allows immediate use
  const tau = 5n; // Small tau for testing
  const g1Powers = [];
  const g2Powers = [];
  
  // Generate minimal points (32 instead of 4096)
  let power = Fr.ONE;
  for (let i = 0; i < 32; i++) {
    g1Powers.push(bls.G1.Point.BASE.multiply(power));
    if (i < 2) {
      g2Powers.push(bls.G2.Point.BASE.multiply(power));
    }
    power = Fr.mul(power, tau);
  }
  
  return { g1Powers, g2Powers, isMinimal: true };
}

/**
 * CDN URLs that are CORS-enabled for browser access
 */
export const CDN_TRUSTED_SETUP_URLS = [
  // Primary: jsDelivr (reliable, global CDN with good CORS)
  {
    url: 'https://cdn.jsdelivr.net/gh/ethereum/c-kzg-4844@v1.0.0/src/trusted_setup.txt',
    type: 'combined' as const
  },
  // Fallback: Cloudflare CDN mirror (if we set one up)
  {
    url: 'https://eth-kzg-ceremony.blobkit.io/trusted_setup.txt',
    type: 'combined' as const
  },
  // Last resort: GitHub raw (might have CORS issues)
  {
    url: 'https://raw.githubusercontent.com/ethereum/c-kzg-4844/main/src/trusted_setup.txt',
    type: 'combined' as const
  }
];

/**
 * Try multiple CDN URLs until one works
 */
export async function fetchTrustedSetupWithFallbacks(timeout = 30000): Promise<string> {
  const errors: Error[] = [];
  
  for (const cdn of CDN_TRUSTED_SETUP_URLS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(cdn.url, {
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit'
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        return await response.text();
      }
      
      errors.push(new Error(`HTTP ${response.status} from ${cdn.url}`));
    } catch (e) {
      errors.push(e as Error);
      continue;
    }
  }
  
  throw new Error(`Failed to fetch trusted setup from all CDNs: ${errors.map(e => e.message).join(', ')}`);
}
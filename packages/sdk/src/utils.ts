/**
 * BlobKit SDK Utilities
 * Core utility functions for blob operations, validation, and environment handling
 */

import { ethers } from 'ethers';
import { BlobKitError, BlobKitErrorCode, ProcessEnv } from './types.js';

// Size constraints
const MAX_BLOB_SIZE = 128 * 1024; // 128KB

/**
 * Calculate SHA-256 hash of payload
 * @param data Payload data
 * @returns Hash string
 */
export function calculatePayloadHash(data: Uint8Array): string {
  return ethers.keccak256(data);
}

export function isBlobTXType(type: string|number): boolean {
  // Check if type is a Blob transaction type
  return type === '0x3' || type === 3;
}

/**
 * Generate deterministic job ID
 * @param userAddress User's address
 * @param payloadHash Payload hash
 * @param nonce Unique nonce
 * @returns Job ID
 */
export function generateJobId(userAddress: string, payloadHash: string, nonce: number): string {
  const combined = `${userAddress}-${payloadHash}-${nonce}`;
  return ethers.keccak256(new TextEncoder().encode(combined));
}

/**
 * Validate environment configuration for Node.js environments
 * Checks that all required environment variables are properly set
 */
export function validateEnvironmentConfig(): void {
  const env = process.env as ProcessEnv;

  // Environment validation runs in debug mode

  // Validate chain-specific escrow contract addresses if set
  const chainVars = [
    'BLOBKIT_ESCROW_1',
    'BLOBKIT_ESCROW_11155111',
    'BLOBKIT_ESCROW_17000'
  ] as const;

  for (const varName of chainVars) {
    const value = env[varName];
    if (value && !isValidAddress(value)) {
      throw new BlobKitError(
        BlobKitErrorCode.INVALID_CONFIG,
        `Invalid address in environment variable ${varName}: ${value}`
      );
    }
  }

  // Validate chain ID if set
  if (env.BLOBKIT_CHAIN_ID) {
    const chainId = parseInt(env.BLOBKIT_CHAIN_ID, 10);
    if (isNaN(chainId) || chainId <= 0) {
      throw new BlobKitError(
        BlobKitErrorCode.INVALID_CONFIG,
        `Invalid chain ID in BLOBKIT_CHAIN_ID: ${env.BLOBKIT_CHAIN_ID}`
      );
    }
  }

  // Validate log level if set
  if (env.BLOBKIT_LOG_LEVEL && !['debug', 'info', 'silent'].includes(env.BLOBKIT_LOG_LEVEL)) {
    throw new BlobKitError(
      BlobKitErrorCode.INVALID_CONFIG,
      `Invalid log level in BLOBKIT_LOG_LEVEL: ${env.BLOBKIT_LOG_LEVEL}. Must be 'debug', 'info', or 'silent'`
    );
  }
}

/**
 * Discover proxy URL for the given chain
 * @param chainId Chain ID to discover proxy for
 * @returns Promise resolving to proxy URL
 */
export async function discoverProxyUrl(chainId: number): Promise<string> {
  // Check environment variable first
  const envProxyUrl = typeof process !== 'undefined' ? process.env?.BLOBKIT_PROXY_URL : undefined;
  if (envProxyUrl) {
    try {
      const response = await fetch(`${envProxyUrl}/api/v1/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        const health = await response.json();
        if (health.chainId === chainId) {
          return envProxyUrl;
        }
      }
    } catch {
      // Continue to fallback
    }
  }

  // Fallback proxy URLs by chain
  const defaultProxies: Record<number, string> = {
    1: 'https://proxy-mainnet.blobkit.org',
    11155111: 'https://proxy-sepolia.blobkit.org',
    17000: 'https://proxy-holesky.blobkit.org'
  };

  const proxyUrl = defaultProxies[chainId];
  if (!proxyUrl) {
    throw new BlobKitError(
      BlobKitErrorCode.PROXY_NOT_FOUND,
      `No proxy server configured for chain ${chainId}. Set BLOBKIT_PROXY_URL environment variable.`
    );
  }

  return proxyUrl;
}

/**
 * Gets the default escrow contract address for a given chain ID
 */
export function getDefaultEscrowContract(chainId: number): string {
  // Check environment variables first
  const envAddress =
    typeof process !== 'undefined' ? process.env?.[`BLOBKIT_ESCROW_${chainId}`] : undefined;
  if (envAddress && isValidAddress(envAddress)) {
    return envAddress;
  }

  // Fall back to known deployed addresses
  switch (chainId) {
    case 1: // Mainnet
      // DEPLOYED: Mainnet contract
      return '0xB4CFE544d8aE6015B844dF84D3c5Dcf5bA3e2495';
    case 11155111: // Sepolia
      // DEPLOYED: Sepolia testnet contract
      return '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD77';
    case 17000: // Holesky
      // Not yet deployed to Holesky
      throw new BlobKitError(
        BlobKitErrorCode.CONTRACT_NOT_DEPLOYED,
        `BlobKit escrow contract not yet deployed on Holesky (chain ${chainId}). Please set BLOBKIT_ESCROW_17000 environment variable.`
      );
    default:
      throw new BlobKitError(
        BlobKitErrorCode.CONTRACT_NOT_DEPLOYED,
        `No escrow contract configuration for chain ${chainId}. Please set BLOBKIT_ESCROW_${chainId} environment variable.`
      );
  }
}

/**
 * Format Wei amount to ETH string
 * @param wei Amount in Wei
 * @returns ETH amount as string
 */
export function formatEther(wei: bigint): string {
  const ether = Number(wei) / 1e18;
  return ether.toFixed(18).replace(/\.?0+$/, '');
}

/**
 * Parse ETH string to Wei amount
 * @param ether ETH amount as string
 * @returns Amount in Wei
 */
export function parseEther(ether: string): bigint {
  const weiFloat = parseFloat(ether) * 1e18;
  return BigInt(Math.floor(weiFloat));
}

/**
 * Validate Ethereum address format
 * @param address Address to validate
 * @returns True if valid
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate blob size constraints
 * @param data Data to validate
 * @throws BlobKitError if data is too large
 */
export function validateBlobSize(data: Uint8Array): void {
  if (data.length > MAX_BLOB_SIZE) {
    throw new BlobKitError(
      BlobKitErrorCode.BLOB_TOO_LARGE,
      `Blob too large: ${data.length} bytes, maximum: ${MAX_BLOB_SIZE} bytes`
    );
  }
}

/**
 * Sleep for specified duration
 * @param ms Duration in milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/****************  Borrowed wholesale from @ethereumjs/util to avoid external dependencies  *******/
const hexByByte = Array.from({ length: 256 }, (v, i) => i.toString(16).padStart(2, '0'));

export const bytesToHex = (bytes: Uint8Array): string => {
  let hex = '0x';
  if (bytes === undefined || bytes.length === 0) return hex;
  for (const byte of bytes) {
    hex += hexByByte[byte];
  }
  return hex;
};

/**
 * Pads a `String` to have an even length
 * @param value
 * @return output
 */
export function padToEven(value: string): string {
  let a = value;

  if (typeof a !== 'string') {
    throw new Error(`[padToEven] value must be type 'string', received ${typeof a}`);
  }

  if (a.length % 2) a = `0${a}`;

  return a;
}

// hexToBytes cache
const hexToBytesMapFirstKey: { [key: string]: number } = {};
const hexToBytesMapSecondKey: { [key: string]: number } = {};

for (let i = 0; i < 16; i++) {
  const vSecondKey = i;
  const vFirstKey = i * 16;
  const key = i.toString(16).toLowerCase();
  hexToBytesMapSecondKey[key] = vSecondKey;
  hexToBytesMapSecondKey[key.toUpperCase()] = vSecondKey;
  hexToBytesMapFirstKey[key] = vFirstKey;
  hexToBytesMapFirstKey[key.toUpperCase()] = vFirstKey;
}

function _unprefixedHexToBytes(hex: string): Uint8Array {
  const byteLen = hex.length;
  const bytes = new Uint8Array(byteLen / 2);
  for (let i = 0; i < byteLen; i += 2) {
    bytes[i / 2] = hexToBytesMapFirstKey[hex[i]] + hexToBytesMapSecondKey[hex[i + 1]];
  }
  return bytes;
}
export const hexToBytes = (hex: string): Uint8Array => {
  if (typeof hex !== 'string') {
    throw new Error(`hex argument type ${typeof hex} must be of type string`);
  }

  if (!/^0x[0-9a-fA-F]*$/.test(hex)) {
    throw new Error(`Input must be a 0x-prefixed hexadecimal string, got ${hex}`);
  }

  hex = hex.slice(2);

  if (hex.length % 2 !== 0) {
    hex = padToEven(hex);
  }
  return _unprefixedHexToBytes(hex);
};

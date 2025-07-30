/**
 * BlobKit SDK Utilities
 * Core utility functions for blob operations, validation, and environment handling
 */
import { keccak256 } from 'ethers';
import { BlobKitError, BlobKitErrorCode } from './types.js';
// Size constraints
const MAX_BLOB_SIZE = 128 * 1024; // 128KB
/**
 * Calculate SHA-256 hash of payload
 * @param data Payload data
 * @returns Hash string
 */
export function calculatePayloadHash(data) {
    return keccak256(data);
}
/**
 * Generate deterministic job ID
 * @param userAddress User's address
 * @param payloadHash Payload hash
 * @param nonce Unique nonce
 * @returns Job ID
 */
export function generateJobId(userAddress, payloadHash, nonce) {
    const combined = `${userAddress}-${payloadHash}-${nonce}`;
    return keccak256(new TextEncoder().encode(combined));
}
/**
 * Validate environment configuration for Node.js environments
 * Checks that all required environment variables are properly set
 */
export function validateEnvironmentConfig() {
    const env = process.env;
    // Log environment validation for debugging
    if (env.BLOBKIT_LOG_LEVEL === 'debug') {
        console.log('[BlobKit:DEBUG] Validating environment configuration');
    }
    // Validate chain-specific escrow contract addresses if set
    const chainVars = [
        'BLOBKIT_ESCROW_1',
        'BLOBKIT_ESCROW_11155111',
        'BLOBKIT_ESCROW_17000'
    ];
    for (const varName of chainVars) {
        const value = env[varName];
        if (value && !isValidAddress(value)) {
            throw new BlobKitError(BlobKitErrorCode.INVALID_CONFIG, `Invalid address in environment variable ${varName}: ${value}`);
        }
    }
    // Validate chain ID if set
    if (env.BLOBKIT_CHAIN_ID) {
        const chainId = parseInt(env.BLOBKIT_CHAIN_ID, 10);
        if (isNaN(chainId) || chainId <= 0) {
            throw new BlobKitError(BlobKitErrorCode.INVALID_CONFIG, `Invalid chain ID in BLOBKIT_CHAIN_ID: ${env.BLOBKIT_CHAIN_ID}`);
        }
    }
    // Validate log level if set
    if (env.BLOBKIT_LOG_LEVEL && !['debug', 'info', 'silent'].includes(env.BLOBKIT_LOG_LEVEL)) {
        throw new BlobKitError(BlobKitErrorCode.INVALID_CONFIG, `Invalid log level in BLOBKIT_LOG_LEVEL: ${env.BLOBKIT_LOG_LEVEL}. Must be 'debug', 'info', or 'silent'`);
    }
}
/**
 * Discover proxy URL for the given chain
 * @param chainId Chain ID to discover proxy for
 * @returns Promise resolving to proxy URL
 */
export async function discoverProxyUrl(chainId) {
    // Check environment variable first
    const envProxyUrl = process.env.BLOBKIT_PROXY_URL;
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
        }
        catch {
            // Fall through to discovery
        }
    }
    // Fallback proxy URLs by chain (these would be updated with actual proxy deployments)
    const defaultProxies = {
        1: 'https://proxy-mainnet.blobkit.dev',
        11155111: 'https://proxy-sepolia.blobkit.dev',
        17000: 'https://proxy-holesky.blobkit.dev'
    };
    const proxyUrl = defaultProxies[chainId];
    if (!proxyUrl) {
        throw new BlobKitError(BlobKitErrorCode.PROXY_NOT_FOUND, `No proxy server configured for chain ${chainId}. Set BLOBKIT_PROXY_URL environment variable.`);
    }
    return proxyUrl;
}
/**
 * Gets the default escrow contract address for a given chain ID
 */
export function getDefaultEscrowContract(chainId) {
    // Check environment variables first
    const envAddress = process.env[`BLOBKIT_ESCROW_${chainId}`];
    if (envAddress && isValidAddress(envAddress)) {
        return envAddress;
    }
    // Fall back to known deployed addresses (these would be updated when contracts are deployed)
    switch (chainId) {
        case 1: // Mainnet
            // These addresses should be updated when contracts are actually deployed
            throw new BlobKitError(BlobKitErrorCode.CONTRACT_NOT_DEPLOYED, `BlobKit escrow contract not yet deployed on Mainnet (chain ${chainId}). Please set BLOBKIT_ESCROW_1 environment variable.`);
        case 11155111: // Sepolia
            throw new BlobKitError(BlobKitErrorCode.CONTRACT_NOT_DEPLOYED, `BlobKit escrow contract not yet deployed on Sepolia (chain ${chainId}). Please set BLOBKIT_ESCROW_11155111 environment variable.`);
        case 17000: // Holesky
            throw new BlobKitError(BlobKitErrorCode.CONTRACT_NOT_DEPLOYED, `BlobKit escrow contract not yet deployed on Holesky (chain ${chainId}). Please set BLOBKIT_ESCROW_17000 environment variable.`);
        default:
            throw new BlobKitError(BlobKitErrorCode.CONTRACT_NOT_DEPLOYED, `No escrow contract configuration for chain ${chainId}. Please set BLOBKIT_ESCROW_${chainId} environment variable.`);
    }
}
/**
 * Format Wei amount to ETH string
 * @param wei Amount in Wei
 * @returns ETH amount as string
 */
export function formatEther(wei) {
    const ether = Number(wei) / 1e18;
    return ether.toFixed(18).replace(/\.?0+$/, '');
}
/**
 * Parse ETH string to Wei amount
 * @param ether ETH amount as string
 * @returns Amount in Wei
 */
export function parseEther(ether) {
    const weiFloat = parseFloat(ether) * 1e18;
    return BigInt(Math.floor(weiFloat));
}
/**
 * Validate Ethereum address format
 * @param address Address to validate
 * @returns True if valid
 */
export function isValidAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}
/**
 * Validate blob size constraints
 * @param data Data to validate
 * @throws BlobKitError if data is too large
 */
export function validateBlobSize(data) {
    if (data.length > MAX_BLOB_SIZE) {
        throw new BlobKitError(BlobKitErrorCode.BLOB_TOO_LARGE, `Blob too large: ${data.length} bytes, maximum: ${MAX_BLOB_SIZE} bytes`);
    }
}
/**
 * Sleep for specified duration
 * @param ms Duration in milliseconds
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
//# sourceMappingURL=utils.js.map
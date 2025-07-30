/**
 * BlobKit SDK Utilities
 * Core utility functions for blob operations, validation, and environment handling
 */
/**
 * Calculate SHA-256 hash of payload
 * @param data Payload data
 * @returns Hash string
 */
export declare function calculatePayloadHash(data: Uint8Array): string;
/**
 * Generate deterministic job ID
 * @param userAddress User's address
 * @param payloadHash Payload hash
 * @param nonce Unique nonce
 * @returns Job ID
 */
export declare function generateJobId(userAddress: string, payloadHash: string, nonce: number): string;
/**
 * Validate environment configuration for Node.js environments
 * Checks that all required environment variables are properly set
 */
export declare function validateEnvironmentConfig(): void;
/**
 * Discover proxy URL for the given chain
 * @param chainId Chain ID to discover proxy for
 * @returns Promise resolving to proxy URL
 */
export declare function discoverProxyUrl(chainId: number): Promise<string>;
/**
 * Gets the default escrow contract address for a given chain ID
 */
export declare function getDefaultEscrowContract(chainId: number): string;
/**
 * Format Wei amount to ETH string
 * @param wei Amount in Wei
 * @returns ETH amount as string
 */
export declare function formatEther(wei: bigint): string;
/**
 * Parse ETH string to Wei amount
 * @param ether ETH amount as string
 * @returns Amount in Wei
 */
export declare function parseEther(ether: string): bigint;
/**
 * Validate Ethereum address format
 * @param address Address to validate
 * @returns True if valid
 */
export declare function isValidAddress(address: string): boolean;
/**
 * Validate blob size constraints
 * @param data Data to validate
 * @throws BlobKitError if data is too large
 */
export declare function validateBlobSize(data: Uint8Array): void;
/**
 * Sleep for specified duration
 * @param ms Duration in milliseconds
 */
export declare function sleep(ms: number): Promise<void>;
//# sourceMappingURL=utils.d.ts.map
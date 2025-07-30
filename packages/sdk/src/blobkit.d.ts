import { BlobKitConfig, BlobMeta, BlobPaymentResult, CostEstimate, Signer } from './types.js';
/**
 * BlobKit SDK - Main class for blob storage operations
 */
export declare class BlobKit {
    private readonly config;
    private readonly environment;
    private readonly signer;
    private proxyUrl?;
    private escrowContract?;
    private kzgInitialized;
    /**
     * Creates a new BlobKit instance
     * @param config Configuration options
     * @param signer Optional signer for transactions (required for browser environments)
     */
    constructor(config: BlobKitConfig, signer?: Signer);
    /**
     * Initialize KZG if not already done
     */
    private ensureKzgInitialized;
    /**
     * Writes blob data to Ethereum
     * @param payload Data to store in the blob
     * @param meta Optional metadata for the blob
     * @returns Promise resolving to blob storage result
     */
    writeBlob(payload: unknown, meta?: Partial<BlobMeta>): Promise<BlobPaymentResult>;
    /**
     * Estimates the cost of storing blob data
     * @param payload Data to estimate cost for
     * @returns Promise resolving to cost breakdown
     */
    estimateCost(payload: unknown): Promise<CostEstimate>;
    /**
     * Refunds an expired job from the escrow contract
     * @param jobId Job ID to refund
     * @returns Promise resolving to transaction hash
     */
    refundIfExpired(jobId: string): Promise<string>;
    /**
     * Generates a deterministic job ID
     * @param userAddress User's Ethereum address
     * @param payloadHash SHA-256 hash of payload
     * @param nonce Unique nonce for this job
     * @returns Job ID string
     */
    generateJobId(userAddress: string, payloadHash: string, nonce: number): string;
    /**
     * Writes blob using Web3 payment flow (browser environment)
     */
    private writeWithWeb3Payment;
    /**
     * Writes blob using direct transaction (Node.js/serverless environment)
     */
    private writeWithDirectTransaction;
    /**
     * Submits encoded blob data to proxy service
     */
    private submitToProxy;
    /**
     * Gets the proxy URL for blob submission
     */
    private getProxyUrl;
    /**
     * Gets the escrow contract instance
     */
    private getEscrowContract;
    /**
     * Gets job status from escrow contract
     */
    private getJobStatus;
    /**
     * Gets proxy fee percentage
     */
    private getProxyFeePercent;
    /**
     * Validates the configuration
     */
    private validateConfig;
    /**
     * Logs messages based on configured log level
     */
    private log;
    /**
     * Send blob transaction to Ethereum
     */
    private sendBlobTransaction;
}
//# sourceMappingURL=blobkit.d.ts.map
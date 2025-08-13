/**
 * BlobKit SDK Main Class
 *
 * Simplified orchestration layer that delegates to specialized modules
 */

import { ethers } from 'ethers';
import {
  BlobKitConfig,
  BlobKitEnvironment,
  BlobMeta,
  BlobReceipt,
  BlobReadResult,
  CostEstimate,
  Signer,
  BlobKitError,
  BlobKitErrorCode,
  TransactionResponse,
  JobStatus
} from './types.js';
import { detectEnvironment, getEnvironmentCapabilities } from './environment.js';
import { defaultCodecRegistry } from './codecs/index.js';
import { PaymentManager } from './payment.js';
import { ProxyClient, BlobSubmitResult } from './proxy-client.js';
import { BlobSubmitter, DirectSubmitResult } from './blob-submitter.js';
import { BlobReader } from './blob-reader.js';
import { MetricsCollector } from './metrics.js';
import { Logger } from './logger.js';
import {
  generateJobId,
  calculatePayloadHash,
  getDefaultEscrowContract,
  validateBlobSize,
  formatEther,
  isValidAddress,
  validateEnvironmentConfig,
  sleep,
  hexToBytes
} from './utils.js';
import { initializeKzg, requireKzg } from './kzg.js';
import { sign } from 'crypto';

/**
 * BlobKit SDK - Main class for blob storage operations
 */
export class BlobKit {
  private readonly config: Required<
    Omit<BlobKitConfig, 'kzgSetup' | 'metricsHooks' | 'requestSigningSecret'>
  > & {
    kzgSetup?: import('./types.js').KzgSetupOptions;
    metricsHooks?: import('./types.js').MetricsHooks;
    requestSigningSecret?: string;
  };
  private readonly environment: BlobKitEnvironment;
  private readonly signer: Signer | undefined;
  private readonly metrics: MetricsCollector;

  // Component managers
  private paymentManager: PaymentManager;
  private proxyClient?: ProxyClient;
  private blobSubmitter?: BlobSubmitter;
  private blobReader: BlobReader;
  private logger: Logger;

  private kzgInitialized = false;
  private jobNonce = 0;

  /**
   * Creates a new BlobKit instance
   */
  constructor(config: BlobKitConfig, signer?: Signer) {
    this.environment = detectEnvironment();
    this.validateConfig(config);

    // Set defaults
    this.config = {
      rpcUrl: config.rpcUrl,
      chainId: config.chainId ?? 1,
      archiveUrl: config.archiveUrl ?? config.rpcUrl,
      defaultCodec: config.defaultCodec ?? 'application/json',
      compressionLevel: config.compressionLevel ?? 6,
      proxyUrl: config.proxyUrl ?? '',
      escrowContract: config.escrowContract ?? getDefaultEscrowContract(config.chainId ?? 1),
      maxProxyFeePercent: config.maxProxyFeePercent ?? 5,
      callbackUrl: config.callbackUrl ?? '',
      logLevel: config.logLevel ?? 'info',
      kzgSetup: config.kzgSetup,
      metricsHooks: config.metricsHooks,
    };

    this.signer = signer;
    this.metrics = new MetricsCollector(config.metricsHooks);

    // Initialize components
    this.paymentManager = new PaymentManager(
      this.config.rpcUrl,
      this.config.escrowContract,
      signer
    );

    this.blobReader = new BlobReader({
      rpcUrl: this.config.rpcUrl,
      archiveUrl: this.config.archiveUrl,
      logLevel: this.config.logLevel
    });

    this.logger = new Logger({ context: 'BlobKit', level: this.config.logLevel as any });
    this.logger.debug(`BlobKit initialized in ${this.environment} environment`);
  }

  /**
   * Async factory method to create and initialize a BlobKit instance
   */
  static async init(config: BlobKitConfig, signer?: Signer): Promise<BlobKit> {
    const instance = new BlobKit(config, signer);
    await instance.initialize();
    return instance;
  }

  /**
   * Initialize async components
   */
  async initialize(): Promise<void> {
    // Initialize KZG if not already done
    if (!this.kzgInitialized) {
      await initializeKzg(this.config.kzgSetup);
      this.kzgInitialized = true;
    }

    // Set up proxy client if needed
    if (this.shouldUseProxy()) {
      const proxyUrl = await this.resolveProxyUrl();
      this.proxyClient = new ProxyClient({
        proxyUrl,
        requestSigningSecret: this.config.requestSigningSecret,
        logLevel: this.config.logLevel
      });
    } else if (this.environment === 'node') {
      // Set up direct submitter for Node.js
      this.blobSubmitter = new BlobSubmitter({
        rpcUrl: this.config.rpcUrl,
        chainId: this.config.chainId,
        escrowAddress: this.config.escrowContract
      });
    }
  }

  /**
   * Write blob data to Ethereum
   *
   * This method handles the full web3 payment flow:
   * 1. Estimates cost
   * 2. Deposits payment to escrow contract
   * 3. Submits blob via proxy (browser) or directly (Node.js)
   *
   * @param data Data to store as blob
   * @param meta Optional metadata
   * @returns Blob receipt with transaction details
   */
  async writeBlob(
    data: Uint8Array | string | object,
    meta?: Partial<BlobMeta>,
    jobId?: string,
    maxRetries: number = 3
  ): Promise<BlobReceipt> {
    const startTime = Date.now();
    this.metrics.trackOperation('writeBlob', 'start');

    let lastError: unknown;

    // Convert data to Uint8Array once
    const payload = await this.preparePayload(data, meta);

    // Validate blob size
    validateBlobSize(payload);

    // Calculate payload hash once
    const payloadHash = calculatePayloadHash(payload);
    const userAddress = await this.getAddress();

    // Prepare metadata once
    const fullMeta: BlobMeta = {
      appId: 'blobkit-sdk',
      codec: meta?.codec || this.detectCodec(data),
      timestamp: Date.now(),
      ...meta
    };

    if (!jobId) {
      jobId = generateJobId(userAddress, payloadHash, this.jobNonce++);
    }

    console.log(`Writing blob with job ID: ${jobId}`);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Generate new job ID for each attempt
        // const jobId = generateJobId(userAddress, payloadHash, this.jobNonce++);

        this.logger.info(
          `Attempting blob write (attempt ${attempt + 1}/${maxRetries}) with job ID: ${jobId}`
        );

        // Estimate and pay
        let paymentHash: undefined | string = undefined;
        // Submit blob
        let result: DirectSubmitResult | BlobSubmitResult;
        if (this.shouldUseProxy()) {
          const estimate = await this.estimateCost(payload);
          const payment = await this.paymentManager.depositForBlob(jobId, estimate.totalETH);
          paymentHash = payment.paymentTxHash;
          result = await this.submitViaProxy(jobId, payment.paymentTxHash, payload, fullMeta);
        } else {
          result = await this.submitDirectly(jobId, payload);
        }

        this.metrics.trackOperation('writeBlob', 'complete', Date.now() - startTime);

        return {
          success: true,
          jobId,
          blobTxHash: result.blobTxHash,
          paymentTxHash: paymentHash,
          blockNumber: result.blockNumber,
          blobHash: result.blobHash,
          commitment: result.commitment,
          proof: result.proof,
          blobIndex: result.blobIndex,
          meta: fullMeta
        };
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `Blob write attempt ${attempt + 1} failed: ${error instanceof Error ? error.message : String(error)}`);

        // Don't retry on certain errors
        if (error instanceof BlobKitError) {
          const nonRetryableErrors = [
            BlobKitErrorCode.INVALID_CONFIG,
            BlobKitErrorCode.INVALID_PAYLOAD,
            BlobKitErrorCode.BLOB_TOO_LARGE,
            BlobKitErrorCode.INSUFFICIENT_FUNDS
          ];

          if (nonRetryableErrors.includes(error.code)) {
            this.metrics.trackOperation('writeBlob', 'error');
            throw error;
          }
        }

        // Add exponential backoff for retries
        if (attempt < maxRetries - 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          this.logger.info(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    this.metrics.trackOperation('writeBlob', 'error');
    throw new BlobKitError(
      BlobKitErrorCode.BLOB_SUBMISSION_FAILED,
      `Failed to write blob after ${maxRetries} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`
    );
  }

  /**
   * Generate a deterministic job ID from user address, payload hash, and nonce
   * @param userAddress The user's Ethereum address
   * @param payloadHash The hash of the payload
   * @param nonce A unique nonce to prevent collisions
   * @returns A deterministic job ID
   */
  generateJobId(userAddress: string, payloadHash: string, nonce: number): string {
    return generateJobId(userAddress, payloadHash, nonce);
  }

  /**
   * Check job status
   */
  async getJobStatus(jobId: string): Promise<JobStatus> {
    return this.paymentManager.getJobStatus(jobId);
  }

  /**
   * Request refund for expired job
   */
  async refundIfExpired(jobId: string): Promise<TransactionResponse> {
    return this.paymentManager.refundIfExpired(jobId);
  }

  /**
   * Estimate cost of blob storage
   */
  async estimateCost(payload: Uint8Array): Promise<CostEstimate> {
    validateBlobSize(payload);

    if (this.shouldUseProxy()) {
      // Get proxy fee
      const proxyFee = await this.getProxyFeePercent();
      const baseCost = await this.estimateBaseCost(payload.length);
      const proxyAmount = (baseCost * BigInt(proxyFee)) / BigInt(100);

      return {
        blobFee: formatEther(baseCost),
        gasFee: '0',
        proxyFee: formatEther(proxyAmount),
        totalETH: formatEther(baseCost + proxyAmount)
      };
    } else {
      // Direct submission costs
      const costs = await this.blobSubmitter!.estimateCost(payload.length);
      return {
        blobFee: formatEther(costs.blobFee),
        gasFee: formatEther(costs.executionFee),
        proxyFee: '0',
        totalETH: formatEther(costs.total)
      };
    }
  }

  /**
   * Get current address
   */
  async getAddress(): Promise<string> {
    if (!this.signer) {
      throw new BlobKitError(BlobKitErrorCode.INVALID_CONFIG, 'Signer required for this operation');
    }
    return this.signer.getAddress();
  }

  /**
   * Get current balance
   */
  async getBalance(): Promise<bigint> {
    const address = await this.getAddress();
    const provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
    return provider.getBalance(address);
  }

  /**
   * Read blob data by transaction hash
   * @param blobTxHash Transaction hash containing the blob
   * @param blobIndex Index of blob within transaction (default: 0)
   * @returns Raw blob data and metadata
   */
  async readBlob(blobTxHash: string, blobIndex: number = 0): Promise<BlobReadResult> {
    const startTime = Date.now();

    try {
      this.logger.info(`Reading blob from tx ${blobTxHash} at index ${blobIndex}`);

      // Execute read operation with metrics
      const result = await this.blobReader.readBlob(blobTxHash, blobIndex);

      const duration = Date.now() - startTime;
      this.logger.info(`Blob read completed in ${duration}ms from ${result.source}`);

      // Report metrics
      if (this.metrics) {
        this.metrics.recordBlobRead(result.data.length, duration, true, result.source);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Blob read failed after ${duration}ms`, error);

      // Report error metrics
      if (this.metrics) {
        this.metrics.recordBlobRead(0, duration, false, 'error');
        this.metrics.recordError(
          error instanceof Error ? error : new Error(String(error)),
          'readBlob'
        );
      }

      throw error;
    }
  }

  /**
   * Read blob and decode to UTF-8 string
   * @param blobTxHash Transaction hash containing the blob
   * @param blobIndex Index of blob within transaction (default: 0)
   * @returns Decoded string data
   */
  async readBlobAsString(blobTxHash: string, blobIndex: number = 0): Promise<string> {
    const result = await this.readBlob(blobTxHash, blobIndex);
    return BlobReader.decodeToString(result.data);
  }

  /**
   * Read blob and decode to JSON object
   * @param blobTxHash Transaction hash containing the blob
   * @param blobIndex Index of blob within transaction (default: 0)
   * @returns Decoded JSON data
   */
  async readBlobAsJSON(blobTxHash: string, blobIndex: number = 0): Promise<unknown> {
    const result = await this.readBlob(blobTxHash, blobIndex);
    return BlobReader.decodeToJSON(result.data);
  }

  // Private helper methods

  private shouldUseProxy(): boolean {
    const capabilities = getEnvironmentCapabilities(this.environment);
    return !capabilities.canSubmitBlobs || !!this.config.proxyUrl;
  }

  private async resolveProxyUrl(): Promise<string> {
    if (this.config.proxyUrl) {
      return this.config.proxyUrl;
    }
    return ProxyClient.discover(this.config.chainId);
  }

  private async submitViaProxy(
    jobId: string,
    paymentTxHash: string,
    payload: Uint8Array,
    meta: BlobMeta
  ): Promise<BlobSubmitResult> {
    if (!this.proxyClient) {
      throw new BlobKitError(BlobKitErrorCode.INVALID_CONFIG, 'Proxy client not initialized');
    }
    // Wait for job to appear on-chain
    await this.waitForJobOnChain(jobId);

    const signature = await this.signer?.signMessage(payload);
    if(!signature) {
      throw new BlobKitError(BlobKitErrorCode.INVALID_CONFIG,'Failed to sign payload')
    }

    // Submit to proxy
    const result = await this.proxyClient.submitBlob({
      jobId,
      paymentTxHash,
      payload,
      signature: hexToBytes(signature),
      meta
    });

    // Wait for job completion
    await this.waitForJobCompletion(jobId);

    return result;
  }

  private async submitDirectly(
    jobId: string,
    payload: Uint8Array
  ): Promise<DirectSubmitResult & { completionTxHash: string }> {
    if (!this.blobSubmitter || !this.signer) {
      throw new BlobKitError(BlobKitErrorCode.INVALID_CONFIG, 'Direct submission not available');
    }

    const result = await this.blobSubmitter.submitBlob(this.signer, jobId, payload, requireKzg());

    return {
      ...result,
      completionTxHash: result.blobTxHash // Same transaction completes the job
    };
  }

  private async waitForJobOnChain(jobId: string): Promise<void> {
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      const job = await this.getJobStatus(jobId);
      if (job.exists) {
        return;
      }
      await sleep(1000);
    }
    throw new BlobKitError(BlobKitErrorCode.JOB_NOT_FOUND, 'Job not found on chain after payment');
  }

  private async waitForJobCompletion(jobId: string, timeout: number = 5 * 60 * 1000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const job = await this.getJobStatus(jobId);
      if (job.completed) {
        return;
      }
      await sleep(2000);
    }

    throw new BlobKitError(BlobKitErrorCode.JOB_TIMEOUT, 'Job completion timeout');
  }

  private async preparePayload(
    data: Uint8Array | string | object,
    meta?: Partial<BlobMeta>
  ): Promise<Uint8Array> {
    const codec = meta?.codec || this.detectCodec(data);
    const encoder = defaultCodecRegistry.get(codec);
    return encoder.encode(data);
  }

  private detectCodec(data: unknown): string {
    if (data instanceof Uint8Array) {
      return 'application/octet-stream';
    } else if (typeof data === 'string') {
      return 'text/plain';
    } else {
      return 'application/json';
    }
  }

  private async getProxyFeePercent(): Promise<number> {
    if (this.proxyClient) {
      const health = await this.proxyClient.getHealth();
      return health.proxyFeePercent || 0;
    }
    return 0;
  }

  private async estimateBaseCost(payloadSize: number): Promise<bigint> {
    // Simple estimation: 1 blob = 131072 gas at 1 gwei
    const blobGas = BigInt(131072);
    const gasPrice = BigInt(1000000000); // 1 gwei
    return blobGas * gasPrice;
  }

  private validateConfig(config: BlobKitConfig): void {
    if (!config.rpcUrl) {
      throw new BlobKitError(BlobKitErrorCode.INVALID_CONFIG, 'rpcUrl is required');
    }

    try {
      new URL(config.rpcUrl);
    } catch {
      throw new BlobKitError(BlobKitErrorCode.INVALID_CONFIG, 'Invalid RPC URL format');
    }

    if (config.chainId !== undefined) {
      if (!Number.isInteger(config.chainId) || config.chainId <= 0 || config.chainId > 2147483647) {
        throw new BlobKitError(
          BlobKitErrorCode.INVALID_CONFIG,
          'Chain ID must be a positive integer less than 2^31'
        );
      }
    }

    if (config.escrowContract && !isValidAddress(config.escrowContract)) {
      throw new BlobKitError(BlobKitErrorCode.INVALID_CONFIG, 'Invalid escrow contract address');
    }

    if (this.environment === 'node') {
      validateEnvironmentConfig();
    }
  }

  private log(level: 'debug' | 'info', message: string, data?: unknown): void {
    this.logger[level](message, data as Record<string, unknown>);
  }
}

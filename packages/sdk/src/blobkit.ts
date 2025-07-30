import { ethers } from 'ethers';
import {
  BlobKitConfig,
  BlobKitEnvironment,
  BlobMeta,
  BlobPaymentResult,
  CostEstimate,
  Signer,
  BlobKitError,
  BlobKitErrorCode,
  JobStatus,
  TransactionRequest
} from './types.js';
import { detectEnvironment, getEnvironmentCapabilities } from './environment.js';
import { defaultCodecRegistry } from './codecs/index.js';
import {
  generateJobId,
  calculatePayloadHash,
  discoverProxyUrl,
  getDefaultEscrowContract,
  validateBlobSize,
  formatEther,
  parseEther,
  isValidAddress,
  validateEnvironmentConfig
} from './utils.js';
import {
  initializeKzg,
  encodeBlob,
  blobToKzgCommitment,
  computeKzgProof,
  commitmentToVersionedHash,
  bytesToHex
} from './kzg.js';

/**
 * BlobKit SDK - Main class for blob storage operations
 */
export class BlobKit {
  private readonly config: Required<BlobKitConfig>;
  private readonly environment: BlobKitEnvironment;
  private readonly signer: Signer | undefined;
  private proxyUrl?: string;
  private escrowContract?: ethers.Contract;
  private kzgInitialized = false;

  /**
   * Creates a new BlobKit instance
   * @param config Configuration options
   * @param signer Optional signer for transactions (required for browser environments)
   */
  constructor(config: BlobKitConfig, signer?: Signer) {
    this.environment = detectEnvironment();
    
    // Validate configuration
    this.validateConfig(config);
    
    // Set default values with proper typing
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
      logLevel: config.logLevel ?? 'info'
    };
    
    this.signer = signer;
    
    this.log('debug', `BlobKit initialized in ${this.environment} environment`);
  }

  /**
   * Initialize KZG if not already done
   */
  private async ensureKzgInitialized(): Promise<void> {
    if (!this.kzgInitialized) {
      await initializeKzg();
      this.kzgInitialized = true;
    }
  }

  /**
   * Writes blob data to Ethereum
   * @param payload Data to store in the blob
   * @param meta Optional metadata for the blob
   * @returns Promise resolving to blob storage result
   */
  async writeBlob(payload: unknown, meta?: Partial<BlobMeta>): Promise<BlobPaymentResult> {
    await this.ensureKzgInitialized();
    
    if (payload === null || payload === undefined) {
      throw new BlobKitError(BlobKitErrorCode.INVALID_PAYLOAD, 'Payload cannot be null or undefined');
    }

    // Determine payment method based on environment and configuration
    const capabilities = getEnvironmentCapabilities(this.environment);
    const useProxy = capabilities.requiresProxy || Boolean(this.config.proxyUrl);

    if (useProxy) {
      return await this.writeWithWeb3Payment(payload, meta);
    } else {
      return await this.writeWithDirectTransaction(payload, meta);
    }
  }

  /**
   * Estimates the cost of storing blob data
   * @param payload Data to estimate cost for
   * @returns Promise resolving to cost breakdown
   */
  async estimateCost(payload: unknown): Promise<CostEstimate> {
    if (payload === null || payload === undefined) {
      throw new BlobKitError(BlobKitErrorCode.INVALID_PAYLOAD, 'Payload cannot be null or undefined');
    }

    try {
      // Encode to get actual size
      const codec = defaultCodecRegistry.get(this.config.defaultCodec);
      const encodedData = codec.encode(payload);
      validateBlobSize(encodedData);

      // Get current network fees
      const provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
      const ethersFeeData = await provider.getFeeData();
      
      // Estimate blob fee (simplified calculation - fallback if no blob gas pricing)
      const blobGasPrice = (ethersFeeData as any).maxFeePerBlobGas ?? ethers.parseUnits('1', 'gwei');
      const blobGasUsed = 131072n; // Standard blob gas
      const blobFee = blobGasPrice * blobGasUsed;

      // Estimate transaction gas
      const gasPrice = ethersFeeData.maxFeePerGas ?? ethers.parseUnits('20', 'gwei');
      const gasUsed = 21000n; // Base transaction gas
      const gasFee = gasPrice * gasUsed;

      // Calculate proxy fee if using proxy
      const proxyFeePercent = await this.getProxyFeePercent();
      const totalBaseFee = blobFee + gasFee;
      const proxyFee = (totalBaseFee * BigInt(proxyFeePercent)) / 100n;

      const totalCost = totalBaseFee + proxyFee;

      return {
        blobFee: formatEther(blobFee),
        gasFee: formatEther(gasFee),
        proxyFee: formatEther(proxyFee),
        totalETH: formatEther(totalCost)
      };
    } catch (error) {
      throw new BlobKitError(
        BlobKitErrorCode.NETWORK_ERROR,
        'Failed to estimate cost',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Refunds an expired job from the escrow contract
   * @param jobId Job ID to refund
   * @returns Promise resolving to transaction hash
   */
  async refundIfExpired(jobId: string): Promise<string> {
    try {
      const contract = await this.getEscrowContract();
      const isExpired = await contract['isJobExpired'](jobId) as boolean;
      
      if (!isExpired) {
        throw new BlobKitError(BlobKitErrorCode.JOB_EXPIRED, 'Job has not expired yet');
      }

      const tx = await contract['refundExpiredJob'](jobId);
      const receipt = await tx.wait();
      
      this.log('info', `Job ${jobId} refunded: ${receipt.hash}`);
      return receipt.hash;
    } catch (error) {
      throw new BlobKitError(
        BlobKitErrorCode.NETWORK_ERROR,
        'Failed to refund expired job',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Generates a deterministic job ID
   * @param userAddress User's Ethereum address
   * @param payloadHash SHA-256 hash of payload
   * @param nonce Unique nonce for this job
   * @returns Job ID string
   */
  generateJobId(userAddress: string, payloadHash: string, nonce: number): string {
    if (!isValidAddress(userAddress)) {
      throw new BlobKitError(BlobKitErrorCode.INVALID_PAYLOAD, 'Invalid user address');
    }
    return generateJobId(userAddress, payloadHash, nonce);
  }

  /**
   * Writes blob using Web3 payment flow (browser environment)
   */
  private async writeWithWeb3Payment(payload: unknown, meta?: Partial<BlobMeta>): Promise<BlobPaymentResult> {
    if (!this.signer) {
      throw new BlobKitError(BlobKitErrorCode.INVALID_CONFIG, 'Signer required for Web3 payment');
    }

    // Encode payload
    const codec = defaultCodecRegistry.get(this.config.defaultCodec);
    const encodedData = codec.encode(payload);
    validateBlobSize(encodedData);

    // Prepare metadata
    const fullMeta: BlobMeta = {
      appId: meta?.appId ?? 'blobkit',
      codec: meta?.codec ?? this.config.defaultCodec,
      timestamp: meta?.timestamp ?? Date.now(),
      contentHash: calculatePayloadHash(encodedData),
      ...(meta?.ttlBlocks !== undefined && { ttlBlocks: meta.ttlBlocks }),
      ...(meta?.filename !== undefined && { filename: meta.filename }),
      ...(meta?.contentType !== undefined && { contentType: meta.contentType }),
      ...(meta?.tags !== undefined && { tags: meta.tags })
    };

    // Generate job metadata
    const userAddress = await this.signer.getAddress();
    const payloadHash = calculatePayloadHash(encodedData);
    const nonce = Date.now(); // Simple nonce strategy
    const jobId = this.generateJobId(userAddress, payloadHash, nonce);

    // Get cost estimate
    const costEstimate = await this.estimateCost(payload);
    const totalCost = parseEther(costEstimate.totalETH);

    // Execute payment to escrow
    this.log('info', `Depositing ${costEstimate.totalETH} ETH for job ${jobId}`);
    const escrowContract = await this.getEscrowContract();
    const paymentTx = await escrowContract['depositForBlob'](jobId, { value: totalCost });
    const paymentReceipt = await paymentTx.wait();

    // Submit to proxy
    const proxyUrl = await this.getProxyUrl();
    const proxyResult = await this.submitToProxy(proxyUrl, {
      jobId,
      paymentTxHash: paymentReceipt.hash,
      payload: encodedData,
      meta: fullMeta
    });

    this.log('info', `Blob written successfully via proxy: ${proxyResult.blobTxHash}`);

    return {
      blobTxHash: proxyResult.blobTxHash,
      blockNumber: proxyResult.blockNumber,
      blobHash: proxyResult.blobHash,
      commitment: proxyResult.commitment,
      proof: proxyResult.proof,
      blobIndex: proxyResult.blobIndex,
      meta: fullMeta,
      paymentTx: paymentReceipt.hash,
      jobId,
      proxyUrl,
      totalCostETH: costEstimate.totalETH,
      completionTxHash: proxyResult.completionTxHash,
      paymentMethod: 'web3'
    };
  }

  /**
   * Writes blob using direct transaction (Node.js/serverless environment)
   */
  private async writeWithDirectTransaction(payload: unknown, meta?: Partial<BlobMeta>): Promise<BlobPaymentResult> {
    if (!this.signer) {
      throw new BlobKitError(BlobKitErrorCode.INVALID_CONFIG, 'Signer required for direct transaction');
    }

    await this.ensureKzgInitialized();

    // Encode payload using codec
    const codec = defaultCodecRegistry.get(this.config.defaultCodec);
    const encodedPayload = codec.encode(payload);
    validateBlobSize(encodedPayload);

    // Prepare metadata
    const fullMeta: BlobMeta = {
      appId: meta?.appId ?? 'blobkit',
      codec: meta?.codec ?? this.config.defaultCodec,
      timestamp: meta?.timestamp ?? Date.now(),
      contentHash: calculatePayloadHash(encodedPayload),
      ...(meta?.ttlBlocks !== undefined && { ttlBlocks: meta.ttlBlocks }),
      ...(meta?.filename !== undefined && { filename: meta.filename }),
      ...(meta?.contentType !== undefined && { contentType: meta.contentType }),
      ...(meta?.tags !== undefined && { tags: meta.tags })
    };

    // Pack metadata and payload
    const metaBytes = new TextEncoder().encode(JSON.stringify(fullMeta));
    const combined = new Uint8Array(4 + metaBytes.length + encodedPayload.length);
    
    new DataView(combined.buffer).setUint32(0, metaBytes.length, false);
    combined.set(metaBytes, 4);
    combined.set(encodedPayload, 4 + metaBytes.length);

    // Encode to blob format
    const blob = encodeBlob(combined);
    
    // Generate KZG commitment and proof
    const commitment = blobToKzgCommitment(blob);
    const proof = computeKzgProof(blob, commitment);
    const versionedHash = await commitmentToVersionedHash(commitment);

    // Convert to hex
    const commitmentHex = bytesToHex(commitment);
    const proofHex = bytesToHex(proof);
    const blobHash = bytesToHex(versionedHash);

    // Send blob transaction
    const txResponse = await this.sendBlobTransaction(blob, commitmentHex, proofHex);
    const receipt = await txResponse.wait();

    if (!receipt) {
      throw new BlobKitError(BlobKitErrorCode.TRANSACTION_FAILED, 'Transaction failed');
    }

    this.log('info', `Blob written successfully: ${receipt.hash}`);

    return {
      blobTxHash: receipt.hash,
      blockNumber: receipt.blockNumber ?? 0,
      blobHash,
      commitment: commitmentHex,
      proof: proofHex,
      blobIndex: 0,
      meta: fullMeta,
      paymentTx: receipt.hash,
      jobId: `direct-${receipt.hash}`,
      proxyUrl: '',
      totalCostETH: formatEther(receipt.gasUsed ?? 0n),
      completionTxHash: receipt.hash,
      paymentMethod: 'direct'
    };
  }

  /**
   * Submits encoded blob data to proxy service
   */
  private async submitToProxy(proxyUrl: string, data: {
    jobId: string;
    paymentTxHash: string;
    payload: Uint8Array;
    meta: BlobMeta;
  }): Promise<{
    blobTxHash: string;
    blockNumber: number;
    blobHash: string;
    commitment: string;
    proof: string;
    blobIndex: number;
    completionTxHash: string;
  }> {
    const response = await fetch(`${proxyUrl}/api/v1/blob/write`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobId: data.jobId,
        paymentTxHash: data.paymentTxHash,
        payload: Array.from(data.payload), // Convert Uint8Array to regular array for JSON
        meta: data.meta
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new BlobKitError(
        BlobKitErrorCode.PROXY_ERROR,
        `Proxy request failed: ${response.status} ${errorText}`
      );
    }

    const result = await response.json();
    return result;
  }

  /**
   * Gets the proxy URL for blob submission
   */
  private async getProxyUrl(): Promise<string> {
    if (this.proxyUrl) {
      return this.proxyUrl;
    }

    if (this.config.proxyUrl) {
      this.proxyUrl = this.config.proxyUrl;
      return this.proxyUrl;
    }

    // Auto-discover proxy
    this.proxyUrl = await discoverProxyUrl(this.config.chainId);
    return this.proxyUrl;
  }

  /**
   * Gets the escrow contract instance
   */
  private async getEscrowContract(): Promise<ethers.Contract> {
    if (this.escrowContract) {
      return this.escrowContract;
    }

    if (!this.signer?.provider) {
      throw new BlobKitError(BlobKitErrorCode.INVALID_CONFIG, 'Provider required for contract interaction');
    }

    // Simple ABI for escrow contract
    const abi = [
      'function depositForBlob(bytes32 jobId) external payable',
      'function getJobTimeout() external view returns (uint256)',
      'function isJobExpired(bytes32 jobId) external view returns (bool)',
      'function refundExpiredJob(bytes32 jobId) external',
      'function getJob(bytes32 jobId) external view returns (tuple(address user, uint256 amount, bool completed, uint256 timestamp, bytes32 blobTxHash))',
      'event JobCreated(bytes32 indexed jobId, address indexed user, uint256 amount)',
      'event JobCompleted(bytes32 indexed jobId, bytes32 blobTxHash, uint256 proxyFee)',
      'event JobRefunded(bytes32 indexed jobId, string reason)'
    ];

    // Use signer if it's compatible with ethers.Signer, otherwise use provider
    let contractRunner: ethers.ContractRunner;
    
    if ('connect' in this.signer) {
      // This is likely an ethers.Signer
      contractRunner = this.signer as unknown as ethers.Signer;
    } else if (this.signer.provider) {
      // Use the signer's provider
      contractRunner = this.signer.provider as ethers.Provider;
    } else {
      // Fallback to creating a new provider
      contractRunner = new ethers.JsonRpcProvider(this.config.rpcUrl);
    }
    
    this.escrowContract = new ethers.Contract(
      this.config.escrowContract,
      abi,
      contractRunner
    );

    return this.escrowContract;
  }

  /**
   * Gets job status from escrow contract
   */
  private async getJobStatus(jobId: string): Promise<JobStatus> {
    const contract = await this.getEscrowContract();
    const job = await contract['getJob'](jobId);
    
    return {
      exists: job.user !== '0x0000000000000000000000000000000000000000',
      user: job.user,
      amount: formatEther(job.amount),
      completed: job.completed,
      timestamp: Number(job.timestamp),
      blobTxHash: job.blobTxHash
    };
  }

  /**
   * Gets proxy fee percentage
   */
  private async getProxyFeePercent(): Promise<number> {
    try {
      const proxyUrl = await this.getProxyUrl();
      const response = await fetch(`${proxyUrl}/api/v1/health`);
      const health = await response.json();
      return health.proxyFeePercent || 0;
    } catch {
      return 0; // Default to 0% if unable to fetch
    }
  }

  /**
   * Validates the configuration
   */
  private validateConfig(config: BlobKitConfig): void {
    if (!config.rpcUrl) {
      throw new BlobKitError(BlobKitErrorCode.INVALID_CONFIG, 'rpcUrl is required');
    }

    if (!isValidAddress(config.escrowContract || '')) {
      // Will be validated later when we try to get the default contract
    }

    // Validate environment variables if running in Node.js
    if (this.environment === 'node') {
      validateEnvironmentConfig();
    }
  }

  /**
   * Logs messages based on configured log level
   */
  private log(level: 'debug' | 'info', message: string, obj?: unknown): void {
    if (this.config.logLevel === 'silent') return;
    if (this.config.logLevel === 'info' && level === 'debug') return;
    
    console.log(`[BlobKit:${level.toUpperCase()}] ${message}`);
    if (obj) {
      console.log(obj);
    }
  }

  /**
   * Send blob transaction to Ethereum
   */
  private async sendBlobTransaction(
    blob: Uint8Array,
    commitment: string,
    proof: string
  ): Promise<{ hash: string; wait(): Promise<{ hash: string; blockNumber?: number; gasUsed?: bigint }> }> {
    if (!this.signer) {
      throw new BlobKitError(BlobKitErrorCode.INVALID_CONFIG, 'Signer required');
    }

    // Check if using MetaMask or browser wallet
    const provider = this.signer.provider;
    if (!provider) {
      throw new BlobKitError(BlobKitErrorCode.ENVIRONMENT_ERROR, 'Provider not available');
    }

    // Get fee data
    const ethersFeeData = await provider.getFeeData();
    const blobGasPrice = (ethersFeeData as any).maxFeePerBlobGas ?? ethers.parseUnits('1', 'gwei');

    const tx: TransactionRequest = {
      type: 3,
      to: '0x0000000000000000000000000000000000000000',
      data: '0x',
      value: 0n,
      gasLimit: 21000n,
      maxFeePerGas: ethersFeeData.maxFeePerGas ?? ethers.parseUnits('20', 'gwei'),
      maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei'),
      maxFeePerBlobGas: blobGasPrice,
      blobs: [blob],
      kzgCommitments: [commitment],
      kzgProofs: [proof],
      chainId: this.config.chainId
    };

    return this.signer.sendTransaction(tx);
  }
} 
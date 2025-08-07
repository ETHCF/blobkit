import { ethers } from 'ethers';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('SecureSigner');

/**
 * Abstract interface for secure signers
 */
export interface SecureSigner {
  getAddress(): Promise<string>;
  signMessage(message: string | Uint8Array): Promise<string>;
  signTransaction(transaction: ethers.TransactionRequest): Promise<string>;
  connect(provider: ethers.Provider): SecureSigner;
}

/**
 * Signer configuration options
 */
export interface SecureSignerConfig {
  type: 'env' | 'aws-kms' | 'gcp-kms' | 'hsm';
  keyId?: string; // KMS key ID or HSM key identifier
  region?: string; // AWS region
  projectId?: string; // GCP project ID
  hsmPin?: string; // HSM PIN
  privateKey?: string; // Only for env type
}

/**
 * Environment variable signer (fallback with warning)
 */
class EnvSigner implements SecureSigner {
  private signer: ethers.Wallet;

  constructor(privateKey: string, provider?: ethers.Provider) {
    logger.warn(
      '⚠️  Using private key from environment variable. This is NOT recommended for production!'
    );
    logger.warn('⚠️  Consider using AWS KMS, GCP KMS, or HSM for secure key management.');
    this.signer = new ethers.Wallet(privateKey, provider);
  }

  async getAddress(): Promise<string> {
    return this.signer.getAddress();
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    return this.signer.signMessage(message);
  }

  async signTransaction(transaction: ethers.TransactionRequest): Promise<string> {
    return this.signer.signTransaction(transaction);
  }

  connect(provider: ethers.Provider): SecureSigner {
    return new EnvSigner(this.signer.privateKey, provider);
  }
}

/**
 * AWS KMS Signer
 * Requires AWS SDK to be installed: npm install @aws-sdk/client-kms
 */
class AwsKmsSigner implements SecureSigner {
  private address: string | null = null;
  private provider: ethers.Provider | null = null;

  constructor(
    private keyId: string,
    private region: string,
    provider?: ethers.Provider
  ) {
    this.provider = provider || null;
    logger.info(`Initializing AWS KMS signer with key: ${keyId}`);
  }

  async getAddress(): Promise<string> {
    if (this.address) return this.address;

    try {
      // Dynamic import to avoid dependency if not using AWS KMS
      const { KMSClient, GetPublicKeyCommand } = await import('@aws-sdk/client-kms');
      const client = new KMSClient({ region: this.region });

      const command = new GetPublicKeyCommand({ KeyId: this.keyId });
      const response = await client.send(command);

      if (!response.PublicKey) {
        throw new Error('Failed to get public key from KMS');
      }

      // Derive address from public key
      const publicKey = Buffer.from(response.PublicKey);
      const uncompressedPublicKey = publicKey.slice(1); // Remove the 0x04 prefix
      const hash = ethers.keccak256(uncompressedPublicKey);
      this.address = '0x' + hash.slice(-40);

      return this.address;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Cannot find module')) {
        throw new Error('AWS KMS signer requires @aws-sdk/client-kms to be installed');
      }
      throw error;
    }
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    const messageBytes = typeof message === 'string' ? ethers.toUtf8Bytes(message) : message;

    const messageHash = ethers.hashMessage(messageBytes);
    return this.signDigest(messageHash);
  }

  async signTransaction(transaction: ethers.TransactionRequest): Promise<string> {
    if (!this.provider) {
      throw new Error('Provider required for signing transactions');
    }

    // Resolve any Addressable types to strings
    const resolvedTx: ethers.TransactionRequest = {
      ...transaction,
      to: transaction.to
        ? typeof transaction.to === 'string'
          ? transaction.to
          : await (transaction.to as ethers.Addressable).getAddress()
        : null,
      from: transaction.from
        ? typeof transaction.from === 'string'
          ? transaction.from
          : await (transaction.from as ethers.Addressable).getAddress()
        : undefined
    };

    const tx = await ethers.resolveProperties(resolvedTx);

    // Convert resolved properties to TransactionLike<string> format
    const txLike: ethers.TransactionLike<string> = {
      type: tx.type,
      to: tx.to as string | null,
      from: tx.from as string,
      nonce: tx.nonce,
      gasLimit: tx.gasLimit,
      gasPrice: tx.gasPrice,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
      maxFeePerGas: tx.maxFeePerGas,
      data: tx.data,
      value: tx.value,
      chainId: tx.chainId,
      accessList: tx.accessList,
      blobVersionedHashes: tx.blobVersionedHashes,
      kzg: tx.kzg,
      blobs: tx.blobs
    };

    const serialized = ethers.Transaction.from(txLike).unsignedSerialized;
    const hash = ethers.keccak256(serialized);

    const signature = await this.signDigest(hash);
    const sig = ethers.Signature.from(signature);

    // Create a new transaction with the signature
    const signedTx = ethers.Transaction.from(txLike);
    signedTx.signature = sig;

    return signedTx.serialized;
  }

  private async signDigest(digest: string): Promise<string> {
    try {
      const { KMSClient, SignCommand } = await import('@aws-sdk/client-kms');
      const client = new KMSClient({ region: this.region });

      const command = new SignCommand({
        KeyId: this.keyId,
        Message: Buffer.from(digest.slice(2), 'hex'),
        MessageType: 'DIGEST',
        SigningAlgorithm: 'ECDSA_SHA_256'
      });

      const response = await client.send(command);
      if (!response.Signature) {
        throw new Error('Failed to get signature from KMS');
      }

      // Convert DER encoded signature to Ethereum signature format
      const signature = Buffer.from(response.Signature);
      // This is simplified - actual implementation would need proper DER parsing
      const r = signature.slice(4, 36);
      const s = signature.slice(38, 70);
      const v = 27; // Recovery parameter - would need to be calculated properly

      return ethers.concat([
        ethers.hexlify(r),
        ethers.hexlify(s),
        ethers.hexlify(new Uint8Array([v]))
      ]);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Cannot find module')) {
        throw new Error('AWS KMS signer requires @aws-sdk/client-kms to be installed');
      }
      throw error;
    }
  }

  connect(provider: ethers.Provider): SecureSigner {
    return new AwsKmsSigner(this.keyId, this.region, provider);
  }
}

/**
 * Factory function to create appropriate signer based on configuration
 */
export async function createSecureSigner(
  config: SecureSignerConfig,
  provider?: ethers.Provider
): Promise<SecureSigner> {
  switch (config.type) {
    case 'env':
      if (!config.privateKey) {
        throw new Error('Private key required for env signer');
      }
      return new EnvSigner(config.privateKey, provider);

    case 'aws-kms':
      if (!config.keyId || !config.region) {
        throw new Error('Key ID and region required for AWS KMS signer');
      }
      return new AwsKmsSigner(config.keyId, config.region, provider);

    case 'gcp-kms':
      throw new Error('GCP KMS signer not yet implemented. Use AWS KMS or env for now.');

    case 'hsm':
      throw new Error('HSM signer not yet implemented. Use AWS KMS or env for now.');

    default:
      throw new Error(`Unknown signer type: ${config.type}`);
  }
}

/**
 * Helper to load signer configuration from environment
 */
export function loadSignerConfig(): SecureSignerConfig {
  // Check for KMS configuration first
  if (process.env.AWS_KMS_KEY_ID) {
    logger.info('Using AWS KMS for key management');
    return {
      type: 'aws-kms',
      keyId: process.env.AWS_KMS_KEY_ID,
      region: process.env.AWS_REGION || 'us-east-1'
    };
  }

  if (process.env.GCP_KMS_KEY_ID) {
    logger.info('Using GCP KMS for key management');
    return {
      type: 'gcp-kms',
      keyId: process.env.GCP_KMS_KEY_ID,
      projectId: process.env.GCP_PROJECT_ID
    };
  }

  if (process.env.HSM_KEY_ID) {
    logger.info('Using HSM for key management');
    return {
      type: 'hsm',
      keyId: process.env.HSM_KEY_ID,
      hsmPin: process.env.HSM_PIN
    };
  }

  // Fallback to environment variable with warning
  if (process.env.PRIVATE_KEY) {
    return {
      type: 'env',
      privateKey: process.env.PRIVATE_KEY
    };
  }

  throw new Error(
    'No signing configuration found. Set AWS_KMS_KEY_ID, GCP_KMS_KEY_ID, HSM_KEY_ID, or PRIVATE_KEY'
  );
}

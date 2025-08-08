import { ethers } from 'ethers';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('SecureSigner');

/**
 * Abstract interface for secure signers
 */
export interface SecureSigner {
  getAddress(): Promise<string>;
  signMessage(message: string | Uint8Array): Promise<string>;
  signTypedData(
    domain: Record<string, unknown>,
    types: TypedDataTypes,
    value: Record<string, unknown>
  ): Promise<string>;
  signTransaction(transaction: ethers.TransactionRequest): Promise<string>;
  connect(provider: ethers.Provider): SecureSigner;
}

/**
 * Signer configuration options
 */
export interface SecureSignerConfig {
  type: 'env' | 'aws-kms' | 'gcp-kms';
  keyId?: string; // AWS KMS key ID/ARN
  region?: string; // AWS region
  keyName?: string; // GCP KMS key version name (projects/.../cryptoKeyVersions/...)
  privateKey?: string; // Only for env type
}

export type TypedDataTypes = Record<string, Array<{ name: string; type: string }>>;

/**
 * Environment variable signer (fallback with warning)
 */
class EnvSigner implements SecureSigner {
  private signer: ethers.Wallet;

  constructor(privateKey: string, provider?: ethers.Provider) {
    logger.warn(
      'Using private key from environment variable. This is not recommended for production.'
    );
    logger.warn('Consider using AWS KMS or GCP KMS for secure key management.');
    this.signer = new ethers.Wallet(privateKey, provider);
  }

  async getAddress(): Promise<string> {
    return this.signer.getAddress();
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    return this.signer.signMessage(message);
  }

  signTypedData(
    domain: Record<string, unknown>,
    types: TypedDataTypes,
    value: Record<string, unknown>
  ): Promise<string> {
    return (this.signer as unknown as {
      signTypedData: (
        d: Record<string, unknown>,
        t: TypedDataTypes,
        v: Record<string, unknown>
      ) => Promise<string>;
    }).signTypedData(domain, types, value);
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

      // PublicKey is DER-encoded SPKI; extract uncompressed EC point
      const spki = Uint8Array.from(response.PublicKey);
      const pub = this.extractSpkiEcPoint(spki);
      this.address = ethers.computeAddress(ethers.hexlify(pub));

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

  signTypedData(
    domain: Record<string, unknown>,
    types: TypedDataTypes,
    value: Record<string, unknown>
  ): Promise<string> {
    const digest = (ethers as unknown as {
      TypedDataEncoder: { hash: (d: unknown, t: unknown, v: unknown) => string };
    }).TypedDataEncoder.hash(domain, types, value);
    return this.signDigest(digest);
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
      // Parse DER, enforce low-s, compute recovery id by matching address
      const { r, s } = this.parseDerEcdsaSignature(Buffer.from(response.Signature));
      const { rHex, sHex } = this.normalizeLowS(r, s);
      const expected = await this.getAddress();
      const v = this.recoverV(digest, rHex, sHex, expected);
      return ethers.concat([`0x${rHex}`, `0x${sHex}`, ethers.hexlify(new Uint8Array([v]))]);
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

  private extractSpkiEcPoint(spkiDer: Uint8Array): Uint8Array {
    let i = 0;
    const expect = (val: number) => {
      if (spkiDer[i++] !== val) throw new Error('Invalid SPKI');
    };
    const readLen = (): number => {
      let len = spkiDer[i++];
      if (len & 0x80) {
        const n = len & 0x7f;
        len = 0;
        for (let j = 0; j < n; j++) len = (len << 8) | spkiDer[i++];
      }
      return len;
    };
    expect(0x30);
    readLen();
    expect(0x30);
    const algLen = readLen();
    i += algLen;
    expect(0x03);
    const bitLen = readLen();
    const unused = spkiDer[i++];
    if (unused !== 0) throw new Error('Invalid EC public key bit string');
    const key = spkiDer.slice(i, i + (bitLen - 1));
    if (key[0] !== 0x04 || key.length !== 65) throw new Error('Expected uncompressed EC point');
    return key;
  }

  private parseDerEcdsaSignature(der: Buffer): { r: bigint; s: bigint } {
    let idx = 0;
    const expect = (val: number) => {
      if (der[idx++] !== val) throw new Error('Invalid DER');
    };
    const readLen = (): number => {
      let len = der[idx++];
      if (len & 0x80) {
        const n = len & 0x7f;
        len = 0;
        for (let j = 0; j < n; j++) len = (len << 8) | der[idx++];
      }
      return len;
    };
    expect(0x30);
    readLen();
    expect(0x02);
    const rLen = readLen();
    let rBytes = der.slice(idx, idx + rLen);
    idx += rLen;
    expect(0x02);
    const sLen = readLen();
    let sBytes = der.slice(idx, idx + sLen);
    while (rBytes.length > 0 && rBytes[0] === 0x00) rBytes = rBytes.slice(1);
    while (sBytes.length > 0 && sBytes[0] === 0x00) sBytes = sBytes.slice(1);
    const r = BigInt('0x' + rBytes.toString('hex'));
    const s = BigInt('0x' + sBytes.toString('hex'));
    return { r, s };
  }

  private normalizeLowS(r: bigint, s: bigint): { rHex: string; sHex: string } {
    const n = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
    const halfN = n >> BigInt(1);
    const sNorm = s > halfN ? n - s : s;
    const hex32 = (x: bigint) => x.toString(16).padStart(64, '0');
    return { rHex: hex32(r), sHex: hex32(sNorm) };
  }

  private recoverV(digest: string, rHex: string, sHex: string, expected: string): number {
    const base = `0x${rHex}${sHex}`;
    for (const v of [27, 28]) {
      const suffix = (v - 27).toString(16).padStart(2, '0');
      const sig = ethers.Signature.from(`${base}${suffix}`);
      const rec = ethers.recoverAddress(digest, sig);
      if (ethers.getAddress(rec) === ethers.getAddress(expected)) return v;
    }
    throw new Error('Failed to recover correct recovery id (v)');
  }
}

/**
 * GCP KMS Signer (EC_SECP256K1)
 */
class GcpKmsSigner implements SecureSigner {
  private address: string | null = null;
  private provider: ethers.Provider | null = null;
  private keyName: string;

  constructor(keyName: string, provider?: ethers.Provider) {
    this.keyName = keyName;
    this.provider = provider || null;
    logger.info(`Initializing GCP KMS signer with key: ${keyName}`);
  }

  async getAddress(): Promise<string> {
    if (this.address) return this.address;
    const pub = await this.getUncompressedPublicKey();
    this.address = ethers.computeAddress(ethers.hexlify(pub));
    return this.address;
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    const msg = typeof message === 'string' ? ethers.toUtf8Bytes(message) : message;
    const digest = ethers.hashMessage(msg);
    return this.signDigest(digest);
  }

  signTypedData(
    domain: Record<string, unknown>,
    types: TypedDataTypes,
    value: Record<string, unknown>
  ): Promise<string> {
    const digest = (ethers as unknown as {
      TypedDataEncoder: { hash: (d: unknown, t: unknown, v: unknown) => string };
    }).TypedDataEncoder.hash(domain, types, value);
    return this.signDigest(digest);
  }

  async signTransaction(transaction: ethers.TransactionRequest): Promise<string> {
    if (!this.provider) {
      throw new Error('Provider required for signing transactions');
    }

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

    const unsignedSerialized = ethers.Transaction.from(txLike).unsignedSerialized;
    const digest = ethers.keccak256(unsignedSerialized);
    const sigHex = await this.signDigest(digest);
    const sig = ethers.Signature.from(sigHex);
    const signed = ethers.Transaction.from(txLike);
    signed.signature = sig;
    return signed.serialized;
  }

  connect(provider: ethers.Provider): SecureSigner {
    return new GcpKmsSigner(this.keyName, provider);
  }

  private async getUncompressedPublicKey(): Promise<Uint8Array> {
    const { KeyManagementServiceClient } = await import('@google-cloud/kms');
    const client = new KeyManagementServiceClient();
    const [publicKey] = await client.getPublicKey({ name: this.keyName });
    if (!publicKey || !publicKey.pem) {
      throw new Error('Failed to get public key from GCP KMS');
    }
    const der = this.pemToDer(publicKey.pem);
    return this.extractSpkiEcPoint(der);
  }

  private pemToDer(pem: string): Uint8Array {
    const b64 = pem
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .replace(/\s+/g, '');
    return Uint8Array.from(Buffer.from(b64, 'base64'));
  }

  private extractSpkiEcPoint(spkiDer: Uint8Array): Uint8Array {
    let i = 0;
    const expect = (val: number) => {
      if (spkiDer[i++] !== val) throw new Error('Invalid SPKI');
    };
    const readLen = (): number => {
      let len = spkiDer[i++];
      if (len & 0x80) {
        const n = len & 0x7f;
        len = 0;
        for (let j = 0; j < n; j++) len = (len << 8) | spkiDer[i++];
      }
      return len;
    };
    expect(0x30);
    readLen();
    expect(0x30);
    const algLen = readLen();
    i += algLen;
    expect(0x03);
    const bitLen = readLen();
    const unused = spkiDer[i++];
    if (unused !== 0) throw new Error('Invalid EC public key bit string');
    const key = spkiDer.slice(i, i + (bitLen - 1));
    if (key[0] !== 0x04 || key.length !== 65) throw new Error('Expected uncompressed EC point');
    return key;
  }

  private async signDigest(digest: string): Promise<string> {
    const { KeyManagementServiceClient } = await import('@google-cloud/kms');
    const client = new KeyManagementServiceClient();
    const digestBytes = Buffer.from(digest.slice(2), 'hex');
    const [resp] = await client.asymmetricSign({ name: this.keyName, digest: { sha256: digestBytes } });
    if (!resp.signature) throw new Error('Failed to get signature from GCP KMS');
    const { r, s } = this.parseDerEcdsaSignature(Buffer.from(resp.signature));
    const { rHex, sHex } = this.normalizeLowS(r, s);
    const expected = await this.getAddress();
    const v = this.recoverV(digest, rHex, sHex, expected);
    return ethers.concat([`0x${rHex}`, `0x${sHex}`, ethers.hexlify(new Uint8Array([v]))]);
  }

  private parseDerEcdsaSignature(der: Buffer): { r: bigint; s: bigint } {
    let idx = 0;
    const expect = (val: number) => {
      if (der[idx++] !== val) throw new Error('Invalid DER');
    };
    const readLen = (): number => {
      let len = der[idx++];
      if (len & 0x80) {
        const n = len & 0x7f;
        len = 0;
        for (let j = 0; j < n; j++) len = (len << 8) | der[idx++];
      }
      return len;
    };
    expect(0x30);
    readLen();
    expect(0x02);
    const rLen = readLen();
    let rBytes = der.slice(idx, idx + rLen);
    idx += rLen;
    expect(0x02);
    const sLen = readLen();
    let sBytes = der.slice(idx, idx + sLen);
    // trim leading zeros
    while (rBytes.length > 0 && rBytes[0] === 0x00) rBytes = rBytes.slice(1);
    while (sBytes.length > 0 && sBytes[0] === 0x00) sBytes = sBytes.slice(1);
    const r = BigInt('0x' + rBytes.toString('hex'));
    const s = BigInt('0x' + sBytes.toString('hex'));
    return { r, s };
  }

  private normalizeLowS(r: bigint, s: bigint): { rHex: string; sHex: string } {
    const n = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
    const halfN = n >> BigInt(1);
    const sNorm = s > halfN ? n - s : s;
    const hex32 = (x: bigint) => x.toString(16).padStart(64, '0');
    return { rHex: hex32(r), sHex: hex32(sNorm) };
  }

  private recoverV(digest: string, rHex: string, sHex: string, expected: string): number {
    const base = `0x${rHex}${sHex}`;
    for (const v of [27, 28]) {
      const suffix = (v - 27).toString(16).padStart(2, '0');
      const sig = ethers.Signature.from(`${base}${suffix}`);
      const rec = ethers.recoverAddress(digest, sig);
      if (ethers.getAddress(rec) === ethers.getAddress(expected)) return v;
    }
    throw new Error('Failed to recover correct recovery id (v)');
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
      if (!config.keyName) {
        throw new Error('Key name required for GCP KMS signer');
      }
      return new GcpKmsSigner(config.keyName, provider);

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

  if (process.env.GCP_KMS_KEY_NAME) {
    logger.info('Using GCP KMS for key management');
    return {
      type: 'gcp-kms',
      keyName: process.env.GCP_KMS_KEY_NAME
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
    'No signing configuration found. Set AWS_KMS_KEY_ID, GCP_KMS_KEY_NAME, or PRIVATE_KEY'
  );
}

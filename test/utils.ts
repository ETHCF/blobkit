/**
 * Global test utilities for integration tests
 *
 * Provides utilities for end-to-end testing across all packages
 */

import { spawn, ChildProcess } from 'child_process';
import { ethers } from 'ethers';
import path from 'path';
import fs from 'fs/promises';

/**
 * Manages Anvil local blockchain for testing
 */
export class AnvilManager {
  private process: ChildProcess | null = null;
  private port: number;
  private chainId: number;

  constructor(port: number = 8545, chainId: number = 31337) {
    this.port = port;
    this.chainId = chainId;
  }

  async start(): Promise<void> {
    if (this.process) {
      throw new Error('Anvil already running');
    }

    this.process = spawn(
      'anvil',
      [
        '--port',
        this.port.toString(),
        '--chain-id',
        this.chainId.toString(),
        '--accounts',
        '10',
        '--balance',
        '10000',
        '--block-time',
        '1'
      ],
      {
        stdio: 'pipe'
      }
    );

    // Wait for Anvil to be ready
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Anvil startup timeout'));
      }, 10000);

      this.process!.stdout?.on('data', data => {
        const output = data.toString();
        if (output.includes('Listening on')) {
          clearTimeout(timeout);
          resolve(undefined);
        }
      });

      this.process!.stderr?.on('data', data => {
        console.error('Anvil error:', data.toString());
      });

      this.process!.on('error', error => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.process = null;
    }
  }

  getRpcUrl(): string {
    return `http://localhost:${this.port}`;
  }

  getChainId(): number {
    return this.chainId;
  }

  /**
   * Get test accounts with private keys
   */
  getTestAccounts(): Array<{ address: string; privateKey: string }> {
    // Anvil default test accounts
    return [
      {
        address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
      },
      {
        address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
      },
      {
        address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
        privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'
      }
    ];
  }
}

/**
 * Contract deployment utilities
 */
export class ContractDeployer {
  private provider: ethers.Provider;
  private signer: ethers.Signer;

  constructor(provider: ethers.Provider, signer: ethers.Signer) {
    this.provider = provider;
    this.signer = signer;
  }

  /**
   * Deploy the BlobKitEscrow contract
   */
  async deployEscrowContract(): Promise<string> {
    // Load contract artifact
    const artifactPath = path.join(
      process.cwd(),
      'packages/contracts/artifacts/BlobKitEscrow.sol/BlobKitEscrow.json'
    );

    const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf-8'));

    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, this.signer);

    const contract = await factory.deploy(await this.signer.getAddress());
    await contract.waitForDeployment();

    return await contract.getAddress();
  }

  /**
   * Get escrow contract instance
   */
  getEscrowContract(address: string): ethers.Contract {
    const artifactPath = path.join(
      process.cwd(),
      'packages/contracts/artifacts/BlobKitEscrow.sol/BlobKitEscrow.json'
    );

    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
    return new ethers.Contract(address, artifact.abi, this.signer);
  }
}

/**
 * Proxy server manager for integration tests
 */
export class ProxyServerManager {
  private process: ChildProcess | null = null;
  private port: number;
  private config: Record<string, string>;

  constructor(port: number = 3001, config: Record<string, string> = {}) {
    this.port = port;
    this.config = config;
  }

  async start(escrowContract: string, rpcUrl: string): Promise<void> {
    if (this.process) {
      throw new Error('Proxy server already running');
    }

    const serverPath = path.join(process.cwd(), 'packages/proxy-server/dist/index.js');

    this.process = spawn('node', [serverPath], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: this.port.toString(),
        RPC_URL: rpcUrl,
        CHAIN_ID: '31337',
        PRIVATE_KEY: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
        ESCROW_CONTRACT: escrowContract,
        LOG_LEVEL: 'debug',
        PROXY_FEE_PERCENT: '0',
        MAX_BLOB_SIZE: '131072',
        JOB_TIMEOUT_SECONDS: '300',
        ...this.config
      },
      stdio: 'pipe'
    });

    // Wait for server to be ready
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Proxy server startup timeout'));
      }, 15000);

      this.process!.stdout?.on('data', data => {
        const output = data.toString();
        if (output.includes('Proxy server listening') || output.includes('Server started')) {
          clearTimeout(timeout);
          resolve(undefined);
        }
      });

      this.process!.stderr?.on('data', data => {
        console.error('Proxy error:', data.toString());
      });

      this.process!.on('error', error => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    // Additional wait for server to be fully ready
    await this.waitForHealth();
  }

  private async waitForHealth(maxAttempts: number = 30): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`http://localhost:${this.port}/api/v1/health`);
        if (response.ok) {
          return;
        }
      } catch (error) {
        // Server not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Proxy server health check timeout');
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 2000));
      this.process = null;
    }
  }

  getUrl(): string {
    return `http://localhost:${this.port}`;
  }
}

/**
 * Complete integration test environment
 */
export class IntegrationTestEnvironment {
  private anvil: AnvilManager;
  private proxy: ProxyServerManager;
  private provider: ethers.JsonRpcProvider | null = null;
  private signer: ethers.Wallet | null = null;
  private escrowAddress: string | null = null;

  constructor() {
    this.anvil = new AnvilManager();
    this.proxy = new ProxyServerManager();
  }

  async setup(): Promise<{
    provider: ethers.JsonRpcProvider;
    rpcUrl: string;
    signer: ethers.Wallet;
    escrowAddress: string;
    proxyUrl: string;
  }> {
    // Start Anvil
    await this.anvil.start();

    // Setup provider and signer
    this.provider = new ethers.JsonRpcProvider(this.anvil.getRpcUrl());
    const accounts = this.anvil.getTestAccounts();
    this.signer = new ethers.Wallet(accounts[0].privateKey, this.provider);

    // Deploy contracts
    const deployer = new ContractDeployer(this.provider, this.signer);
    this.escrowAddress = await deployer.deployEscrowContract();

    // Start proxy server
    await this.proxy.start(this.escrowAddress, this.anvil.getRpcUrl());

    return {
      provider: this.provider,
      rpcUrl: this.anvil.getRpcUrl(),
      signer: this.signer,
      escrowAddress: this.escrowAddress,
      proxyUrl: this.proxy.getUrl()
    };
  }

  async teardown(): Promise<void> {
    await this.proxy.stop();
    await this.anvil.stop();
  }

  getProvider(): ethers.JsonRpcProvider {
    if (!this.provider) {
      throw new Error('Environment not set up');
    }
    return this.provider;
  }

  getSigner(): ethers.Wallet {
    if (!this.signer) {
      throw new Error('Environment not set up');
    }
    return this.signer;
  }

  getEscrowAddress(): string {
    if (!this.escrowAddress) {
      throw new Error('Environment not set up');
    }
    return this.escrowAddress;
  }

  getProxyUrl(): string {
    return this.proxy.getUrl();
  }

  /**
   * Mine blocks to advance time
   */
  async mineBlocks(count: number): Promise<void> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    for (let i = 0; i < count; i++) {
      await this.provider.send('evm_mine', []);
    }
  }

  /**
   * Increase blockchain time
   */
  async increaseTime(seconds: number): Promise<void> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    await this.provider.send('evm_increaseTime', [seconds]);
    await this.provider.send('evm_mine', []);
  }
}

/**
 * Creates a minimal trusted setup file for testing
 */
export async function createTestTrustedSetup(): Promise<string> {
  const setupPath = '/tmp/test-trusted-setup.txt';

  // Create minimal valid setup
  const g1Points = 4096;
  const g2Points = 65;
  const content = `${g1Points}\n${g2Points}\n${'0'.repeat(g1Points * 48 * 2)}${'0'.repeat(g2Points * 96 * 2)}`;

  await fs.writeFile(setupPath, content);
  return setupPath;
}

/**
 * Generates test blob data with specific patterns
 */
export function generateTestBlobData(
  pattern: 'sequential' | 'random' | 'zeros',
  size: number
): Uint8Array {
  const data = new Uint8Array(size);

  switch (pattern) {
    case 'sequential':
      for (let i = 0; i < size; i++) {
        data[i] = i % 256;
      }
      break;
    case 'random':
      for (let i = 0; i < size; i++) {
        data[i] = Math.floor(Math.random() * 256);
      }
      break;
    case 'zeros':
      // Already initialized to zeros
      break;
  }

  return data;
}

/**
 * Validates blob transaction on chain
 */
export async function validateBlobTransaction(
  provider: ethers.Provider,
  txHash: string
): Promise<{
  valid: boolean;
  type: number;
  blobVersionedHashes: string[];
}> {
  const tx = await provider.getTransaction(txHash);

  if (!tx) {
    return { valid: false, type: 0, blobVersionedHashes: [] };
  }

  return {
    valid: tx.type === 3,
    type: tx.type || 0,
    blobVersionedHashes: (tx as any).blobVersionedHashes || []
  };
}

/**
 * Compares two Uint8Arrays for equality
 */
export function compareUint8Arrays(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

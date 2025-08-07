/**
 * Integration test environment utilities
 *
 * Provides setup for running integration tests with real infrastructure
 */

import { spawn, ChildProcess } from 'child_process';
import { ethers } from 'ethers';
import path from 'path';
import fs from 'fs';

/**
 * Manages an Anvil local blockchain instance for testing
 */
export class AnvilInstance {
  private process: ChildProcess | null = null;
  private port: number;
  private accounts: TestAccount[] = [];

  constructor(port: number = 8545) {
    this.port = port;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.process = spawn('anvil', [
        '--port',
        this.port.toString(),
        '--block-time',
        '1',
        '--accounts',
        '10',
        '--balance',
        '10000',
        '--silent'
      ]);

      this.process.stderr?.on('data', data => {
        const output = data.toString();
        if (output.includes('Listening')) {
          this.parseAccounts(output);
          resolve();
        }
      });

      this.process.on('error', reject);

      // Timeout after 10 seconds
      setTimeout(() => reject(new Error('Anvil failed to start')), 10000);
    });
  }

  private parseAccounts(output: string): void {
    const lines = output.split('\n');
    const accountRegex = /\((0x[a-fA-F0-9]{40})\)/;
    const keyRegex = /0x[a-fA-F0-9]{64}/;

    for (let i = 0; i < lines.length; i++) {
      const accountMatch = lines[i].match(accountRegex);
      const keyMatch = lines[i].match(keyRegex);

      if (accountMatch && keyMatch) {
        this.accounts.push({
          address: accountMatch[1],
          privateKey: keyMatch[0]
        });
      }
    }
  }

  getTestAccounts(): TestAccount[] {
    return this.accounts;
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

/**
 * Deploys contracts for testing
 */
export class ContractDeployer {
  private provider: ethers.Provider;
  private signer: ethers.Signer;

  constructor(provider: ethers.Provider, signer: ethers.Signer) {
    this.provider = provider;
    this.signer = signer;
  }

  async deployEscrowContract(): Promise<string> {
    // Deploy the BlobKitEscrow contract
    const contractPath = path.join(__dirname, '../../contracts/dist/BlobKitEscrow.json');
    const contractJson = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

    const factory = new ethers.ContractFactory(
      contractJson.abi,
      contractJson.bytecode,
      this.signer
    );

    const contract = await factory.deploy();
    await contract.waitForDeployment();

    return await contract.getAddress();
  }

  getEscrowContract(address: string): ethers.Contract {
    const contractPath = path.join(__dirname, '../../contracts/dist/BlobKitEscrow.json');
    const contractJson = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

    return new ethers.Contract(address, contractJson.abi, this.signer);
  }
}

/**
 * Manages the proxy server instance
 */
export class ProxyServerManager {
  private process: ChildProcess | null = null;
  private port: number;
  private config: ProxyServerConfig;

  constructor(config: ProxyServerConfig) {
    this.config = config;
    this.port = config.port || 3001;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        PORT: this.port.toString(),
        RPC_URL: this.config.rpcUrl,
        CHAIN_ID: this.config.chainId.toString(),
        PRIVATE_KEY: this.config.privateKey,
        ESCROW_CONTRACT: this.config.escrowContract,
        PROXY_FEE_PERCENT: '0',
        LOG_LEVEL: 'silent',
        NODE_ENV: 'test'
      };

      this.process = spawn('node', [path.join(__dirname, '../../dist/index.js')], { env });

      this.process.stdout?.on('data', data => {
        if (data.toString().includes('Server running')) {
          resolve();
        }
      });

      this.process.on('error', reject);

      // Timeout after 10 seconds
      setTimeout(() => reject(new Error('Proxy server failed to start')), 10000);
    });
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
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
  public anvil: AnvilInstance;
  private proxyServer: ProxyServerManager | null = null;
  private provider: ethers.JsonRpcProvider | null = null;
  private escrowAddress: string | null = null;

  constructor() {
    this.anvil = new AnvilInstance();
  }

  async setup(): Promise<TestSetupResult> {
    // Start Anvil
    await this.anvil.start();

    // Create provider
    this.provider = new ethers.JsonRpcProvider('http://localhost:8545');

    // Deploy contracts
    const accounts = this.anvil.getTestAccounts();
    const deployer = new ethers.Wallet(accounts[0].privateKey, this.provider);
    const contractDeployer = new ContractDeployer(this.provider, deployer);
    this.escrowAddress = await contractDeployer.deployEscrowContract();

    // Start proxy server
    this.proxyServer = new ProxyServerManager({
      port: 3001,
      rpcUrl: 'http://localhost:8545',
      chainId: 31337,
      privateKey: accounts[1].privateKey,
      escrowContract: this.escrowAddress
    });
    await this.proxyServer.start();

    return {
      provider: this.provider,
      escrowAddress: this.escrowAddress,
      proxyUrl: this.proxyServer.getUrl(),
      accounts: accounts
    };
  }

  async teardown(): Promise<void> {
    if (this.proxyServer) {
      await this.proxyServer.stop();
    }
    await this.anvil.stop();
  }
}

/**
 * Generates test blob data with different patterns
 */
export function generateTestBlobData(
  pattern: 'sequential' | 'random' | 'zeros' | 'ones',
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
      data.fill(0);
      break;
    case 'ones':
      data.fill(255);
      break;
  }

  return data;
}

/**
 * Validates a blob transaction on-chain
 */
export async function validateBlobTransaction(
  provider: ethers.Provider,
  txHash: string
): Promise<BlobTransactionValidation> {
  const tx = await provider.getTransaction(txHash);

  if (!tx) {
    return {
      valid: false,
      error: 'Transaction not found'
    };
  }

  const receipt = await provider.getTransactionReceipt(txHash);

  if (!receipt || receipt.status !== 1) {
    return {
      valid: false,
      error: 'Transaction failed'
    };
  }

  return {
    valid: true,
    type: tx.type || 0,
    blobVersionedHashes: (tx as any).blobVersionedHashes || [],
    blobGasUsed: (receipt as any).blobGasUsed,
    blobGasPrice: (receipt as any).blobGasPrice
  };
}

// Types
interface TestAccount {
  address: string;
  privateKey: string;
}

interface ProxyServerConfig {
  port?: number;
  rpcUrl: string;
  chainId: number;
  privateKey: string;
  escrowContract: string;
}

interface TestSetupResult {
  provider: ethers.JsonRpcProvider;
  escrowAddress: string;
  proxyUrl: string;
  accounts: TestAccount[];
}

interface BlobTransactionValidation {
  valid: boolean;
  error?: string;
  type?: number;
  blobVersionedHashes?: string[];
  blobGasUsed?: bigint;
  blobGasPrice?: bigint;
}

// Export all test environment utilities
export { TestAccount, ProxyServerConfig, TestSetupResult, BlobTransactionValidation };

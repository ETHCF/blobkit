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
        '10000'
        // Removed --silent to see startup output
      ]);

      let started = false;

      // Listen to both stdout and stderr for startup messages
      this.process.stdout?.on('data', data => {
        const output = data.toString();
        console.log('Anvil stdout:', output);
        if ((output.includes('Listening') || output.includes('Started')) && !started) {
          started = true;
          this.parseAccounts(output);
          // Add a delay and health check before resolving
          setTimeout(async () => {
            try {
              await this.healthCheck();
              resolve();
            } catch (error) {
              console.error('Anvil health check failed:', error);
              reject(error);
            }
          }, 1000);
        }
      });

      this.process.stderr?.on('data', data => {
        const output = data.toString();
        console.log('Anvil stderr:', output);
        if ((output.includes('Listening') || output.includes('Started')) && !started) {
          started = true;
          this.parseAccounts(output);
          // Add a delay and health check before resolving
          setTimeout(async () => {
            try {
              await this.healthCheck();
              resolve();
            } catch (error) {
              console.error('Anvil health check failed:', error);
              reject(error);
            }
          }, 1000);
        }
      });

      this.process.on('error', error => {
        console.error('Anvil process error:', error);
        reject(error);
      });

      this.process.on('exit', (code, signal) => {
        if (!started) {
          console.error(`Anvil exited early with code ${code}, signal ${signal}`);
          reject(new Error(`Anvil exited early with code ${code}`));
        }
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!started) {
          console.error('Anvil startup timeout - killing process');
          this.process?.kill();
          reject(new Error('Anvil failed to start within 10 seconds'));
        }
      }, 10000);
    });
  }

  private async healthCheck(): Promise<void> {
    const { ethers } = await import('ethers');
    const provider = new ethers.JsonRpcProvider(`http://localhost:${this.port}`);
    
    try {
      const blockNumber = await provider.getBlockNumber();
      console.log(`Anvil health check passed - current block: ${blockNumber}`);
    } catch (error) {
      throw new Error(`Anvil health check failed: ${(error as Error).message}`);
    }
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

    // If no accounts were parsed, use default anvil accounts
    if (this.accounts.length === 0) {
      console.log('No accounts parsed from anvil output, using defaults');
      this.accounts = [
        {
          address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
          privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
        },
        {
          address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
          privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
        }
      ];
    }
    console.log(`Parsed ${this.accounts.length} anvil accounts`);
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
    const contractPath = path.join(__dirname, '../../../packages/contracts/out/BlobKitEscrow.sol/BlobKitEscrow.json');
    const contractJson = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

    const factory = new ethers.ContractFactory(
      contractJson.abi,
      contractJson.bytecode.object,
      this.signer
    );

    const contract = await factory.deploy(await this.signer.getAddress());
    await contract.waitForDeployment();

    return await contract.getAddress();
  }

  getEscrowContract(address: string): ethers.Contract {
    const contractPath = path.join(__dirname, '../../../packages/contracts/out/BlobKitEscrow.sol/BlobKitEscrow.json');
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
        ETH_RPC_URL: this.config.rpcUrl,  // Also set this
        ETHEREUM_RPC_URL: this.config.rpcUrl,  // Also set this as backup
        CHAIN_ID: this.config.chainId.toString(),
        PRIVATE_KEY: this.config.privateKey,
        ESCROW_CONTRACT: this.config.escrowContract,
        PROXY_FEE_PERCENT: '0',
        LOG_LEVEL: 'debug',  // Changed from silent to debug to see startup messages
        NODE_ENV: 'test',
        KZG_TRUSTED_SETUP_PATH: './test/shrek-trusted-setup.txt',
        REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379'
      };

      console.log('Starting proxy server with config:', {
        port: this.port,
        rpcUrl: this.config.rpcUrl,
        chainId: this.config.chainId,
        escrowContract: this.config.escrowContract,
        privateKey: this.config.privateKey.substring(0, 10) + '...',
        kzgPath: env.KZG_TRUSTED_SETUP_PATH,
        redisUrl: env.REDIS_URL
      });

      this.process = spawn('node', [path.join(__dirname, '../dist/index.js')], { env });

      let started = false;

      this.process.stdout?.on('data', data => {
        const output = data.toString();
        console.log('Proxy stdout:', output);
        if ((output.includes('Proxy server running') || output.includes('Server running') || output.includes('listening') || output.includes('started')) && !started) {
          started = true;
          resolve();
        }
      });

      this.process.stderr?.on('data', data => {
        const output = data.toString();
        console.error('Proxy stderr:', output);
        // Don't resolve on stderr, but capture it for debugging
      });

      this.process.on('error', error => {
        console.error('Proxy process error:', error);
        reject(error);
      });

      this.process.on('exit', (code, signal) => {
        if (!started) {
          console.error(`Proxy server exited early with code ${code}, signal ${signal}`);
          // Give a small delay to let any final stderr output arrive
          setTimeout(() => {
            reject(new Error(`Proxy server exited early with code ${code}`));
          }, 100);
        }
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!started) {
          console.error('Proxy server startup timeout');
          this.process?.kill();
          reject(new Error('Proxy server failed to start within 10 seconds'));
        }
      }, 10000);
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

    // Authorize the proxy in the escrow contract
    try {
      const escrowContract = contractDeployer.getEscrowContract(this.escrowAddress);
      const proxyAddress = accounts[1].address; // This will be the proxy's address
      // Use getFunction to call the method with proper typing
      const tx = await escrowContract.connect(deployer).getFunction('setProxyAuthorization')(proxyAddress, true);
      await tx.wait();
      console.log(`Authorized proxy ${proxyAddress} in escrow contract`);
    } catch (error) {
      console.log('Could not authorize proxy, proceeding anyway:', (error as Error).message);
    }

    // Wait for Anvil to be fully ready before starting proxy server
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Double-check that Anvil is accessible
    try {
      const testProvider = new ethers.JsonRpcProvider('http://localhost:8545');
      await testProvider.getBlockNumber();
      console.log('Verified Anvil is accessible before starting proxy server');
    } catch (error) {
      console.error('Anvil is not accessible:', (error as Error).message);
      throw new Error('Anvil not ready for proxy server startup');
    }

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

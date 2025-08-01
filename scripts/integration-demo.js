#!/usr/bin/env node

/**
 * BlobKit Integration Demo
 * 
 * This script demonstrates the complete end-to-end flow:
 * 1. Deploy escrow contract locally
 * 2. Start proxy server
 * 3. Write a blob using the SDK
 * 4. Verify the blob was stored successfully
 * 
 * Prerequisites:
 * - Local Ethereum node (Anvil/Hardhat/Ganache) running on localhost:8545
 * - All packages built successfully
 * 
 * Usage: node scripts/integration-demo.js
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

// Configuration
const CONFIG = {
  rpcUrl: 'http://localhost:8545',
  chainId: 31337, // Local Anvil chain
  proxyPort: 3001,
  escrowOwner: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // Anvil default account
  user: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', // Anvil account #1
  userPrivateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
};

class IntegrationDemo {
  constructor() {
    this.contractAddress = null;
    this.proxyProcess = null;
  }

  async run() {
    console.log('🚀 Starting BlobKit Integration Demo\n');
    
    try {
      await this.checkPrerequisites();
      await this.deployContract();
      await this.configureEscrowContract();
      await this.startProxy();
      await this.testBlobWrite();
      await this.cleanup();
      
      console.log('✅ Integration demo completed successfully!');
    } catch (error) {
      console.error('❌ Integration demo failed:', error.message);
      await this.cleanup();
      process.exit(1);
    }
  }

  async checkPrerequisites() {
    console.log('📋 Checking prerequisites...');
    
    // Check if local node is running
    try {
      const { ethers } = await import('ethers');
      const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
      await provider.getBlockNumber();
      console.log('✓ Local Ethereum node is running');
    } catch (error) {
      console.error(error);
      throw new Error(`Local Ethereum node not accessible at ${CONFIG.rpcUrl}. Please start Anvil with: anvil --host 0.0.0.0`);
    }

    // Check if packages are built
    try {
      await import(path.join(rootDir, 'packages/sdk/dist/index.js'));
      console.log('✓ SDK package is built');
    } catch (error) {
      console.error(error);
      throw new Error('SDK package not built. Run: npm run build --workspace=packages/sdk');
    }

    console.log('');
  }

  async deployContract() {
    console.log('📄 Deploying escrow contract...');
    
    try {
      // Set environment variables for deployment
      process.env.PRIVATE_KEY = CONFIG.userPrivateKey;
      process.env.RPC_URL = CONFIG.rpcUrl;
      process.env.ESCROW_OWNER = CONFIG.escrowOwner;
      process.env.CHAIN_ID = CONFIG.chainId.toString();
      const { ethers } = await import('ethers');
      const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
      const signer = new ethers.Wallet(CONFIG.userPrivateKey, provider);
      process.env.ESCROW_OWNER = await signer.getAddress();
      await execAsync('mkdir -p deployments', {
        cwd: path.join(rootDir, 'packages/contracts')
      });
      const { stdout } = await execAsync('forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --private-key $PRIVATE_KEY --broadcast', {
        cwd: path.join(rootDir, 'packages/contracts')
      });
      
      // Extract contract address from output
      const addressMatch = stdout.match(/BlobKitEscrow deployed at: (0x[a-fA-F0-9]{40})/);
      if (!addressMatch) {
        throw new Error('Could not extract contract address from deployment output');
      }
      
      this.contractAddress = addressMatch[1];
      process.env.BLOBKIT_ESCROW_31337 = this.contractAddress;
      process.env.BLOBKIT_ESCROW = this.contractAddress;
      
      console.log(`✓ Contract deployed at: ${this.contractAddress}`);
      console.log('');
    } catch (error) {
      throw new Error(`Contract deployment failed: ${error.message}`);
    }
  }

  async configureEscrowContract() {
    try {
      const { ethers } = await import('ethers');
      const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
      const signer = new ethers.Wallet(CONFIG.userPrivateKey, provider);
      const { default: abi } = await import("./abi.json", {with:{ type: "json" }});
      this.escrowContract = new ethers.Contract(
        this.contractAddress,
        abi,
        signer
      );
      await this.escrowContract.setProxyAuthorization(await signer.getAddress(), true);
    } catch (error) {
      console.error(error);
      throw new Error(`Failed to configure escrow contract: ${error.message}`);
    }
  }


  async startProxy() {
    console.log('🖥️  Starting proxy server...');
    
    try {
      // Set environment variables for proxy
      process.env.PORT = CONFIG.proxyPort.toString();
      process.env.RPC_URL = CONFIG.rpcUrl;
      process.env.CHAIN_ID = CONFIG.chainId.toString();
      process.env.ESCROW_CONTRACT = this.contractAddress;
      process.env.PRIVATE_KEY = CONFIG.userPrivateKey;
      process.env.LOG_LEVEL = 'info';
      

      const { spawn } = await import('child_process');
      this.proxyProcess = spawn('node', ['dist/index.js'], {
        cwd: path.join(rootDir, 'packages/proxy-server'),
        env: process.env,
        stdio: 'pipe',
      });
      console.log('✓ Proxy server started');
      
      // Wait for server to start
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Proxy server failed to start')), 100000);
        
        this.proxyProcess.stdout.on('data', (data) => {
          console.log(data.toString());
          const output = data.toString();
          if (output.includes(`Proxy server running`)) {
            clearTimeout(timeout);
            resolve();
          }
        });
        
        this.proxyProcess.stderr.on('data', (data) => {
          console.error('Proxy error:', data.toString());
        });
        
        this.proxyProcess.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      
      console.log(`✓ Proxy server running on port ${CONFIG.proxyPort}\n`);
    } catch (error) {
      console.error('Error starting proxy server:', error);
      throw new Error(`Proxy server failed to start: ${error.message}`);
    }
  }


  async testBlobWrite() {
    console.log('📝 Testing blob write operation...');
    
    try {
      // Import SDK dynamically
      const { BlobKit } = await import(path.join(rootDir, 'packages/sdk/dist/index.js'));
      const { ethers } = await import('ethers');
      
      // Create provider and signer
      const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
      const signer = new ethers.Wallet(CONFIG.userPrivateKey, provider);
      
      // Create BlobKit instance
      const blobkit = new BlobKit({
        rpcUrl: CONFIG.rpcUrl,
        chainId: CONFIG.chainId,
        escrowContract: this.contractAddress,
        proxyUrl: `http://localhost:${CONFIG.proxyPort}`,
        logLevel: 'debug'
      }, signer);
      
      // Test payload
      const testPayload = {
        message: 'Hello from BlobKit integration demo!',
        timestamp: Date.now(),
        data: Array.from({ length: 100 }, (_, i) => i)
      };
      
      console.log('📤 Writing blob with test payload...');
      
      // Write blob
      const result = await blobkit.writeBlob(testPayload, {
        appId: 'integration-demo',
        filename: 'test-blob.json',
        tags: ['demo', 'integration', 'test']
      });
      
      console.log('✓ Blob written successfully!');
      console.log(`  📋 Job ID: ${result.jobId}`);
      console.log(`  🔗 Blob Hash: ${result.blobHash}`);
      console.log(`  💰 Total Cost: ${result.totalCostETH} ETH`);
      console.log(`  🧾 Payment Tx: ${result.paymentTx}`);
      
      if (result.paymentMethod === 'web3') {
        console.log(`  🖥️  Proxy URL: ${result.proxyUrl}`);
        console.log(`  ✅ Completion Tx: ${result.completionTxHash}`);
      }
      
      // Estimate cost for comparison
      const costEstimate = await blobkit.estimateCost(testPayload);
      console.log('\n💰 Cost breakdown:');
      console.log(`  Blob Fee: ${costEstimate.blobFee} ETH`);
      console.log(`  Gas Fee: ${costEstimate.gasFee} ETH`);
      console.log(`  Proxy Fee: ${costEstimate.proxyFee} ETH`);
      console.log(`  Total: ${costEstimate.totalETH} ETH`);
      
      console.log('');
    } catch (error) {
      throw new Error(`Blob write failed: ${error.message}`);
    }
  }

  async cleanup() {
    console.log('🧹 Cleaning up...');
    
    if (this.proxyProcess) {
      this.proxyProcess.kill();
      console.log('✓ Proxy server stopped');
    }
    
    // Clean up environment variables
    delete process.env.BLOBKIT_ESCROW_31337;
    delete process.env.PRIVATE_KEY;
    delete process.env.RPC_URL;
    delete process.env.ESCROW_OWNER;
    delete process.env.PORT;
    delete process.env.CHAIN_ID;
    delete process.env.ESCROW_CONTRACT;
    delete process.env.LOG_LEVEL;
    
    console.log('');
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⚠️  Received SIGINT, cleaning up...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⚠️  Received SIGTERM, cleaning up...');
  process.exit(0);
});

// Run the demo
const demo = new IntegrationDemo();
demo.run().catch(console.error); 
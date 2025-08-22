#!/usr/bin/env ts-node

/**
 * Mainnet Deployment Script for BlobKit Escrow Contract
 *
 * REQUIREMENTS BEFORE RUNNING:
 * 1. Set DEPLOYER_PRIVATE_KEY in .env (wallet with ETH for gas)
 * 2. Ensure wallet has at least 0.1 ETH for deployment
 * 3. Review contract parameters below
 * 4. Run with: npx ts-node scripts/deploy-mainnet.ts
 *
 * ESTIMATED COSTS:
 * - Contract deployment: ~0.02-0.05 ETH
 * - Proxy authorization: ~0.002 ETH per proxy
 */

import { ethers } from 'ethers';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Configuration
const MAINNET_RPC = process.env.MAINNET_RPC_URL || '';
const CONTRACT_PATH = '../packages/contracts/out/BlobKitEscrow.sol/BlobKitEscrow.json';

// Deployment parameters
const DEPLOYMENT_CONFIG = {
  jobTimeout: 300, // 5 minutes in seconds
  proxies: [
    // Add authorized proxy addresses here
    // '0x...', // proxy-mainnet.blobkit.org
  ],
  proxyFeePercent: 2 // 2% fee for proxies
};

// Safety checks
const SAFETY_CHECKS = {
  minBalance: ethers.parseEther('0.1'), // Minimum 0.1 ETH required
  maxGasPrice: ethers.parseUnits('100', 'gwei'), // Max 100 gwei gas price
  confirmations: 2 // Wait for 2 confirmations
};

async function main() {
  console.log('================================================================================');
  console.log('BLOBKIT ESCROW CONTRACT MAINNET DEPLOYMENT');
  console.log('================================================================================');
  console.log(`Network: Ethereum Mainnet`);
  console.log(`RPC: ${MAINNET_RPC ? '[from env]' : '[not set]'}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('================================================================================\n');

  // Check for RPC URL
  if (!MAINNET_RPC) {
    console.error('❌ MAINNET_RPC_URL not set in .env file');
    console.error('   Please add: MAINNET_RPC_URL=https://rpc.flashbots.net (or your provider URL)');
    process.exit(1);
  }

  // Check for private key
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ DEPLOYER_PRIVATE_KEY not set in .env file');
    console.error('   Please add: DEPLOYER_PRIVATE_KEY=0x...');
    process.exit(1);
  }

  // Connect to mainnet
  console.log('Connecting to mainnet...');
  const provider = new ethers.JsonRpcProvider(MAINNET_RPC);
  const network = await provider.getNetwork();

  if (network.chainId !== 1n) {
    console.error('❌ Not connected to mainnet!');
    process.exit(1);
  }

  // Create wallet
  const wallet = new ethers.Wallet(privateKey, provider);
  const address = await wallet.getAddress();
  console.log(`✅ Connected as: ${address}`);

  // Check balance
  const balance = await provider.getBalance(address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

  if (balance < SAFETY_CHECKS.minBalance) {
    console.error(
      `❌ Insufficient balance. Need at least ${ethers.formatEther(SAFETY_CHECKS.minBalance)} ETH`
    );
    process.exit(1);
  }

  // Check gas price
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice || 0n;
  console.log(`⛽ Current gas price: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);

  if (gasPrice > SAFETY_CHECKS.maxGasPrice) {
    console.error(
      `❌ Gas price too high! Current: ${ethers.formatUnits(gasPrice, 'gwei')} gwei, Max: ${ethers.formatUnits(SAFETY_CHECKS.maxGasPrice, 'gwei')} gwei`
    );
    console.error('   Wait for lower gas prices or adjust SAFETY_CHECKS.maxGasPrice');
    process.exit(1);
  }

  // Load contract artifacts
  console.log('\nLoading contract artifacts...');
  const contractPath = path.join(__dirname, CONTRACT_PATH);
  const contractJson = JSON.parse(await fs.readFile(contractPath, 'utf-8'));

  // Forge uses bytecode.object
  const abi = contractJson.abi;
  const bytecode = contractJson.bytecode?.object || contractJson.bytecode;

  if (!bytecode || bytecode === '0x' || bytecode === '0x0') {
    console.error('❌ Contract not compiled. Run: cd packages/contracts && forge build');
    process.exit(1);
  }

  // Estimate deployment cost
  console.log('\nEstimating deployment cost...');
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const deploymentTx = await factory.getDeployTransaction(address); // Pass owner address
  const estimatedGas = await provider.estimateGas({
    ...deploymentTx,
    from: address
  });

  const estimatedCost = estimatedGas * gasPrice;
  console.log(`   Estimated gas: ${estimatedGas.toString()}`);
  console.log(`   Estimated cost: ${ethers.formatEther(estimatedCost)} ETH`);

  // Confirm deployment
  console.log('\n⚠️  DEPLOYMENT CONFIRMATION');
  console.log('================================================================================');
  console.log(`   Network: ETHEREUM MAINNET (CHAIN ID: 1)`);
  console.log(`   Deployer: ${address}`);
  console.log(`   Estimated cost: ${ethers.formatEther(estimatedCost)} ETH`);
  console.log(`   Job timeout: ${DEPLOYMENT_CONFIG.jobTimeout} seconds`);
  console.log(`   Authorized proxies: ${DEPLOYMENT_CONFIG.proxies.length}`);
  console.log('================================================================================');
  console.log('\n⚠️  This will deploy a REAL contract to MAINNET and cost REAL ETH!');
  console.log('   Type "DEPLOY TO MAINNET" to confirm, or Ctrl+C to cancel:');

  // Wait for user confirmation
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const confirmation = await new Promise<string>(resolve => {
    rl.question('> ', answer => {
      rl.close();
      resolve(answer);
    });
  });

  if (confirmation !== 'DEPLOY TO MAINNET') {
    console.log('❌ Deployment cancelled');
    process.exit(0);
  }

  // Deploy contract
  console.log('\nDeploying contract...');
  const contract = await factory.deploy(
    address, // Owner address (deployer)
    {
      gasPrice: gasPrice,
      gasLimit: (estimatedGas * 110n) / 100n // 10% buffer
    }
  );

  console.log(`Transaction hash: ${contract.deploymentTransaction()?.hash}`);
  console.log('⏳ Waiting for confirmations...');

  // Wait for deployment
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  const receipt = await contract.deploymentTransaction()?.wait(SAFETY_CHECKS.confirmations);

  console.log(`✅ Contract deployed at: ${contractAddress}`);
  console.log(`   Block number: ${receipt?.blockNumber}`);
  console.log(`   Gas used: ${receipt?.gasUsed?.toString()}`);
  console.log(`   Actual cost: ${ethers.formatEther((receipt?.gasUsed || 0n) * gasPrice)} ETH`);

  // Initialize contract
  console.log('\nInitializing contract...');

  // Re-attach a typed instance for post-deploy calls
  type EscrowContract = {
    setJobTimeout(timeout: number): Promise<ethers.ContractTransactionResponse>;
    authorizeProxy(addr: string, feePercent: number): Promise<ethers.ContractTransactionResponse>;
  };
  const escrow = new ethers.Contract(contractAddress, abi, wallet) as unknown as EscrowContract;

  // Set job timeout
  if (DEPLOYMENT_CONFIG.jobTimeout !== 300) {
    console.log(`   Setting job timeout to ${DEPLOYMENT_CONFIG.jobTimeout} seconds...`);
    const tx = await escrow.setJobTimeout(DEPLOYMENT_CONFIG.jobTimeout);
    await tx.wait();
    console.log('   ✅ Job timeout set');
  }

  // Authorize proxies
  for (const proxyAddress of DEPLOYMENT_CONFIG.proxies) {
    console.log(`   Authorizing proxy ${proxyAddress}...`);
    const tx = await escrow.authorizeProxy(proxyAddress, DEPLOYMENT_CONFIG.proxyFeePercent);
    await tx.wait();
    console.log(`   ✅ Proxy authorized with ${DEPLOYMENT_CONFIG.proxyFeePercent}% fee`);
  }

  // Save deployment info
  const deploymentInfo = {
    network: 'mainnet',
    chainId: 1,
    address: contractAddress,
    deployer: address,
    blockNumber: receipt?.blockNumber,
    transactionHash: receipt?.hash,
    timestamp: new Date().toISOString(),
    config: DEPLOYMENT_CONFIG,
    gasUsed: receipt?.gasUsed?.toString(),
    deploymentCost: ethers.formatEther((receipt?.gasUsed || 0n) * gasPrice) + ' ETH'
  };

  const deploymentPath = path.join(__dirname, '../deployments/mainnet.json');
  await fs.mkdir(path.dirname(deploymentPath), { recursive: true });
  await fs.writeFile(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

  // Update environment variables
  console.log('\nUpdate your environment variables:');
  console.log('================================================================================');
  console.log(`BLOBKIT_ESCROW_1=${contractAddress}`);
  console.log('================================================================================');

  // Verify on Etherscan
  console.log('\nNext steps:');
  console.log('1. Verify contract on Etherscan:');
  console.log(`   npx hardhat verify --network mainnet ${contractAddress}`);
  console.log('2. Update SDK configuration with the escrow address');
  console.log('3. Deploy and configure proxy servers');
  console.log('4. Test with small transactions before production use');

  console.log('\n✅ Deployment complete!');
  console.log(`   Contract address: ${contractAddress}`);
  console.log(`   View on Etherscan: https://etherscan.io/address/${contractAddress}`);
}

// Error handler
main().catch(error => {
  console.error('\n❌ Deployment failed:', error);
  process.exit(1);
});

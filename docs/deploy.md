# BlobKit Contract Deployment Guide

## Overview

This guide explains how to deploy the BlobKitEscrow contract to various Ethereum networks.

## Prerequisites

- Node.js v20+
- Hardhat or Foundry
- Funded wallet with ETH for gas
- Access to RPC endpoints

## Deployed Contracts

### Mainnet (Chain ID: 1)

- **Status**: Not deployed yet
- **Address**: TBD
- **Environment Variable**: `BLOBKIT_ESCROW_1`

### Sepolia (Chain ID: 11155111)

- **Status**: Deployed ✅
- **Address**: `0x742d35Cc6634C0532925a3b844Bc9e7595f2bD77`
- **Environment Variable**: `BLOBKIT_ESCROW_11155111`
- **Etherscan**: https://sepolia.etherscan.io/address/0x742d35Cc6634C0532925a3b844Bc9e7595f2bD77

### Holesky (Chain ID: 17000)

- **Status**: Not deployed yet
- **Address**: TBD
- **Environment Variable**: `BLOBKIT_ESCROW_17000`

## Deployment Steps

### 1. Using Hardhat

```bash
# Install dependencies
cd packages/contracts
npm install

# Set environment variables
export PRIVATE_KEY="your-deployment-private-key"
export SEPOLIA_RPC_URL="https://sepolia.infura.io/v3/YOUR-PROJECT-ID"

# Deploy to Sepolia
npx hardhat run scripts/deploy.js --network sepolia
```

### 2. Using Foundry

```bash
# Deploy to Sepolia
forge create --rpc-url $SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  --constructor-args "0xYourOwnerAddress" \
  --verify \
  src/BlobKitEscrow.sol:BlobKitEscrow
```

### 3. Post-Deployment Setup

After deploying the contract:

1. **Authorize Proxy Servers**

   ```javascript
   // Connect to deployed contract
   const escrow = await ethers.getContractAt('BlobKitEscrow', ESCROW_ADDRESS);

   // Authorize your proxy server
   await escrow.setProxyAuthorization(PROXY_ADDRESS, true);

   // Set proxy fee (e.g., 2%)
   await escrow.connect(proxySigner).setProxyFee(2);
   ```

2. **Configure Job Timeout** (optional)
   ```javascript
   // Set timeout to 10 minutes (default is 5)
   await escrow.setJobTimeout(600);
   ```

## Configuration

### SDK Configuration

```javascript
// Using environment variable
const blobkit = new BlobKit({
  rpcUrl: 'https://sepolia.infura.io/v3/YOUR-PROJECT-ID',
  chainId: 11155111,
  escrowContract: process.env.BLOBKIT_ESCROW_11155111
});

// Or hardcode for Sepolia
const blobkit = new BlobKit({
  rpcUrl: 'https://sepolia.infura.io/v3/YOUR-PROJECT-ID',
  chainId: 11155111,
  escrowContract: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD77'
});
```

### Proxy Server Configuration

```bash
# .env file
ESCROW_CONTRACT=0x742d35Cc6634C0532925a3b844Bc9e7595f2bD77
CHAIN_ID=11155111
RPC_URL=https://sepolia.infura.io/v3/YOUR-PROJECT-ID
REDIS_URL=redis://localhost:6379  # Required for job persistence
PRIVATE_KEY=your-proxy-private-key
```

#### Redis Requirement

The proxy server requires Redis for persistent job queue management:

```bash
# Quick Redis setup with Docker
docker run -d -p 6379:6379 redis:7-alpine

# Production Redis with persistence
docker run -d \
  -p 6379:6379 \
  -v redis-data:/data \
  --name blobkit-redis \
  redis:7-alpine redis-server --appendonly yes
```

## Verification

After deployment, verify the contract works:

1. **Check Authorization**

   ```javascript
   const isAuthorized = await escrow.authorizedProxies(PROXY_ADDRESS);
   console.log('Proxy authorized:', isAuthorized);
   ```

2. **Test Job Creation**

   ```javascript
   const jobId = ethers.keccak256(ethers.toUtf8Bytes('test-job-1'));
   await escrow.depositForBlob(jobId, { value: ethers.parseEther('0.01') });
   ```

3. **Verify Job Details**
   ```javascript
   const job = await escrow.getJob(jobId);
   console.log('Job created:', job);
   ```

## Security Considerations

1. **Owner Key Security**: The deployment key becomes the contract owner. Store it securely.
2. **Proxy Authorization**: Only authorize trusted proxy servers.
3. **Fee Configuration**: Set reasonable proxy fees (typically 0-5%).
4. **Emergency Pause**: The owner can pause the contract in emergencies.

## Troubleshooting

### Contract Not Found

- Verify the address is correct for your chain
- Ensure your RPC URL matches the chain ID
- Check if the contract is verified on Etherscan

### Authorization Failed

- Ensure the proxy address is authorized: `authorizedProxies(address)`
- Check that you're calling from the correct signer
- Verify the proxy has set its fee percentage

### Job Creation Failed

- Ensure sufficient ETH is sent with the transaction
- Check that the job ID is unique (not already used)
- Verify the contract is not paused

## Additional Resources

- [BlobKit Documentation](../README.md)
- [Ethereum Sepolia Faucet](https://sepoliafaucet.com/)
- [Etherscan Sepolia](https://sepolia.etherscan.io/)

```
░▒▓███████▓▒░░▒▓█▓▒░      ░▒▓██████▓▒░░▒▓███████▓▒░░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░▒▓████████▓▒░ 
░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░     ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░  ░▒▓█▓▒░     
░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░     ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░  ░▒▓█▓▒░     
░▒▓███████▓▒░░▒▓█▓▒░     ░▒▓█▓▒░░▒▓█▓▒░▒▓███████▓▒░░▒▓███████▓▒░░▒▓█▓▒░  ░▒▓█▓▒░     
░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░     ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░  ░▒▓█▓▒░     
░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░     ░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░  ░▒▓█▓▒░     
░▒▓███████▓▒░░▒▓████████▓▒░▒▓██████▓▒░░▒▓███████▓▒░░▒▓█▓▒░░▒▓█▓▒░▒▓█▓▒░  ░▒▓█▓▒░     
```


# BlobKit

**EIP-4844 blob storage for Ethereum**

[![Mainnet Status](https://img.shields.io/badge/Mainnet-Live-success)](https://etherscan.io/address/0x2e8e414bc5c6B0b8339853CEDf965B4A28FB4838)
[![Contract](https://img.shields.io/badge/Escrow-0x2e8e414bc5c6B0b8339853CEDf965B4A28FB4838-blue)](https://etherscan.io/address/0x2e8e414bc5c6B0b8339853CEDf965B4A28FB4838)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

## Overview

BlobKit enables applications to store data on Ethereum using blob transactions (EIP-4844). 

### Key Features

- **TypeScript SDK** with browser and Node.js support
- **Trust-minimized proxy** server for wallets without EIP-4844 support
- **Smart contract escrow** system for payment and job management
- **KZG cryptography** implementation for blob commitments
- **Cost-efficient:** ~$0.01 per blob vs ~$50 for calldata

## Architecture


**SDK** (`@blobkit/sdk`)

- Handles blob encoding and KZG commitments
- Manages payments through escrow contract
- Supports both direct submission and proxy routing

**Proxy Server** (`@blobkit/proxy-server`)

- Executes blob transactions on behalf of users
- Verifies payments before processing
- Implements circuit breakers and rate limiting

**Escrow Contract** (`@blobkit/contracts`)

- Holds user payments until job completion
- Enforces timeouts with automatic refunds
- Prevents replay attacks via signature verification

### Flow

1. User deposits ETH into escrow contract with unique job ID
2. User submits blob data and payment proof to proxy
3. Proxy verifies payment and submits blob transaction
4. Proxy claims payment from escrow upon completion
5. If proxy fails, user can refund after timeout

## Installation

```bash
npm install @blobkit/sdk
```

### Prerequisites

- Node.js 18+ or modern browser
- Ethereum wallet or signer
- RPC endpoint (see [Infrastructure Requirements](#infrastructure-requirements))

## Quick Start

### Direct Submission (Node.js)

```typescript
import { BlobKit } from '@blobkit/sdk';
import { Wallet } from 'ethers';

const signer = new Wallet(process.env.PRIVATE_KEY);
const blobkit = await BlobKit.init(
  {
     rpcUrl: process.env.BLOBKIT_RPC_URL!, // Recommended: blob-compatible RPC
    chainId: 1
    // Escrow contract auto-configured for mainnet
  },
  signer
);

const data = Buffer.from('Hello, blobs!');
const result = await blobkit.writeBlob(data);
console.log(`Blob tx: ${result.blobTxHash}`);
```

### Proxy Submission (Browser)

```typescript
import { BlobKit } from '@blobkit/sdk/browser';

const blobkit = await BlobKit.init(
  {
     rpcUrl: process.env.BLOBKIT_RPC_URL!, // Recommended: blob-compatible RPC
    chainId: 1,
    proxyUrl: 'https://proxy.blobkit.org' // Your proxy server URL
  },
  window.ethereum
);

const data = new TextEncoder().encode('Hello from browser!');
const result = await blobkit.writeBlob(data);
```

### Reading Blobs

```typescript
// Read blob data by transaction hash
const blobData = await blobkit.readBlob(txHash);
console.log('Raw data:', blobData.data);

// Read and decode as text
const text = await blobkit.readBlobAsString(txHash);
console.log('Text:', text);

// Read and decode as JSON
const json = await blobkit.readBlobAsJSON(txHash);
console.log('JSON:', json);
```

## Infrastructure Requirements

### Blob Transaction Support

⚠️ **Important:** Standard RPC endpoints (Alchemy, Infura) do not support blob transactions. You need a blob-compatible RPC:

#### Recommended Options

1. **Flashbots RPC (FREE, Recommended)**

   ```typescript
   rpcUrl: 'https://rpc.flashbots.net';
   ```

   - Free to use
   - Supports blob transactions
   - No registration required

2. **Run Your Own Node**

   ```bash
   # Requires both execution and consensus clients
   geth + lighthouse/prysm/teku
   ```

3. **Use Specialized Services**
   - bloXroute Gateway
   - MEV relays with blob support
   - Dedicated node providers

### Why Special Infrastructure?

Blob transactions (EIP-4844) require coordination between:

- **Execution Layer:** Transaction processing
- **Consensus Layer:** Blob data storage

Standard RPCs only handle execution layer, while blobs need both layers.

## Configuration

### SDK Options

```typescript
interface BlobKitConfig {
  rpcUrl: string; // Use blob-compatible RPC (e.g., Flashbots)
  chainId?: number; // Network chain ID (default: 1 for mainnet)
  archiveUrl?: string; // Blob archive endpoint for reading
  proxyUrl?: string; // Proxy server URL (auto-discovered)
  escrowContract?: string; // Auto-configured for mainnet/testnets
  requestSigningSecret?: string; // HMAC secret for proxy auth
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'silent';
}
```

### Environment Variables

```bash
# Required for Proxy Server
RPC_URL=https://rpc.flashbots.net  # Use blob-compatible RPC
ESCROW_CONTRACT=0x2e8e414bc5c6B0b8339853CEDf965B4A28FB4838  # Mainnet escrow
KZG_TRUSTED_SETUP_PATH=./trusted_setup.txt

# Optional Configuration
CHAIN_ID=1
PORT=3000
PROXY_FEE_PERCENT=1
MAX_BLOB_SIZE=131072
REDIS_URL=redis://localhost:6379
JOB_TIMEOUT_SECONDS=300

# Production Key Management (choose one)
PRIVATE_KEY=0x...                                    # Dev only
AWS_KMS_KEY_ID=arn:aws:kms:region:account:key/id   # Production
```

## Security

### Payment Protection

- Funds held in escrow until job completion
- Automatic refunds after timeout period
- Signature verification prevents unauthorized claims

### Proxy Security

- HMAC-SHA256 request signing (required)
- Rate limiting per IP address
- Input validation for all blob parameters
- AWS KMS and GCP KMS key management support
- Circuit breakers for Redis/RPC failures

### Best Practices

- Always verify proxy authorization before use
- Monitor gas prices for cost optimization
- Implement retry logic for network failures
- Use environment variables for sensitive configuration

## Development

### Prerequisites

- Node.js 18+
- Foundry (for contracts)
- Redis (for proxy server)

### Quick Start

```bash
# One-click development setup
./dev.sh

# Manual setup
git clone https://github.com/blobkit/blobkit.git
cd blobkit
npm install
npm run build

# Deploy contracts locally
cd packages/contracts
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast

# Start proxy server
npm run dev --workspace=packages/proxy-server
```

### Testing

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Gas benchmarks
cd packages/contracts && forge test --gas-report
```

## Deployment

### Mainnet Deployment Status

| Network     | Contract Address                                                                                                                 | Status |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **Mainnet** | [`0x2e8e414bc5c6B0b8339853CEDf965B4A28FB4838`](https://etherscan.io/address/0x2e8e414bc5c6B0b8339853CEDf965B4A28FB4838)          | Live   |
| **Sepolia** | [`0x1B345402377A44F674376d6e0f6212e3B9991798`](https://sepolia.etherscan.io/address/0x1B345402377A44F674376d6e0f6212e3B9991798)  | Live   |

### Deploy Your Own Contracts

```bash
cd packages/contracts
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
```

### Proxy Server

```bash
docker build -t blobkit-proxy .
docker run -p 3000:3000 --env-file .env blobkit-proxy
```

## Documentation

### Core Documentation

- [SDK API Reference](packages/sdk/README.md)
- [Proxy Server API](packages/proxy-server/README.md)
- [Smart Contracts](packages/contracts/README.md)

### Infrastructure Guides

- [Blob Infrastructure Requirements](blob-infrastructure-requirements.md)
- [Mainnet Deployment Guide](MAINNET_DEPLOYMENT_GUIDE.md)
- [Production Audit Report](PRODUCTION_AUDIT_REPORT.md)

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

MIT - see [LICENSE](LICENSE) for details.

## Author

Built by [Zak Cole](https://x.com/0xzak) at [Number Group](https://numbergroup.xyz) for the [Ethereum Community Foundation](https://ethcf.org).

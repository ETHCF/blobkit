# @blobkit/sdk

TypeScript SDK for EIP-4844 blob storage with automatic environment detection and MetaMask integration.

## Installation

```bash
npm install @blobkit/sdk ethers
```

## Usage

### Browser with MetaMask

```typescript
import { BlobKit } from '@blobkit/sdk';

// Connect MetaMask
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

// Create BlobKit instance
const blobkit = new BlobKit({
  rpcUrl: 'https://mainnet.infura.io/v3/YOUR_PROJECT_ID',
  chainId: 1,
  proxyUrl: 'https://proxy.blobkit.dev' // Required for browser environments
}, signer);

// Store blob data
const result = await blobkit.writeBlob({
  message: 'Hello, decentralized storage!'
}, {
  appId: 'my-dapp',
  filename: 'greeting.json'
});

console.log('Blob hash:', result.blobHash);
console.log('Transaction:', result.blobTxHash);
```

### Node.js

```typescript
import { BlobKit, createFromEnv } from '@blobkit/sdk';
import { ethers } from 'ethers';

// Option 1: Environment variables
const blobkit = createFromEnv(signer);

// Option 2: Manual configuration
const provider = new ethers.JsonRpcProvider('https://mainnet.infura.io/v3/YOUR_PROJECT_ID');
const signer = new ethers.Wallet('YOUR_PRIVATE_KEY', provider);

const blobkit = new BlobKit({
  rpcUrl: 'https://mainnet.infura.io/v3/YOUR_PROJECT_ID',
  chainId: 1
}, signer);

const result = await blobkit.writeBlob(data);
```

## Configuration

### BlobKitConfig Interface

```typescript
interface BlobKitConfig {
  rpcUrl: string;                          // Ethereum RPC endpoint
  chainId?: number;                        // Default: 1
  proxyUrl?: string;                       // Auto-discovered for browsers
  escrowContract?: string;                 // Auto-discovered from env
  defaultCodec?: string;                   // Default: 'application/json'
  maxProxyFeePercent?: number;             // Default: 5
  callbackUrl?: string;                    // Optional webhook
  logLevel?: 'debug' | 'info' | 'silent'; // Default: 'info'
}
```

### Environment Variables

```bash
BLOBKIT_RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
BLOBKIT_CHAIN_ID=1
BLOBKIT_PROXY_URL=https://custom-proxy.example.com
BLOBKIT_ESCROW_1=0x1234567890123456789012345678901234567890
BLOBKIT_LOG_LEVEL=info
```

## Testing and Development

```bash
npm test                    # Run tests
npm run test:coverage       # Run tests with coverage
npm run build               # Build distribution
npm run lint                # Lint code
npm run type-check          # TypeScript checking
```

## Documentation

See [/docs/sdk/](../../docs/sdk/) for complete API reference and examples.

## Attribution

Built by [Zak Cole](https://x.com/0xzak) at [Number Group](https://numbergroup.xyz) for the [Ethereum Community Foundation](https://ethcf.org). 
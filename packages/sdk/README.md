# @blobkit/sdk

TypeScript SDK for EIP-4844 blob storage on Ethereum. Supports browser and Node.js environments.

## Installation

```bash
npm install @blobkit/sdk ethers
```

## Usage

### Browser

```typescript
import { BlobKit } from '@blobkit/sdk';
import { ethers } from 'ethers';

const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

const blobkit = new BlobKit(
  {
    rpcUrl: process.env.BLOBKIT_RPC_URL!,
    chainId: 1,
    proxyUrl: 'https://proxy.example.com',
    requestSigningSecret: 'shared-secret-with-proxy'
  },
  signer
);

const result = await blobkit.writeBlob({ message: 'Hello world' }, { appId: 'my-app' });

console.log('Blob hash:', result.blobHash);
console.log('Transaction:', result.blobTxHash);
```

### Node.js

```typescript
import { BlobKit, createFromEnv } from '@blobkit/sdk';
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider(process.env.BLOBKIT_RPC_URL);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

// Option 1: From environment variables
const blobkit = createFromEnv(signer);

// Option 2: Manual configuration
const blobkit = new BlobKit(
  {
    rpcUrl: process.env.BLOBKIT_RPC_URL!,
    chainId: 1
  },
  signer
);

const result = await blobkit.writeBlob(data);
console.log('Blob hash:', result.blobHash);
```

## Reading Blobs

BlobKit supports reading blob data from transactions:

```typescript
// Read blob data by transaction hash
const blobData = await blobkit.readBlob(txHash);
console.log('Blob data:', blobData.data);
console.log('Source:', blobData.source); // 'rpc', 'archive', or 'fallback'

// Read specific blob by index (for transactions with multiple blobs)
const secondBlob = await blobkit.readBlob(txHash, 1);

// Read and decode as string
const text = await blobkit.readBlobAsString(txHash);
console.log('Text content:', text);

// Read and decode as JSON
const json = await blobkit.readBlobAsJSON(txHash);
console.log('JSON data:', json);
```

### Archive Support

If you configure an `archiveUrl`, BlobKit will attempt to read blobs from your archive first:

```typescript
const blobkit = new BlobKit(
  {
    rpcUrl: 'https://mainnet.infura.io/v3/YOUR_PROJECT_ID',
    archiveUrl: 'https://your-blob-archive.com',
    chainId: 1
  },
  signer
);
```

The archive URL should serve blob data at `${archiveUrl}/${blobTxHash}` as binary data.

## Configuration

### Environment Variables

```bash
BLOBKIT_RPC_URL=https://rpc.flashbots.net
BLOBKIT_CHAIN_ID=1
BLOBKIT_PROXY_URL=https://custom-proxy.example.com
BLOBKIT_ESCROW_1=0x1234567890123456789012345678901234567890
BLOBKIT_LOG_LEVEL=info
```

## Testing and Development

```bash
npm test               # Run tests
npm run test:coverage  # Run tests with coverage
npm run build          # Build distribution
npm run lint           # Lint code
npm run type-check     # TypeScript checking
```

## KZG Trusted Setup

BlobKit requires a KZG trusted setup for creating blob commitments and proofs. This is handled automatically in most cases:

### Browser Environment

In browsers, the SDK uses a lightweight WASM implementation that includes the necessary trusted setup data.

### Node.js Environment

In Node.js, the SDK can use either:

1. **Built-in Setup** (default): The SDK includes the official Ethereum mainnet trusted setup
2. **Custom Setup**: Provide your own trusted setup file path

```typescript
// Using built-in setup (recommended)
const blobkit = new BlobKit(
  {
    rpcUrl: process.env.BLOBKIT_RPC_URL!,
    chainId: 1
  },
  signer
);

// Using custom trusted setup
const blobkit = new BlobKit(
  {
    rpcUrl: process.env.BLOBKIT_RPC_URL!,
    chainId: 1,
    kzgSetup: {
      trustedSetupPath: '/path/to/trusted_setup.txt'
    }
  },
  signer
);
```

### Trusted Setup File Format

The trusted setup file should contain the powers of tau ceremony results in the standard format used by Ethereum. You can download the official setup from the [Ethereum KZG Ceremony](https://ceremony.ethereum.org/).

## Documentation

See [/docs/sdk/](../../docs/sdk/) for complete API reference.

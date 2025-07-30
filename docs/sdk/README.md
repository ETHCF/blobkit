# BlobKit SDK Documentation

Complete API reference for the BlobKit TypeScript SDK.

## Installation

```bash
npm install @blobkit/sdk ethers
```

## Quick Start

### Browser

```typescript
import { BlobKit } from '@blobkit/sdk';

// Connect MetaMask
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

const blobkit = new BlobKit({
  rpcUrl: 'https://mainnet.infura.io/v3/YOUR_PROJECT_ID',
  chainId: 1,
  proxyUrl: 'https://proxy.blobkit.dev'
}, signer);
```

### Node.js

```typescript
import { BlobKit, createFromEnv } from '@blobkit/sdk';
import { ethers } from 'ethers';

// Option 1: Environment variables
const provider = new ethers.JsonRpcProvider(process.env.BLOBKIT_RPC_URL);
const signer = new ethers.Wallet('YOUR_PRIVATE_KEY', provider);
const blobkit = createFromEnv(signer);

// Option 2: Manual configuration
const provider = new ethers.JsonRpcProvider('https://mainnet.infura.io/v3/YOUR_PROJECT_ID');
const signer = new ethers.Wallet('YOUR_PRIVATE_KEY', provider);

const blobkit = new BlobKit({
  rpcUrl: 'https://mainnet.infura.io/v3/YOUR_PROJECT_ID',
  chainId: 1
}, signer);
```

## API Reference

### BlobKit Class

#### Constructor

```typescript
new BlobKit(config: BlobKitConfig, signer?: Signer)
```

**Parameters:**
- `config`: Configuration object
- `signer`: Ethereum signer (required for browser environments)

#### Methods

##### writeBlob()

Stores data as a blob with payment handling.

```typescript
async writeBlob(payload: unknown, meta?: Partial<BlobMeta>): Promise<BlobPaymentResult>
```

**Parameters:**
- `payload`: Data to store as blob
- `meta`: Optional metadata (appId, filename, tags, etc.)

**Returns:** Promise resolving to blob storage result

**Example:**
```typescript
const result = await blobkit.writeBlob({
  message: 'Hello, blob storage!'
}, {
  appId: 'my-app',
  filename: 'greeting.json'
});

console.log('Blob hash:', result.blobHash);
console.log('Transaction:', result.blobTxHash);
```

##### estimateCost()

Estimates storage costs before payment.

```typescript
async estimateCost(payload: unknown): Promise<CostEstimate>
```

**Returns:** Cost breakdown with blob fee, gas fee, proxy fee, and total

**Example:**
```typescript
const estimate = await blobkit.estimateCost(data);
console.log(`Total cost: ${estimate.totalETH} ETH`);
```

##### generateJobId()

Generates deterministic job ID for tracking.

```typescript
generateJobId(userAddress: string, payloadHash: string, nonce: number): string
```

##### refundIfExpired()

Refunds expired jobs automatically.

```typescript
async refundIfExpired(jobId: string): Promise<string>
```

**Returns:** Transaction hash of refund

### Configuration

#### BlobKitConfig Interface

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

#### Environment Variables

```bash
BLOBKIT_RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
BLOBKIT_CHAIN_ID=1
BLOBKIT_PROXY_URL=https://custom-proxy.example.com
BLOBKIT_ESCROW_1=0x1234567890123456789012345678901234567890
BLOBKIT_LOG_LEVEL=info
```

### Error Handling

```typescript
import { BlobKitError, BlobKitErrorCode } from '@blobkit/sdk';

try {
  await blobkit.writeBlob(data);
} catch (error) {
  if (error instanceof BlobKitError) {
    switch (error.code) {
      case BlobKitErrorCode.PROXY_NOT_FOUND:
        console.error('No proxy service available');
        break;
      case BlobKitErrorCode.BLOB_TOO_LARGE:
        console.error('Data exceeds 128KB limit');
        break;
      case BlobKitErrorCode.INSUFFICIENT_FUNDS:
        console.error('Insufficient ETH for transaction');
        break;
    }
  }
}
```

### Codec System

Available codecs for data encoding:

```typescript
import { defaultCodecRegistry, JsonCodec, RawCodec, TextCodec } from '@blobkit/sdk';

// Available codecs:
// - JsonCodec: 'application/json' (default)
// - RawCodec: 'application/octet-stream'  
// - TextCodec: 'text/plain'
```

### Environment Detection

```typescript
import { detectEnvironment, getEnvironmentCapabilities } from '@blobkit/sdk';

const env = detectEnvironment(); // 'browser' | 'node' | 'serverless'
const capabilities = getEnvironmentCapabilities(env);

if (capabilities.requiresProxy) {
  console.log('Using Web3 payment flow');
} else {
  console.log('Using direct transactions');
}
```

### KZG Operations

```typescript
import { 
  initializeKzg, 
  encodeBlob, 
  blobToKzgCommitment, 
  computeKzgProof 
} from '@blobkit/sdk';

// Initialize KZG (required before operations)
await initializeKzg();

// Encode data to blob format
const blob = encodeBlob(data);

 // Generate KZG commitment and proof
 const commitment = blobToKzgCommitment(blob);
 const proof = computeKzgProof(blob, commitment);
 ```

## Attribution

BlobKit was built by [Zak Cole](https://x.com/0xzak) at [Number Group](https://numbergroup.xyz) for the [Ethereum Community Foundation](https://ethcf.org). 
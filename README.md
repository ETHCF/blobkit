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

[![NPM Version](https://img.shields.io/npm/v/blobkit.svg)](https://www.npmjs.com/package/blobkit)
[![NPM Downloads](https://img.shields.io/npm/dm/blobkit.svg)](https://www.npmjs.com/package/blobkit)
[![License](https://img.shields.io/npm/l/blobkit.svg)](https://github.com/ETHCF/blobkit/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![Build Status](https://img.shields.io/github/actions/workflow/status/ETHCF/blobkit/ci.yml?branch=main)](https://github.com/ETHCF/blobkit/actions)

Enterprise-grade TypeScript SDK for Ethereum blob transactions (EIP-4844).

BlobKit provides a complete solution for using Ethereum's blob space as an ephemeral, verifiable data layer. Perfect for temporary data storage with cryptographic guarantees including ephemeral messaging, gaming state, proof-of-existence, or any data that benefits from Ethereum's security without permanent on-chain storage costs.

## About

Built by [**Zak Cole**](https://x.com/0xzak) ([@zscole](https://github.com/zscole)) at [**Number Group**](https://numbergroup.xyz) for the [**Ethereum Community Foundation**](https://ethcf.org).

**Package**: [blobkit on NPM](https://www.npmjs.com/package/blobkit)

**Contact**: For questions, support, or contributions, reach out to Zak at [zcole@linux.com](mailto:zcole@linux.com) or [@0xzak](https://x.com/0xzak) on X.

## Features

- **Production Ready**: Comprehensive input validation and error handling
- **Type Safe**: Full TypeScript support with runtime type guards
- **Secure**: Built-in validation for private keys, hashes, and configurations
- **Optimized**: High-performance blob encoding with memory-efficient operations
- **Developer Friendly**: Environment variable support with clear error messages
- **Extensible**: Pluggable codec system for custom data formats
- **Well Documented**: Complete JSDoc documentation for all APIs

## Installation

```bash
npm install blobkit
```

## Quick Start

Create a `.env` file in your project root:

```bash
# Required
RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
PRIVATE_KEY=0x1234567890abcdef...

# Optional
CHAIN_ID=1
ARCHIVE_URL=https://your-blob-archive.com
DEFAULT_CODEC=application/json
COMPRESSION_LEVEL=3
```

**Security Note**: Never commit your `.env` file or private keys to version control. Add `.env` to your `.gitignore`.

```typescript
import { createFromEnv, initializeForDevelopment } from 'blobkit';
import dotenv from 'dotenv';

dotenv.config();

// Initialize KZG setup (required)
await initializeForDevelopment();

// Create client from environment variables with automatic validation
const blobkit = createFromEnv();

// Write blob with automatic compression and validation
const receipt = await blobkit.writeBlob({
  message: 'Hello blob space',
  timestamp: Date.now()
});

// Read blob with automatic decompression
const data = await blobkit.readBlob(receipt.blobHash);

// Verify blob integrity and authenticity
const isValid = await blobkit.verifyBlob(data, receipt.blobHash);
```

## Configuration

### Environment Variables

BlobKit validates all environment variables and provides clear error messages for invalid configurations:

```bash
# Required
RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY    # Must be valid HTTP/HTTPS URL
PRIVATE_KEY=0x1234567890abcdef...                           # Must be 64-character hex string

# Optional
CHAIN_ID=1                        # Integer between 1 and 2^32-1 (default: 1)
ARCHIVE_URL=https://archive.com   # Valid HTTP/HTTPS URL for historical blob data
DEFAULT_CODEC=application/json    # Default codec for encoding (default: application/json)
COMPRESSION_LEVEL=3               # Brotli compression level 0-11 (default: 3)
```

### KZG Setup

For production environments, use the official Ethereum KZG ceremony parameters:

```typescript
import { initializeForProduction } from 'blobkit';

// Download from: https://github.com/ethereum/kzg-ceremony-sequencer
await initializeForProduction(
  '/path/to/g1.point',
  '/path/to/g2.point',
  'text'
);
```

For development and testing:
```typescript
await initializeForDevelopment(); // Uses mock setup - DO NOT use in production
```

## Cost Disclaimer

**Submitting blobs to Ethereum mainnet is not free.** Each blob-bearing transaction incurs two types of cost:

- **Standard gas fees** for the transaction envelope (e.g. ~21,000 gas)
- **A blob-specific base fee** that fluctuates independently from normal gas, based on network demand

Blob fees operate under a separate EIP-1559-style market. The cost can range from negligible to substantial depending on congestion.

### Blob Cost Formula

```
Total Cost = L1 Gas Cost + (blob_base_fee_per_blob × number_of_blobs)
```

- `blob_base_fee_per_blob` is denominated in wei
- Each blob is 128 kB; transactions can include 1 to 6 blobs
- This fee is dynamic and recalculated every block

### What You're Responsible For

BlobKit does not manage fee estimation or cost controls for you. You are expected to:

- Monitor blob base fees before sending blobs
- Implement safeguards for cost spikes
- Test thoroughly on testnets
- Query `eth_getBlockByNumber` to track blob fee pressure

**Do not rely on static pricing assumptions.**

*Current metrics: [Blobscan](https://blobscan.com/) | [Ultra Sound Money](https://ultrasound.money/)*

## API Reference

### Creating Clients

```typescript
import { BlobKit, createFromEnv, createReadOnlyFromEnv } from 'blobkit';

// From environment variables (recommended)
const blobkit = createFromEnv();

// Read-only client (no private key needed)
const readOnlyClient = createReadOnlyFromEnv();

// Manual configuration with validation
const blobkit = new BlobKit({
  rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY',
  chainId: 1,
  archiveUrl: 'https://your-archive.com',
  defaultCodec: 'application/json',
  compressionLevel: 3
}, 'your-private-key');
```

### Writing Blobs

```typescript
// Simple data
const receipt = await blobkit.writeBlob({ message: 'Hello World' });

// With metadata
const receipt = await blobkit.writeBlob(
  { gameState: { level: 5, score: 1000 } },
  { 
    appId: 'my-game',
    codec: 'application/json',
    ttlBlocks: 100 
  }
);
```

### Reading Blobs

```typescript
// By blob hash or transaction hash
const data = await blobkit.readBlob('0x01...' /* blob hash */);
const data = await blobkit.readBlob('0xab...' /* tx hash */);

// With metadata
const blobData = await blobkit.readBlobWithMeta('0x01...');
console.log(blobData.meta.appId); // Access metadata
```

### Verification

```typescript
// Verify blob integrity
const isValid = await blobkit.verifyBlob(data, blobHash);

// Verify with block inclusion
const isValid = await blobkit.verifyBlob(data, blobHash, blockNumber);

// Verify entire transaction
const result = await blobkit.verifyBlobTransaction(txHash);
console.log(result.valid, result.blobHashes, result.blockNumber);
```

## Error Handling

BlobKit provides comprehensive error handling with structured error codes:

```typescript
import { BlobKitError } from 'blobkit';

try {
  const receipt = await blobkit.writeBlob(data);
} catch (error) {
  if (error instanceof BlobKitError) {
    console.log('Error code:', error.code);
    console.log('Error message:', error.message);
    console.log('Error details:', error.details);
    
    // Handle specific errors
    switch (error.code) {
      case 'INVALID_PRIVATE_KEY':
        console.log('Check your private key format');
        break;
      case 'DATA_TOO_LARGE':
        console.log('Reduce data size or increase compression');
        break;
      case 'NO_WALLET':
        console.log('Private key required for write operations');
        break;
    }
  }
}
```

## Input Validation

BlobKit automatically validates all inputs and provides helpful error messages:

```typescript
import { isValidBlobHash, isValidTxHash, isValidHexString } from 'blobkit';

// Type guards for runtime validation
if (isValidBlobHash(hash)) {
  // Safe to use as blob hash
}

if (isValidTxHash(hash)) {
  // Safe to use as transaction hash
}

if (isValidHexString(value, 64)) {
  // Valid 64-character hex string
}
```

## Custom Codecs

Extend BlobKit with custom data encoding:

```typescript
import { registerCodec } from 'blobkit';

registerCodec('application/protobuf', {
  encode: (data) => new Uint8Array(/* protobuf encoding */),
  decode: (bytes) => /* protobuf decoding */
});
```

## Performance

BlobKit is optimized for high-throughput applications:

- **Memory Efficient**: Uses `subarray()` instead of `slice()` for zero-copy operations
- **Pre-allocated Buffers**: Minimizes garbage collection pressure
- **Optimized Compression**: Tuned Brotli settings for blob data characteristics
- **Efficient Field Element Packing**: Optimized blob encoding/decoding algorithms

## Project Structure

- `kzg/` - KZG commitment implementation and trusted setup management
- `blob/` - Blob encoding/decoding utilities with EIP-4844 compliance
- `writer/` - Transaction construction and submission with fee estimation
- `verifier/` - Blob verification and integrity checks with inclusion proofs
- `codecs/` - Data encoding system (JSON, raw binary, extensible)
- `types/` - TypeScript type definitions and validation utilities

## Testing and Development

```bash
npm test              # Run comprehensive test suite (128 tests)
npm run lint          # Run ESLint with TypeScript rules
npm run typecheck     # Run TypeScript type checking
npm run build         # Build production distribution
npm run format        # Format code with Prettier
```

## Security Considerations

- All user inputs are validated before processing
- Private keys are validated for correct format
- RPC URLs are validated for security
- Environment variables are sanitized
- Cryptographic operations use audited libraries (`@noble/curves`, `@noble/hashes`)
- No sensitive data is logged or exposed in error messages

## Browser Support

BlobKit works in modern browsers with proper bundling. Note that private key operations should only be performed in secure environments.

## Contributing

We welcome contributions! Please see our contributing guidelines and ensure all tests pass before submitting pull requests.

## License

Apache 2.0

---

## About the Project

**BlobKit** is developed and maintained by [**Zak Cole**](https://x.com/0xzak) at [**Number Group**](https://numbergroup.xyz) with support from the [**Ethereum Community Foundation**](https://ethcf.org).

### Links

- **NPM Package**: [blobkit](https://www.npmjs.com/package/blobkit)
- **GitHub Repository**: [ETHCF/blobkit](https://github.com/ETHCF/blobkit)
- **Number Group**: [numbergroup.xyz](https://numbergroup.xyz)
- **Ethereum Community Foundation**: [ethcf.org](https://ethcf.org)

### Contact & Support

For questions, bug reports, or contributions:

- **Email**: [zcole@linux.com](mailto:zcole@linux.com)
- **X/Twitter**: [@0xzak](https://x.com/0xzak)
- **GitHub**: [@zscole](https://github.com/zscole)
- **Issues**: [GitHub Issues](https://github.com/ETHCF/blobkit/issues)

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

TypeScript SDK for Ethereum blob transactions (EIP-4844).

Blob space is useful for temporary data storage with cryptographic guarantees. Think ephemeral messaging, gaming state, proof-of-existence, or any data that doesn't need permanent on-chain storage but benefits from Ethereum's security and availability.

## Installation

```bash
npm install blobkit
```

## Setup

Create a `.env` file in your project root:

```bash
# Required
RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
PRIVATE_KEY=0x...

# Optional
CHAIN_ID=1
ARCHIVE_URL=https://your-blob-archive.com
```

**⚠️ Security Note**: Never commit your `.env` file or private keys to version control. Add `.env` to your `.gitignore`.

## Usage

```typescript
import { BlobKit, initializeForDevelopment } from 'blobkit';
import dotenv from 'dotenv';

dotenv.config();

// Initialize KZG setup (required)
await initializeForDevelopment();

// Create client with environment variables
const blobkit = new BlobKit({
  rpcUrl: process.env.RPC_URL!,
  chainId: parseInt(process.env.CHAIN_ID || '1')
}, process.env.PRIVATE_KEY);

// Write blob
const receipt = await blobkit.writeBlob({
  message: 'Hello blob space',
  timestamp: Date.now()
});

// Read blob
const data = await blobkit.readBlob(receipt.blobHash);

// Verify blob
const isValid = await blobkit.verifyBlob(data, receipt.blobHash);
```

## KZG Setup

For production, use the official Ethereum KZG ceremony parameters:

```typescript
import { initializeForProduction } from 'blobkit';

// Download from: https://github.com/ethereum/kzg-ceremony-sequencer
await initializeForProduction(
  '/path/to/g1.point',
  '/path/to/g2.point',
  'text'
);
```

Development only:
```typescript
await initializeForDevelopment(); // Uses mock setup - DO NOT use in production
```

## Alternative Authentication

For browser environments or when using external signers:

```typescript
// Without private key - read-only operations
const readOnlyClient = new BlobKit({
  rpcUrl: process.env.RPC_URL!,
  chainId: 1
});

// With ethers.js wallet
import { Wallet } from 'ethers';
const wallet = new Wallet(process.env.PRIVATE_KEY!);
const blobkit = new BlobKit({ rpcUrl: process.env.RPC_URL!, chainId: 1 }, wallet.privateKey);
```

## Project Structure

- `kzg/` - KZG commitment implementation and trusted setup
- `blob/` - Blob encoding/decoding utilities 
- `writer/` - Transaction construction and submission
- `verifier/` - Blob verification and integrity checks
- `codecs/` - Data encoding (JSON, raw binary, extensible)
- `types/` - TypeScript type definitions

## Contributing

```bash
npm test        # Run tests
npm run lint    # Lint code  
npm run build   # Build SDK
```

## License

Apache 2.0
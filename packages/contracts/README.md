# @blobkit/contracts

Solidity smart contracts for trustless escrow payments in the BlobKit system.

## Installation

```bash
npm install @blobkit/contracts
```

## Usage

```typescript
import { ethers } from 'ethers';
import { BlobKitEscrowABI, getContractAddress } from '@blobkit/contracts';

const provider = new ethers.JsonRpcProvider('https://mainnet.infura.io/v3/YOUR_PROJECT_ID');
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const escrowAddress = getContractAddress(1);
const escrow = new ethers.Contract(escrowAddress, BlobKitEscrowABI, signer);

// Deposit for blob job
const jobId = ethers.keccak256(ethers.toUtf8Bytes('unique-job-id'));
const tx = await escrow.depositForBlob(jobId, { value: ethers.parseEther('0.01') });
await tx.wait();

// Check job status
const job = await escrow.getJob(jobId);
console.log('Job completed:', job.completed);
```

## Configuration

```bash
# Environment variables for deployed contracts
BLOBKIT_ESCROW_1=0x...      # Mainnet
BLOBKIT_ESCROW_11155111=0x... # Sepolia
BLOBKIT_ESCROW_17000=0x...   # Holesky
```

## Testing and Development

```bash
forge build            # Build contracts
forge test             # Run tests
forge test --coverage  # Run with coverage
forge fmt              # Format code
npm run lint           # Check formatting
npm run type-check     # Type check TypeScript
```

## Documentation

See [/docs/contracts/](../../docs/contracts/) for contract documentation.

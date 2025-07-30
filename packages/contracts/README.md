# @blobkit/contracts

Solidity smart contracts for BlobKit escrow system with trustless payment handling.

## Installation

```bash
npm install @blobkit/contracts
```

## Usage

### With Ethers.js

```typescript
import { ethers } from 'ethers';
import { BlobKitEscrowABI, getContractAddress } from '@blobkit/contracts';

const provider = new ethers.JsonRpcProvider('https://mainnet.infura.io/v3/YOUR_PROJECT_ID');
const signer = new ethers.Wallet('YOUR_PRIVATE_KEY', provider);

const escrowAddress = getContractAddress(1); // Mainnet
const escrow = new ethers.Contract(escrowAddress, BlobKitEscrowABI, signer);

// Deposit for a job
const jobId = ethers.keccak256(ethers.toUtf8Bytes('job-123'));
const tx = await escrow.depositForBlob(jobId, { value: ethers.parseEther('0.01') });
await tx.wait();

// Check job status  
const job = await escrow.getJob(jobId);
console.log('Job completed:', job.completed);
```

## Configuration

Set contract addresses via environment variables:

```bash
BLOBKIT_ESCROW_MAINNET=0x1234567890123456789012345678901234567890
BLOBKIT_ESCROW_SEPOLIA=0x1234567890123456789012345678901234567890
BLOBKIT_ESCROW_HOLESKY=0x1234567890123456789012345678901234567890
```

## Testing and Development

Prerequisites:
- [Foundry](https://getfoundry.sh/)

```bash
forge build                # Build contracts
forge test                 # Run tests
forge test --coverage      # Run with coverage
forge fmt                  # Format code
```

## Documentation

See [/docs/contracts/](../../docs/contracts/) for complete contract integration guide.

## Attribution

Built by [Zak Cole](https://x.com/0xzak) at [Number Group](https://numbergroup.xyz) for the [Ethereum Community Foundation](https://ethcf.org).

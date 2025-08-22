# Contracts Documentation

Deployment and integration guide for @blobkit/contracts.

## Installation

```bash
npm install @blobkit/contracts ethers
```

## Integration

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

## Contract Functions

### User Functions

- `depositForBlob(bytes32 jobId)` - Deposit payment for blob job
- `refundExpiredJob(bytes32 jobId)` - Claim refund for expired jobs

### Proxy Functions

- `completeJob(bytes32 jobId, bytes32 blobTxHash, bytes calldata proof)` - Complete job and claim payment
- `setProxyFee(uint256 percent)` - Set proxy fee (0-10%)

### Owner Functions

- `setProxyAuthorization(address proxy, bool authorized)` - Authorize/deauthorize proxies
- `setJobTimeout(uint256 timeout)` - Configure job timeout
- `pause()` / `unpause()` - Emergency controls

### View Functions

- `getJob(bytes32 jobId)` - Get job details
- `isJobExpired(bytes32 jobId)` - Check if job expired
- `getJobTimeout()` - Get current timeout

## Events

```solidity
event JobCreated(bytes32 indexed jobId, address indexed user, uint256 amount);
event JobCompleted(bytes32 indexed jobId, bytes32 blobTxHash, uint256 proxyFee);
event JobRefunded(bytes32 indexed jobId, string reason);
event ProxyAuthorizationChanged(address indexed proxy, bool authorized);
```

## Development

```bash
forge build            # Build contracts
forge test             # Run tests
forge test --coverage  # Run with coverage
forge fmt              # Format code
```

## Deployment

### Local

```bash
# Start local node
anvil

# Deploy to local network
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast
```

### Testnet

```bash
forge script script/Deploy.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --verify
```

### Mainnet

```bash
forge script script/Deploy.s.sol \
  --rpc-url $MAINNET_RPC_URL \
  --ledger \
  --broadcast \
  --verify
```

## Configuration

```bash
# Environment variables for deployed contracts
BLOBKIT_ESCROW_1=0x...        # Mainnet
BLOBKIT_ESCROW_11155111=0x... # Sepolia
BLOBKIT_ESCROW_17000=0x...    # Holesky
```

## Security Considerations

- OpenZeppelin base contracts (Ownable, ReentrancyGuard, Pausable)
- Custom errors for gas efficiency
- Replay protection on job completion
- Input validation on all public functions
- Emergency pause functionality

Contracts have not been audited. Use at your own risk.

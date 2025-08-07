# Zero-Setup Developer Experience

BlobKit provides a one-click development setup that automatically configures everything you need to start building with blob storage on Ethereum.

## Quick Start

```bash
# Clone the repository
git clone https://github.com/blobkit/blobkit.git
cd blobkit

# Run the setup script
./dev.sh

# That's it!
```

## What the Setup Script Does

The `dev.sh` script automatically:

1. **Checks System Requirements**
   - Node.js 18+
   - npm
   - Docker (optional, for Redis)
   - Redis (starts with Docker if needed)

2. **Creates Development Environment**
   - Generates `.env` with safe defaults
   - Uses test keys for local development
   - Configures all services

3. **Installs & Builds**
   - Installs all dependencies
   - Builds TypeScript packages
   - Compiles smart contracts

4. **Starts Local Blockchain**
   - Launches Hardhat node on port 8545
   - Funds test accounts
   - Deploys BlobKit contracts

5. **Starts Services**
   - Redis for job queuing
   - Proxy server on port 3000
   - Opens API documentation

## Development Workflow

### Running Services Individually

```bash
# Start local blockchain
npx hardhat node

# Start Redis
docker run -d -p 6379:6379 redis:alpine

# Deploy contracts
cd packages/contracts
npx hardhat run scripts/deploy.js --network localhost

# Start proxy server
cd packages/proxy-server
npm run dev

# Run SDK demo
cd scripts
npm run demo
```

### Using tmux (Recommended)

If you have tmux installed, the script creates a session with:

- **Window 0**: Proxy server logs
- **Window 1**: Demo/playground
- **Window 2**: Blockchain logs

Attach with:

```bash
tmux attach -t blobkit
```

Navigate windows:

- `Ctrl+B, 0-2`: Switch windows
- `Ctrl+B, d`: Detach
- `Ctrl+B, ?`: Help

### Environment Variables

The script creates a `.env` file with:

```env
# Development defaults - DO NOT use in production
NODE_ENV=development
PORT=3000
CHAIN_ID=31337
RPC_URL=http://localhost:8545
REDIS_URL=redis://localhost:6379

# Test account (Hardhat #0)
# PRIVATE_KEY is provided by Hardhat locally; do not commit real keys
PRIVATE_KEY=0x...

# Contract addresses (updated after deploy)
ESCROW_CONTRACT=0x5FbDB2315678afecb367f032d93F642f64180aa3
```

### Test Accounts

Hardhat provides funded test accounts:

| Account | Address                                    | Private Key                                                        |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ |
| #0      | 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 | 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 |
| #1      | 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 | 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d |
| #2      | 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC | 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a |

## API Testing

### Health Check

```bash
curl http://localhost:3000/api/v1/health
```

### Create Blob Job (SDK)

```typescript
import { BlobKit } from '@blobkit/sdk';

const blobkit = await BlobKit.init({
  rpcUrl: process.env.BLOBKIT_RPC_URL!,
  chainId: 31337,
  privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
});

// Create a job
const job = await blobkit.createJob({
  value: ethers.parseEther('0.01')
});

// Write blob data
const result = await blobkit.writeBlob(
  { message: 'Hello, blobs!' },
  {
    appId: 'my-app',
    contentType: 'application/json'
  }
);

console.log('Blob stored:', result.blobTxHash);
```

### Direct Proxy API

```bash
# First create a job using the SDK or contracts
# Then write blob via proxy

curl -X POST http://localhost:3000/api/v1/blob/write \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "0x...",
    "paymentTxHash": "0x...",
    "payload": "SGVsbG8sIGJsb2JzIQ==",
    "meta": {
      "appId": "test",
      "codec": "json"
    }
  }'
```

## Troubleshooting

### Port Already in Use

```bash
# Check what's using port 8545 (Hardhat)
lsof -i :8545

# Check what's using port 3000 (Proxy)
lsof -i :3000

# Kill process using port
kill -9 <PID>
```

### Redis Connection Failed

```bash
# Start Redis manually
docker run -d --name redis -p 6379:6379 redis:alpine

# Or install locally
brew install redis  # macOS
sudo apt install redis-server  # Ubuntu
```

### Contract Deployment Failed

```bash
# Reset Hardhat state
rm -rf packages/contracts/cache
rm -rf packages/contracts/artifacts

# Restart Hardhat node
npx hardhat node --reset
```

### Clean Restart

```bash
# Stop all services
./dev.sh clean

# Full reset
rm -rf node_modules
rm -rf packages/*/node_modules
rm -rf packages/*/dist
rm .env

# Start fresh
./dev.sh
```

## VS Code Setup

Recommended extensions:

- ESLint
- Prettier
- Solidity
- Hardhat Solidity

Settings (`.vscode/settings.json`):

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "solidity.formatter": "forge",
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

## Production Considerations

⚠️ **NEVER use the development setup in production!**

For production:

1. Use proper key management (AWS KMS, HSM)
2. Configure real RPC endpoints
3. Set up monitoring and alerts
4. Use production Redis cluster
5. Enable rate limiting and DDoS protection

See [Secure Deployment Guide](./secure-deployment.md) for details.

## Next Steps

1. **Explore the SDK**: Check out [SDK examples](./sdk/README.md)
2. **Review Architecture**: Read the [architecture guide](./architecture.md)
3. **Deploy Contracts**: See [deployment guide](./deploy.md)
4. **Build Your App**: Start with the [getting started tutorial](./getting-started.md)

## Getting Help

- **Documentation**: http://localhost:3000/docs
- **GitHub Issues**: https://github.com/blobkit/blobkit/issues
- **Discord**: [Join our community](https://discord.gg/blobkit)

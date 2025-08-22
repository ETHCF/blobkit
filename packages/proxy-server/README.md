# @blobkit/proxy-server

Express.js server that executes EIP-4844 blob transactions on behalf of browser clients after verifying escrow payments.

## Installation

```bash
npm install @blobkit/proxy-server
```

## Requirements

- Node.js v18 or later
- Redis 6.0 or later (for persistent job queue)

## Usage

```bash
# Using CLI
npx blobkit-proxy --rpc-url $RPC_URL \
                  --private-key $PRIVATE_KEY \
                  --escrow-contract 0x1234567890123456789012345678901234567890

# Using environment variables
export RPC_URL=$MAINNET_RPC_URL
export PRIVATE_KEY=$PRIVATE_KEY
export ESCROW_CONTRACT=0x1234567890123456789012345678901234567890
npx blobkit-proxy
```

## Configuration

| Environment Variable     | Required | Default                | Description                      |
| ------------------------ | -------- | ---------------------- | -------------------------------- |
| `RPC_URL`                | Yes      | -                      | Ethereum RPC endpoint            |
| `ESCROW_CONTRACT`        | Yes      | -                      | Escrow contract address          |
| `KZG_TRUSTED_SETUP_PATH` | Yes      | -                      | Path to KZG trusted setup file   |
| `REQUEST_SIGNING_SECRET` | Yes      | -                      | HMAC secret (min 32 chars)       |
| `PRIVATE_KEY`            | No\*     | -                      | Private key for dev (see below)  |
| `AWS_KMS_KEY_ID`         | No\*     | -                      | AWS KMS key ARN for production   |
| `PORT`                   | No       | 3000                   | Server port                      |
| `HOST`                   | No       | 0.0.0.0                | Server host                      |
| `CHAIN_ID`               | No       | 1                      | Ethereum chain ID                |
| `PROXY_FEE_PERCENT`      | No       | 0                      | Fee percentage (0-10)            |
| `LOG_LEVEL`              | No       | info                   | Log level: debug/info/warn/error |
| `REDIS_URL`              | No       | redis://localhost:6379 | Redis connection URL             |

\*One key management option required (PRIVATE_KEY for development, AWS_KMS_KEY_ID for production)

## KZG Trusted Setup

The proxy server requires a KZG trusted setup for creating blob commitments and proofs:

- **Default**: Uses the built-in Ethereum mainnet trusted setup
- **Custom**: Specify a path with `KZG_TRUSTED_SETUP_PATH` environment variable

```bash
# Use custom trusted setup
export KZG_TRUSTED_SETUP_PATH=/path/to/trusted_setup.txt
npx blobkit-proxy
```

The trusted setup file should be in the standard Ethereum KZG ceremony format. Download from [ceremony.ethereum.org](https://ceremony.ethereum.org/).

## Redis Persistence

The proxy server uses Redis for persistent job queue management. This ensures that pending job completions survive server restarts.

### Redis Setup

```bash
# Using Docker
docker run -d -p 6379:6379 redis:7-alpine

# Using Homebrew (macOS)
brew install redis
brew services start redis

# Using apt (Ubuntu/Debian)
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
```

### Redis Configuration

The server connects to Redis using the `REDIS_URL` environment variable. Examples:

```bash
# Local Redis
REDIS_URL=redis://localhost:6379

# Redis with authentication
REDIS_URL=redis://username:password@hostname:6379

# Redis with TLS
REDIS_URL=rediss://hostname:6380
```

## Testing and Development

```bash
npm test               # Run tests
npm run test:coverage  # Run tests with coverage
npm run build          # Build for production
npm run dev            # Start development server
npm run lint           # Lint code
npm run type-check     # TypeScript checking
```

## Documentation

See [/docs/proxy/](../../docs/proxy/) for deployment guides and API documentation.

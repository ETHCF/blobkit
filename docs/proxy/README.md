# Proxy Server Documentation

Deployment and operation guide for @blobkit/proxy-server.

## Installation

```bash
npm install @blobkit/proxy-server
```

## Quick Start

```bash
# Using environment variables
export RPC_URL=$MAINNET_RPC_URL
export PRIVATE_KEY=$PRIVATE_KEY
export ESCROW_CONTRACT=0x0000000000000000000000000000000000000000

npx blobkit-proxy
```

## Configuration

| Variable            | Required | Default | Description                |
| ------------------- | -------- | ------- | -------------------------- |
| `RPC_URL`           | Yes      | -       | Ethereum RPC endpoint      |
| `PRIVATE_KEY`       | Yes      | -       | Private key (64 hex chars) |
| `ESCROW_CONTRACT`   | Yes      | -       | Escrow contract address    |
| `PORT`              | No       | 3000    | Server port                |
| `HOST`              | No       | 0.0.0.0 | Server host                |
| `CHAIN_ID`          | No       | 1       | Chain ID                   |
| `PROXY_FEE_PERCENT` | No       | 0       | Fee percentage (0-10)      |
| `LOG_LEVEL`         | No       | info    | Log level                  |

## API Endpoints

### Health Check

```bash
GET /api/v1/health
```

Returns server status, configuration, and blockchain connectivity.

### Blob Write

```bash
POST /api/v1/blob/write
```

**Request body:**

```json
{
  "jobId": "user-0x1234-payload-hash-nonce",
  "paymentTxHash": "0x5678...",
  "payload": [72, 101, 108, 108, 111],
  "meta": {
    "appId": "my-app",
    "codec": "text",
    "filename": "hello.txt"
  }
}
```

**Response:**

```json
{
  "success": true,
  "blobTxHash": "0xabcd...",
  "blockNumber": 18500000,
  "blobHash": "0xef01...",
  "commitment": "0x2345...",
  "proof": "0x6789...",
  "blobIndex": 0,
  "completionTxHash": "0xcdef..."
}
```

## CLI Commands

```bash
# Start server
npx blobkit-proxy start

# Check health
npx blobkit-proxy health

# Show configuration
npx blobkit-proxy config
```

## Deployment

### Docker

```bash
# Build image
npm run docker:build

# Run container
docker run -p 3000:3000 \
  -e RPC_URL=$MAINNET_RPC_URL \
  -e PRIVATE_KEY=$PRIVATE_KEY \
  -e ESCROW_CONTRACT=0x0000000000000000000000000000000000000000 \
  blobkit-proxy
```

### Production Checklist

- Use secure key management (AWS KMS, Hashicorp Vault)
- Configure reverse proxy with TLS
- Set up monitoring and alerting
- Enable rate limiting
- Use environment-specific configs

## Security

- Never commit private keys to version control
- Use secure private key storage (HSM, KMS)
- Configure appropriate rate limits
- Monitor for suspicious activity
- Keep dependencies updated

## Testing and Development

```bash
npm test               # Run tests
npm run build          # Build for production
npm run dev            # Start development server
npm run lint           # Lint code
npm run type-check     # TypeScript checking
```

# BlobKit Proxy Server Documentation

Complete guide for deploying and operating BlobKit proxy servers.

## Overview

The BlobKit proxy server executes blob transactions for browser clients after verifying escrow payments.

## Installation

```bash
npm install @blobkit/proxy-server
```

## Quick Start

Create `.env` file:

```bash
RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
PRIVATE_KEY=0x1234567890123456789012345678901234567890123456789012345678901234
ESCROW_CONTRACT=0x1234567890123456789012345678901234567890
PORT=3000
CHAIN_ID=1
PROXY_FEE_PERCENT=0
LOG_LEVEL=info
```

Start server:

```bash
npm start
```

## Configuration

### Required Environment Variables

- `RPC_URL` - Ethereum RPC endpoint
- `PRIVATE_KEY` - Private key for blob transactions (64 hex chars)
- `ESCROW_CONTRACT` - BlobKit escrow contract address

### Optional Environment Variables

- `PORT` (default: 3000)
- `HOST` (default: 0.0.0.0)
- `CHAIN_ID` (default: 1)
- `PROXY_FEE_PERCENT` (default: 0, max: 10)
- `LOG_LEVEL` (default: info)

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

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t blobkit-proxy .
docker run -p 3000:3000 --env-file .env blobkit-proxy
```

### Environment

For production deployments:
- Use secure private key management
- Set up reverse proxy (nginx/Cloudflare)
- Configure monitoring and logging
- Enable rate limiting

## Security

- Never commit private keys to version control
- Use secure private key storage (HSM, KMS)
- Configure appropriate rate limits
- Monitor for suspicious activity
- Keep dependencies updated

## Development

```bash
npm test                    # Run tests
npm run build               # Build for production
npm run dev                 # Start development server
npm run lint                # Lint code
npm run type-check          # TypeScript checking
```

## Attribution

BlobKit was built by [Zak Cole](https://x.com/0xzak) at [Number Group](https://numbergroup.xyz) for the [Ethereum Community Foundation](https://ethcf.org). 
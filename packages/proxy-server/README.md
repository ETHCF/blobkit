# @blobkit/proxy-server

Express.js proxy server that executes blob transactions for browser clients after verifying escrow payments.

## Installation

```bash
npm install @blobkit/proxy-server
```

## Usage

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

Required environment variables:
- `RPC_URL` - Ethereum RPC endpoint
- `PRIVATE_KEY` - Private key for blob transactions (64 hex chars)
- `ESCROW_CONTRACT` - BlobKit escrow contract address

Optional environment variables:
- `PORT` (default: 3000)
- `HOST` (default: 0.0.0.0)
- `CHAIN_ID` (default: 1)
- `PROXY_FEE_PERCENT` (default: 0, max: 10)
- `LOG_LEVEL` (default: info)

## Testing and Development

```bash
npm test                    # Run tests
npm run build               # Build for production
npm run dev                 # Start development server
npm run lint                # Lint code
npm run type-check          # TypeScript checking
```

## Documentation

See [/docs/proxy/](../../docs/proxy/) for complete deployment and API documentation.

## Attribution

Built by [Zak Cole](https://x.com/0xzak) at [Number Group](https://numbergroup.xyz) for the [Ethereum Community Foundation](https://ethcf.org). 
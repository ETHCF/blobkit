# BlobKit Documentation

## Production Status

**BlobKit is live on Ethereum mainnet!**

- **Escrow Contract:** [`0xB4CFE544d8aE6015B844dF84D3c5Dcf5bA3e2495`](https://etherscan.io/address/0xB4CFE544d8aE6015B844dF84D3c5Dcf5bA3e2495)
- **Status:** ✅ Fully operational
- **Tested:** Complete end-to-end verification on mainnet

## Documentation Index

### Getting Started

- [**Infrastructure Requirements**](infrastructure.md) - **READ THIS FIRST** - RPC setup for blob support
- [Architecture Overview](architecture.md) - System design and components
- [Getting Started Guide](getting-started.md) - Quick start tutorial

### Deployment & Operations

- [Mainnet Deployment Guide](../MAINNET_DEPLOYMENT_GUIDE.md) - Deploy contracts to mainnet
- [Production Audit Report](../PRODUCTION_AUDIT_REPORT.md) - Security and readiness audit
- [Deployment Success Report](../MAINNET_DEPLOYMENT_SUCCESS.md) - Mainnet deployment verification

### Component Documentation

- [SDK Documentation](sdk/README.md) - TypeScript SDK reference
- [Proxy Server](proxy/README.md) - Proxy server setup and API
- [Smart Contracts](contracts/README.md) - Escrow contract documentation

### Advanced Topics

- [Secure Deployment](secure-deployment.md) - Security best practices
- [Distributed Tracing](distributed-tracing.md) - Monitoring and observability
- [Zero Setup Guide](zero-setup.md) - Minimal configuration deployment

## ⚡ Quick Start

### 1. Choose Your RPC

**Important:** Standard RPCs (Alchemy, Infura) don't support blobs. Use:

```typescript
// Recommended: Flashbots (FREE)
const RPC = process.env.BLOBKIT_RPC_URL!;
```

### 2. Install SDK

```bash
npm install @blobkit/sdk
```

### 3. Write Your First Blob

```typescript
import { BlobKit } from '@blobkit/sdk';
import { Wallet } from 'ethers';

const signer = new Wallet(process.env.PRIVATE_KEY);
const blobkit = await BlobKit.init(
  {
    rpcUrl: 'https://rpc.flashbots.net', // Must use blob-compatible RPC
    chainId: 1
  },
  signer
);

const data = Buffer.from('Hello, Ethereum blobs!');
const receipt = await blobkit.writeBlob(data);
console.log(`Blob stored: ${receipt.blobTxHash}`);
```

## Mainnet Verification

The system has been fully tested on mainnet with real transactions:

| Test           | Transaction                                                                                                  | Result     |
| -------------- | ------------------------------------------------------------------------------------------------------------ | ---------- |
| Job Creation   | [`0x2d968d9...`](https://etherscan.io/tx/0x2d968d9cd4869b53a78c77ce2daad71e1935753ad7bbcfdcac472d93bf5dbade) | ✅ Success |
| Job Completion | [`0x3c05906...`](https://etherscan.io/tx/0x3c05906995b76d5625b84f7020f225b67084ae844a2ba4b06a9ca68af1514213) | ✅ Success |

## Architecture

```
User → SDK → Escrow Contract → Proxy Server → Blob Transaction
                ↓                    ↓              ↓
            Payment Held      Verify Payment   Submit to L1
                ↓                    ↓              ↓
            Timeout Refund    Claim Payment    Store Blob
```

## Key Insights

1. **RPC Choice Matters:** Must use blob-compatible RPC (Flashbots recommended)
2. **Cost Efficient:** Blobs cost ~$0.01 vs ~$50 for equivalent calldata
3. **Production Ready:** All components tested and verified on mainnet
4. **Trust Minimized:** Escrow ensures payment security

## Support

- **GitHub Issues:** [Report issues](https://github.com/blobkit/blobkit/issues)
- **Email:** zcole@linux.com

## License

MIT - See [LICENSE](../LICENSE) for details.

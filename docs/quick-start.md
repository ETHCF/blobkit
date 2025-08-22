# BlobKit Quick Start

## ⚡ 5-Minute Setup

### 1. Install

```bash
npm install @blobkit/sdk
```

### 2. Configure (IMPORTANT: Use Flashbots RPC)

```typescript
import { BlobKit } from '@blobkit/sdk';
import { Wallet } from 'ethers';

const signer = new Wallet(process.env.PRIVATE_KEY);
const blobkit = await BlobKit.init(
  {
    rpcUrl: 'https://rpc.flashbots.net', // ← MUST use blob-compatible RPC!
    chainId: 1 // Mainnet
  },
  signer
);
```

### 3. Write Blob

```typescript
const data = Buffer.from('Hello, blobs!');
const receipt = await blobkit.writeBlob(data);
console.log(`Stored at: ${receipt.blobTxHash}`);
```

### 4. Read Blob

```typescript
const blob = await blobkit.readBlob(receipt.blobTxHash);
console.log('Data:', blob.data);
```

## Critical: RPC Requirements

**Standard RPCs (Alchemy, Infura) DO NOT support blob transactions!**

### ✅ Working RPCs:

- **Flashbots (FREE):** `https://rpc.flashbots.net`
- **Your own node:** Geth + Lighthouse/Prysm
- **Some MEV relays:** Check documentation

### ❌ NOT Working:

- ❌ `https://eth-mainnet.g.alchemy.com/...`
- ❌ `https://mainnet.infura.io/...`
- ❌ Most standard RPC providers

## What's Deployed

| Component           | Mainnet Address                                                                                                         | Status  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------- |
| **Escrow Contract** | [`0x2e8e414bc5c6B0b8339853CEDf965B4A28FB4838`](https://etherscan.io/address/0x2e8e414bc5c6B0b8339853CEDf965B4A28FB4838) | ✅ Live |

## Costs

- **Blob storage:** ~$0.01-0.10 per blob (131KB)
- **Calldata equivalent:** ~$50-100 (100x more expensive!)
- **Gas for operations:** ~$0.50-2.00

## Environment Variables

```bash
# .env
PRIVATE_KEY=0x...
BLOBKIT_RPC_URL=https://rpc.flashbots.net  # Use blob-compatible RPC!
BLOBKIT_ESCROW_1=0x2e8e414bc5c6B0b8339853CEDf965B4A28FB4838
```

## Complete Example

```typescript
import { BlobKit } from '@blobkit/sdk';
import { Wallet } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  // 1. Initialize
  const signer = new Wallet(process.env.PRIVATE_KEY!);
  const blobkit = await BlobKit.init(
    {
      rpcUrl: 'https://rpc.flashbots.net', // MUST use this or similar!
      chainId: 1
    },
    signer
  );

  // 2. Estimate cost
  const data = Buffer.from('Hello, Ethereum blobs!');
  const estimate = await blobkit.estimateCost(data);
  console.log(`Cost: ${estimate.totalETH} ETH`);

  // 3. Write blob
  const receipt = await blobkit.writeBlob(data, {
    appId: 'my-app',
    codec: 'text/plain'
  });
  console.log(`Blob TX: ${receipt.blobTxHash}`);

  // 4. Read blob
  const blob = await blobkit.readBlob(receipt.blobTxHash);
  const text = Buffer.from(blob.data).toString();
  console.log(`Retrieved: ${text}`);
}

main().catch(console.error);
```

## ❓ FAQ

**Q: Why does my transaction fail with Alchemy/Infura?**  
A: They don't support blob transactions. Use Flashbots RPC.

**Q: How much does it cost?**  
A: ~$0.01-0.10 per 131KB blob (vs ~$50+ for calldata).

**Q: Is it production ready?**  
A: Yes! Fully deployed and tested on mainnet.

**Q: Can I use it in the browser?**  
A: Yes, with a proxy server (see docs).

## 🆘 Help

- **Docs:** [Full Documentation](docs/README.md)
- **Issues:** [GitHub Issues](https://github.com/blobkit/blobkit/issues)
- **RPC Setup:** [Infrastructure Guide](docs/infrastructure.md)

## ⚠️ Remember

**Always use a blob-compatible RPC like Flashbots (`https://rpc.flashbots.net`)!**

Standard RPCs will NOT work for blob transactions.

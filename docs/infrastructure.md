# Blob Infrastructure Requirements

## Executive Summary

BlobKit is **production-ready** on Ethereum mainnet. However, blob transactions (EIP-4844) require specialized RPC infrastructure beyond standard providers like Alchemy or Infura.

**TL;DR:** Use Flashbots RPC (`https://rpc.flashbots.net`) - it's free and works today.

## The Challenge

Standard Ethereum RPC endpoints only handle the **execution layer**, but blob transactions require coordination with the **consensus layer** for blob data storage.

```
Standard Transaction:          Blob Transaction (Type-3):
┌──────────────┐              ┌──────────────┐ ┌──────────────┐
│ Execution    │              │ Execution    │ │ Consensus    │
│ Layer Only   │              │ Layer        │ │ Layer        │
│              │              │              │ │              │
│ Transaction  │              │ Transaction  │ │ Blob Data    │
│ → Contract   │              │ + Versioned  │ │ (131KB)      │
│              │              │   Hashes     │ │              │
└──────────────┘              └──────────────┘ └──────────────┘
                                      ↓               ↓
                              Must be submitted together!
```

## Available Solutions

### 1. Flashbots RPC (Recommended)

**Free, immediate, no setup required.**

```typescript
const blobkit = await BlobKit.init(
  {
    rpcUrl: 'https://rpc.flashbots.net', // Just change this line!
    chainId: 1
  },
  signer
);
```

**Pros:**

- ✅ Free to use
- ✅ No registration
- ✅ Production-ready
- ✅ Supports blob transactions

**Cons:**

- May have rate limits for heavy usage
- Best suited for moderate transaction volume

### 2. Run Your Own Node

**Full control, unlimited transactions.**

```bash
# Docker Compose Setup
version: '3.8'
services:
  geth:
    image: ethereum/client-go:latest
    command: |
      --http
      --http.addr 0.0.0.0
      --http.api eth,net,web3,txpool
      --authrpc.addr 0.0.0.0
      --authrpc.port 8551
    ports:
      - "8545:8545"
      - "8551:8551"

  lighthouse:
    image: sigp/lighthouse:latest
    command: |
      beacon
      --execution-endpoint http://geth:8551
      --execution-jwt /jwt/jwt.hex
    depends_on:
      - geth
```

**Requirements:**

- ~2TB SSD for full node
- 16GB+ RAM
- Stable internet connection
- ~2-3 days initial sync

### 3. Use Viem Instead of Ethers

Viem has better blob support than ethers.js:

```typescript
import { createWalletClient, http } from 'viem';
import { mainnet } from 'viem/chains';

const client = createWalletClient({
  chain: mainnet,
  transport: http('https://rpc.flashbots.net')
});

// Viem can handle blob transactions natively
const hash = await client.sendTransaction({
  blobs: [blobData],
  kzgCommitments: [commitment],
  kzgProofs: [proof],
  maxFeePerBlobGas: parseGwei('20'),
  to: escrowAddress
});
```

### 4. Alternative Services

#### bloXroute

- Enterprise-grade blob support
- Requires subscription
- Best for high-volume applications

#### MEV Relays

- Some MEV relays support blob transactions
- May require special bundle format
- Good for MEV-aware applications

#### Dedicated Node Providers

- Chainstack, QuickNode (check for blob support)
- Typically requires enterprise plan
- SLA guarantees available

## Implementation Guide

### Step 1: Choose Your RPC

For most users, start with Flashbots:

```javascript
// Before (won't work for blobs):
const RPC = 'https://eth-mainnet.g.alchemy.com/v2/KEY';

// After (works for blobs):
const RPC = 'https://rpc.flashbots.net';
```

### Step 2: Update Your Code

```typescript
// packages/sdk/src/config.ts
export const DEFAULT_RPC_ENDPOINTS = {
  1: 'https://rpc.flashbots.net', // Mainnet
  11155111: 'https://rpc-sepolia.flashbots.net' // Sepolia
};
```

### Step 3: Handle Fallbacks

```typescript
async function sendBlobTransaction(data: Uint8Array) {
  try {
    // Try blob transaction first
    return await sendBlobTx(data);
  } catch (error) {
    if (error.message.includes('blob')) {
      // Fallback to calldata (expensive but works)
      console.warn('Blob not supported, using calldata');
      return await sendCalldataTx(data);
    }
    throw error;
  }
}
```

## Cost Comparison

| Method                     | 131KB Data Cost | Speed  | Reliability |
| -------------------------- | --------------- | ------ | ----------- |
| **Blob (with proper RPC)** | ~$0.01-0.10     | Fast   | High        |
| **Calldata (fallback)**    | ~$50-100        | Fast   | High        |
| **IPFS + Hash**            | ~$0.01          | Medium | Medium      |
| **Alternative DA**         | ~$0.001         | Varies | Varies      |

## Testing Your Setup

```bash
# Test if your RPC supports blobs
curl -X POST https://rpc.flashbots.net \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blobBaseFee","params":[],"id":1}'
```

## Production Checklist

- [ ] Using blob-compatible RPC (Flashbots or own node)
- [ ] Fallback mechanism implemented
- [ ] Gas estimation includes blob fees
- [ ] Monitoring for blob submission failures
- [ ] Rate limiting considered
- [ ] Cost tracking in place

## FAQ

### Q: Why doesn't Alchemy/Infura work?

**A:** They only provide execution layer access. Blobs require consensus layer coordination.

### Q: Is Flashbots RPC really free?

**A:** Yes, it's free for public use. They may have rate limits for extremely high usage.

### Q: Can I use BlobKit without blob support?

**A:** Yes, the system can fall back to calldata, but it's ~100x more expensive.

### Q: When will Alchemy/Infura support blobs?

**A:** Unknown. Enterprise plans may have support - contact them directly.

## Support

For infrastructure questions:

- GitHub Issues: [blobkit/issues](https://github.com/blobkit/blobkit/issues)
- Discord: [Join our server](https://discord.gg/blobkit)

## Summary

BlobKit is **production-ready** today. Just use Flashbots RPC instead of standard providers:

```typescript
// This one change enables blob support:
rpcUrl: 'https://rpc.flashbots.net';
```

Everything else works out of the box!

# BlobKit Deployment Guide

## Prerequisites

Before deploying to mainnet, ensure you have:

1. **Wallet with ETH** - At least 0.1 ETH for deployment and gas
2. **Private key** - Securely stored, never commit to git
3. **Contract compiled** - Run `npm run build:contracts`
4. **Tests passing** - All contract tests must pass

## Step 1: Prepare Environment

```bash
# Add to .env file (NEVER commit this!)
DEPLOYER_PRIVATE_KEY=0x_your_private_key_here
```

## Step 2: Compile Contracts

```bash
cd packages/contracts
npm run build
npm test
```

## Step 3: Review Deployment Script

Check `/scripts/deploy-mainnet.ts` and update:

- Proxy addresses to authorize
- Job timeout (default 5 minutes)
- Proxy fee percentage (default 2%)

## Step 4: Deploy Contract

```bash
# From project root
npx ts-node scripts/deploy-mainnet.ts
```

The script will:

1. Connect to mainnet via Alchemy RPC
2. Check wallet balance
3. Verify gas prices are reasonable
4. Estimate deployment cost
5. Request explicit confirmation
6. Deploy the contract
7. Save deployment info to `/deployments/mainnet.json`

## Step 5: Verify on Etherscan

```bash
# Get your Etherscan API key from https://etherscan.io/apis
export ETHERSCAN_API_KEY=your_api_key

# Verify contract
npx hardhat verify --network mainnet CONTRACT_ADDRESS
```

## Step 6: Update Configuration

1. Add to `.env`:

```bash
BLOBKIT_ESCROW_1=0x_deployed_contract_address
```

2. Update SDK configuration in `/packages/sdk/src/utils.ts`:

```typescript
case 1: // Mainnet
  return '0x_deployed_contract_address';
```

## Step 7: Deploy Proxy Servers

For each proxy server:

1. Deploy proxy infrastructure
2. Configure with escrow contract address
3. Authorize proxy in escrow contract (if not done during deployment)

## Step 8: Test Deployment

```bash
# Run mainnet integration test
node test-mainnet-production.mjs
```

## Security Checklist (Production)

- [ ] Private key secured (use hardware wallet for production)
- [ ] Contract code audited
- [ ] Deployment script reviewed
- [ ] Gas price reasonable (<100 gwei)
- [ ] Contract verified on Etherscan
- [ ] Access controls configured
- [ ] Emergency pause tested
- [ ] Proxy authorizations correct
- [ ] Small test transactions successful

## Estimated Costs

| Operation       | Gas        | Cost @ 30 gwei |
| --------------- | ---------- | -------------- |
| Contract Deploy | ~2,000,000 | ~0.06 ETH      |
| Authorize Proxy | ~50,000    | ~0.0015 ETH    |
| Set Timeout     | ~30,000    | ~0.0009 ETH    |
| **Total**       | ~2,100,000 | ~0.063 ETH     |

## Emergency Procedures

### If Deployment Fails

1. Check transaction on Etherscan
2. Verify wallet has sufficient ETH
3. Increase gas price if needed
4. Retry with higher gas limit

### After Deployment

1. Save deployment info immediately
2. Transfer ownership to multisig if required
3. Monitor contract for first transactions
4. Set up monitoring alerts

## Contract Addresses

| Network | Address                                    | Block |
| ------- | ------------------------------------------ | ----- |
| Mainnet | (To be deployed)                           | -     |
| Sepolia | 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD77 | -     |
| Holesky | (To be deployed)                           | -     |

## Support

For deployment issues:

- Check logs in `/deployments/mainnet.json`
- Review transaction on Etherscan
- Contact team for assistance

## Important Notes

1. **NEVER** commit private keys to git
2. **ALWAYS** test on testnet first
3. **VERIFY** contract on Etherscan
4. **MONITOR** first transactions carefully
5. **BACKUP** deployment information

## Post-Deployment

After successful deployment:

1. Update documentation with contract address
2. Configure monitoring and alerts
3. Test with small amounts first
4. Gradually increase usage
5. Monitor gas costs and optimize if needed

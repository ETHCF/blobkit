# Architecture

## Problem Statement

Browser wallets do not support EIP-4844 blob transactions (type 0x3). BlobKit solves this with a proxy server and escrow contract system that executes blob transactions on behalf of users while maintaining trustless payment control.

## Solution Architecture

### Three-Component System

Each component is distributed as a separate npm package:

**1. SDK** (`@blobkit/sdk`)

- Environment detection (browser vs Node.js)
- Proxy routing for browser environments
- Direct transactions for Node.js
- KZG cryptographic operations

**2. Proxy Server** (`@blobkit/proxy-server`)

- Express.js server
- Payment verification
- Blob transaction execution
- Rate limiting and validation

**3. Smart Contracts** (`@blobkit/contracts`)

- Escrow payments with automatic refunds
- Job tracking and completion
- Proxy authorization
- Configurable fees (default: 0%)

## Payment Flow

1. User prepares blob data
2. SDK estimates cost: `estimateCost(payload)`
3. SDK generates deterministic job ID
4. User pays into escrow contract via wallet
5. SDK sends blob data to proxy with job ID
6. Proxy verifies payment on-chain
7. Proxy executes blob transaction
8. Proxy completes job and claims payment
9. User receives blob hash and transaction details

If a job fails or expires, users can call `refundIfExpired(jobId)` to reclaim funds.

## Core Design Principles

### Trust Model

- Users control payment timing and amounts
- Smart contracts enforce automatic refunds
- All operations verifiable on-chain
- Default 0% fees (configurable per proxy)

### Environment Detection

- Automatic browser vs Node.js detection
- Browser: routes through proxy
- Node.js: direct transactions
- Serverless: supported
- Graceful degradation with clear error messages

## Key Interfaces

### Blob Metadata Structure

```typescript
interface BlobMeta {
  appId: string; // Application identifier
  codec: string; // MIME type or codec identifier
  contentHash?: string; // SHA-256 hash of content
  ttlBlocks?: number; // Time-to-live in blocks
  timestamp?: number; // Unix timestamp of creation
  filename?: string; // Optional filename for display
  contentType?: string; // Optional content type hint
  tags?: string[]; // Optional categorization tags
}
```

### Enhanced Configuration

```typescript
type BlobKitEnvironment = 'node' | 'browser' | 'serverless';

interface BlobKitConfig {
  // Existing fields preserved
  rpcUrl: string;
  chainId?: number;
  archiveUrl?: string;
  defaultCodec?: string;
  compressionLevel?: number;

  // New proxy configuration
  proxyUrl?: string; // Auto-discover if not specified
  escrowContract?: string; // Auto-discover if not specified
  maxProxyFeePercent?: number; // User protection limit
  callbackUrl?: string; // Optional completion webhook
  logLevel?: 'debug' | 'info' | 'silent'; // Diagnostics control
}
```

### Extended Result Interface

```typescript
interface BlobPaymentResult extends BlobReceipt {
  paymentTx?: string; // Escrow payment transaction
  jobId?: string; // Escrow tracking ID (links to generateJobId)
  proxyUrl?: string; // Proxy used for execution
  totalCostETH?: string; // Total cost paid
  completionTxHash?: string; // Transaction hash when proxy called completeJob
  paymentMethod: 'web3' | 'direct';
}
```

### Cost Estimation Interface

```typescript
interface CostEstimate {
  blobFee: string; // Network blob fee in ETH
  gasFee: string; // Transaction gas cost in ETH
  proxyFee: string; // Proxy service fee in ETH (usually "0")
  totalETH: string; // Total cost user will pay
}
```

### BlobKit Class Requirements

```typescript
class BlobKit {
  private environment: BlobKitEnvironment;
  private proxyUrl?: string;
  private escrowContract?: Contract;

  // Core method signatures
  async writeBlob(payload: unknown, meta?: Partial<BlobMeta>): Promise<BlobPaymentResult>;
  async estimateCost(payload: unknown): Promise<CostEstimate>;
  async refundIfExpired(jobId: string): Promise<void>;
  generateJobId(userAddress: string, payloadHash: string, nonce: number): string;

  private detectEnvironment(): BlobKitEnvironment;
  private writeWithWeb3Payment(
    payload: unknown,
    meta?: Partial<BlobMeta>
  ): Promise<BlobPaymentResult>;
  // Note: writeWithWeb3Payment should handle retry logic and job expiration
}
```

### Error Handling Requirements

```typescript
enum BlobKitErrorCode {
  INVALID_CONFIG = 'INVALID_CONFIG',
  INVALID_PAYLOAD = 'INVALID_PAYLOAD',
  PROXY_NOT_FOUND = 'PROXY_NOT_FOUND',
  CONTRACT_NOT_DEPLOYED = 'CONTRACT_NOT_DEPLOYED',
  PAYMENT_TIMEOUT = 'PAYMENT_TIMEOUT',
  VERIFICATION_FAILED = 'VERIFICATION_FAILED'
}
```

## Smart Contract Design

### Escrow Contract Requirements

- **Job Management**: Track payment, execution status, and timeouts
- **Payment Security**: Hold user funds until job completion or timeout
- **Proxy Authorization**: Only authorized proxies can claim payments
- **Automatic Refunds**: Failed or expired jobs automatically refund users
- **Fee Structure**: Configurable proxy fees (default: 0%)
- **Replay Protection**: Prevent double-completion attacks
- **Configurable Timeouts**: Adjustable job expiration duration

### Core Functions

- `depositForBlob(jobId)` - User pays for blob execution
- `completeJob(jobId, blobTxHash, proof)` - Proxy proves completion and claims payment
  - Must include `require(job.blobTxHash == bytes32(0))` for replay protection
  - `bytes calldata proof` parameter: Signature over jobId + blobTxHash
  - Proof format left to proxy implementation for future flexibility
  - Returns transaction hash for `completionTxHash` field
- `refundExpiredJob(jobId)` - Anyone can trigger refunds for expired jobs
- `setProxyFee(percent)` - Authorized proxies can set their fee percentage
- `setJobTimeout(seconds)` - Contract owner can adjust timeout duration
- `getJobTimeout()` - View current timeout setting

### Required Events

```solidity
event JobCreated(bytes32 indexed jobId, address indexed user, uint256 amount);
event JobCompleted(bytes32 indexed jobId, bytes32 blobTxHash, uint256 proxyFee);
event JobRefunded(bytes32 indexed jobId, string reason);
event JobTimeoutUpdated(uint256 oldTimeout, uint256 newTimeout);
```

### Security Requirements

- Configurable job timeout (default: 5 minutes, adjustable via `setJobTimeout`)
- Replay protection on completion
- Maximum fee percentage limits (10% cap)
- Automatic refund triggers for expired jobs

## Proxy Service Requirements

### Core Responsibilities

- **Payment Verification**: Verify escrow payments match job requirements
- **Blob Execution**: Execute blob transactions using existing BlobKit logic
- **Job Completion**: Update escrow contract and claim configured fees
- **Rate Limiting**: IP-based rate limiting to prevent spam
- **Size Validation**: Validate blob size and gas estimates before execution

### API Requirements

- Health endpoint for auto-discovery (`/api/v1/health`)
- Blob write endpoint accepting job ID and payment proof (`/api/v1/blob/write`)
- Support for optional completion callbacks
- Standardized error responses

### Standardized Error Format

All proxy API errors should return consistent format:

```json
{
  "error": "PROXY_ERROR_CODE",
  "message": "Human-readable error description"
}
```

Examples:

```json
{
  "error": "PAYMENT_INVALID",
  "message": "Job payment not found in escrow contract"
}

{
  "error": "BLOB_TOO_LARGE",
  "message": "Blob size exceeds 128KB limit"
}
```

### Enhanced Security Features

- IP-based rate limiting
- Blob size and estimated gas validation before accepting
- Job ID and payment transaction verification against on-chain values
- Optional HMAC/signed metadata support for future authentication
- Callback URL execution for job completion notifications

## Developer Experience

### Seamless Browser Usage

```typescript
import { BlobKit } from '@blobkit/sdk';

// Node.js usage (direct blob transactions)
const blobkit = new BlobKit(
  {
    rpcUrl: 'https://mainnet.infura.io/v3/YOUR_PROJECT_ID',
    chainId: 1
  },
  signer
);

// Browser usage (proxy-mediated transactions)
const blobkit = new BlobKit(
  {
    rpcUrl: 'https://mainnet.infura.io/v3/YOUR_PROJECT_ID',
    chainId: 1,
    proxyUrl: 'https://proxy.blobkit.org'
  },
  signer
);

const result = await blobkit.writeBlob(data, meta);
```

### Node.js Backward Compatibility

```typescript
// Existing code works unchanged
const blobkit = createFromEnv();
const result = await blobkit.writeBlob(data);
// Direct transactions, no proxy involved
```

### CLI Development Experience

Essential CLI commands for developer workflow:

```bash
npx blobkit dev-proxy                    # Start local development proxy
npx blobkit simulate-payment --jobId abc123  # Test payment flows
npx blobkit check-health                 # Verify proxy connectivity
```

### SDK Helper Methods

```typescript
// Cost estimation with breakdown
const estimate = await blobkit.estimateCost(data);

// Refund management
await blobkit.refundIfExpired(jobId);

// Deterministic job ID generation (logged in user-facing messages)
const jobId = blobkit.generateJobId(userAddress, payloadHash, nonce);
```

### Proxy Deployment Experience

- Simple CLI deployment to major platforms (Vercel, Railway, etc.)
- Automatic contract deployment and proxy authorization
- Default zero fee configuration (public good)
- Optional fee configuration for proxy operators
- Configurable job timeout at deployment

## Cost Structure

### Zero Additional Fees by Default

- Users pay only standard Ethereum transaction costs
- Proxy operators run as public goods (0% fees)
- Optional configurable fees for sustainable proxy operations
- Platform takes no fees (public infrastructure)

### Cost Transparency

- Real-time cost estimation before payment via `estimateCost()`
- Clear breakdown of all fee components
- No hidden charges or unexpected costs

## Security Model

### Trustless Design

- Smart contracts enforce all payment and refund logic
- Proxy operators cannot steal or withhold funds
- Users maintain full control over payment timing
- Multiple authorized proxies prevent censorship

### Failure Handling

- Automatic refunds for failed transactions (configurable timeout)
- Replay protection prevents double-completion
- Rate limiting prevents resource abuse
- Clear error messages for all failure modes
- Retry logic with new job IDs for failed attempts

## Implementation Notes

### Auto-Discovery Logic

- SDK tries localhost development servers first
- Falls back to environment variables
- Uses network-specific default proxies
- Future: decentralized proxy discovery

### Error Handling

- Consistent error codes across components
- Graceful degradation when proxies unavailable
- Clear user guidance for resolution

### Future Enhancements

- Decentralized proxy discovery mechanisms
- Enhanced proof formats for job completion
- Cross-chain proxy support
- Integration with other blob storage solutions

## Summary

BlobKit solves the browser wallet limitation for EIP-4844 by introducing a trustless proxy payment system. Users maintain full control over payments while proxy operators provide the technical capability to execute blob transactions. The architecture preserves backward compatibility, establishes public good infrastructure, and enables seamless blob storage from any environment.

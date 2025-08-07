/**
 * BlobKit Contracts - TypeScript Interface
 * Provides typed interfaces for interacting with BlobKit smart contracts
 */

// Contract ABI for BlobKitEscrow
export const BlobKitEscrowABI = [
  // Events
  'event JobCreated(bytes32 indexed jobId, address indexed user, uint256 amount)',
  'event JobCompleted(bytes32 indexed jobId, bytes32 blobTxHash, uint256 proxyFee)',
  'event JobRefunded(bytes32 indexed jobId, string reason)',
  'event JobTimeoutUpdated(uint256 oldTimeout, uint256 newTimeout)',
  'event ProxyAuthorizationChanged(address indexed proxy, bool authorized)',
  'event ProxyFeeUpdated(address indexed proxy, uint256 oldFee, uint256 newFee)',

  // Read Functions
  'function getJobTimeout() external view returns (uint256)',
  'function getJob(bytes32 jobId) external view returns (tuple(address user, uint256 amount, bool completed, uint256 timestamp, bytes32 blobTxHash))',
  'function isJobExpired(bytes32 jobId) external view returns (bool)',
  'function getProxyFee(address proxy) external view returns (uint256)',
  'function jobs(bytes32) external view returns (address user, uint256 amount, bool completed, uint256 timestamp, bytes32 blobTxHash)',
  'function authorizedProxies(address) external view returns (bool)',
  'function proxyFees(address) external view returns (uint256)',
  'function owner() external view returns (address)',
  'function paused() external view returns (bool)',

  // Constants
  'function MAX_PROXY_FEE_PERCENT() external view returns (uint256)',
  'function DEFAULT_JOB_TIMEOUT() external view returns (uint256)',

  // Write Functions
  'function depositForBlob(bytes32 jobId) external payable',
  'function completeJob(bytes32 jobId, bytes32 blobTxHash, bytes calldata proof) external',
  'function refundExpiredJob(bytes32 jobId) external',
  'function setProxyFee(uint256 percent) external',

  // Owner Functions
  'function setJobTimeout(uint256 _timeout) external',
  'function setProxyAuthorization(address proxy, bool authorized) external',
  'function pause() external',
  'function unpause() external',
  'function emergencyWithdraw() external',
  'function transferOwnership(address newOwner) external',
  'function renounceOwnership() external'
] as const;

// TypeScript interfaces
export interface Job {
  user: string;
  amount: bigint;
  completed: boolean;
  timestamp: bigint;
  blobTxHash: string;
}

export interface CostEstimate {
  blobFee: bigint;
  gasFee: bigint;
  proxyFee: bigint;
  total: bigint;
}

/**
 * Contract addresses for a specific network
 */
export interface ContractAddresses {
  escrow: string;
}

/**
 * Contract addresses by network
 * These will be populated after contract deployment
 */
export const CONTRACT_ADDRESSES: Record<number, ContractAddresses> = {
  // Mainnet
  1: {
    escrow: process.env.BLOBKIT_ESCROW_MAINNET || '' // Set after mainnet deployment
  },
  // Sepolia testnet
  11155111: {
    escrow: process.env.BLOBKIT_ESCROW_SEPOLIA || '' // Set after testnet deployment
  },
  // Holesky testnet
  17000: {
    escrow: process.env.BLOBKIT_ESCROW_HOLESKY || '' // Set after testnet deployment
  }
};

/**
 * Get contract address for a specific network
 * @param chainId - Network chain ID
 * @param contract - Contract type
 * @returns Contract address
 * @throws Error if contract not deployed on network
 */
export function getContractAddress(chainId: number, contract: keyof ContractAddresses): string {
  const addresses = CONTRACT_ADDRESSES[chainId];
  if (!addresses) {
    throw new Error(`BlobKit contracts not deployed on chain ${chainId}`);
  }

  const address = addresses[contract];
  if (!address) {
    throw new Error(
      `${contract} contract not deployed on chain ${chainId}. Please set the appropriate environment variable.`
    );
  }

  return address;
}

// Error types
export enum EscrowErrorCode {
  JOB_ALREADY_EXISTS = 'JobAlreadyExists',
  JOB_NOT_FOUND = 'JobNotFound',
  JOB_ALREADY_COMPLETED = 'JobAlreadyCompleted',
  JOB_NOT_EXPIRED = 'JobNotExpired',
  UNAUTHORIZED_PROXY = 'UnauthorizedProxy',
  INVALID_PROXY_FEE = 'InvalidProxyFee',
  INVALID_JOB_TIMEOUT = 'InvalidJobTimeout',
  INVALID_PROOF = 'InvalidProof',
  TRANSFER_FAILED = 'TransferFailed',
  ZERO_AMOUNT = 'ZeroAmount'
}

// Event filter helpers
export const createJobCreatedFilter = (jobId?: string, user?: string) => {
  // JobCreated(bytes32 indexed jobId, address indexed user, uint256 amount)
  const topics = ['0xc9f761cef4b498085beaa83472253ad1dbcaa175c7e97bd6893d9da4b6ab0868'];
  if (jobId) topics.push(jobId);
  if (user) topics.push(user.toLowerCase().padEnd(66, '0'));
  return { topics };
};

export const createJobCompletedFilter = (jobId?: string) => {
  // JobCompleted(bytes32 indexed jobId, bytes32 blobTxHash, uint256 proxyFee)
  const topics = ['0x9bb5b9fff77191c79356e2cc9fbdb082cd52c3d60643ca121716890337f818e7'];
  if (jobId) topics.push(jobId);
  return { topics };
};

// Utility functions
export const calculateJobId = (user: string, payloadHash: string, nonce: number): string => {
  // This should match the job ID generation in the SDK
  return `${user.toLowerCase()}-${payloadHash}-${nonce}`;
};

export const formatEther = (wei: bigint): string => {
  return (Number(wei) / 1e18).toFixed(8);
};

export const parseEther = (eth: string): bigint => {
  return BigInt(Math.floor(parseFloat(eth) * 1e18));
};

// Export contract factory type for TypeScript usage
export type BlobKitEscrowContract = {
  address: string;
  abi: typeof BlobKitEscrowABI;
};

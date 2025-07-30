import { ProxyConfig } from './types.js';

/**
 * Loads configuration from environment variables with defaults
 */
export const loadConfig = (): ProxyConfig => {
  const rpcUrl = process.env.RPC_URL || process.env.ETHEREUM_RPC_URL;
  if (!rpcUrl) {
    throw new Error('RPC_URL environment variable is required');
  }

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY environment variable is required');
  }

  const escrowContract = process.env.ESCROW_CONTRACT;
  if (!escrowContract) {
    throw new Error('ESCROW_CONTRACT environment variable is required');
  }

  return {
    port: parseInt(process.env.PORT || '3000'),
    host: process.env.HOST || '0.0.0.0',
    rpcUrl,
    chainId: parseInt(process.env.CHAIN_ID || '1'),
    escrowContract,
    privateKey,
    proxyFeePercent: parseInt(process.env.PROXY_FEE_PERCENT || '0'),
    maxBlobSize: parseInt(process.env.MAX_BLOB_SIZE || '131072'), // 128KB
    rateLimitRequests: parseInt(process.env.RATE_LIMIT_REQUESTS || '10'),
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '60'), // 1 minute
    jobTimeout: parseInt(process.env.JOB_TIMEOUT || '300'), // 5 minutes
    logLevel: (process.env.LOG_LEVEL as any) || 'info'
  };
};

/**
 * Validates the configuration
 */
export const validateConfig = (config: ProxyConfig): void => {
  if (config.port <= 0 || config.port > 65535) {
    throw new Error('Invalid port number');
  }

  if (config.proxyFeePercent < 0 || config.proxyFeePercent > 10) {
    throw new Error('Proxy fee percent must be between 0 and 10');
  }

  if (config.maxBlobSize <= 0 || config.maxBlobSize > 131072) {
    throw new Error('Max blob size must be between 1 and 131072 bytes');
  }

  if (!/^0x[a-fA-F0-9]{64}$/.test(config.privateKey)) {
    throw new Error('Invalid private key format');
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(config.escrowContract)) {
    throw new Error('Invalid escrow contract address');
  }
}; 
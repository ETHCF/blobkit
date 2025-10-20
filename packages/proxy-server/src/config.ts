import { ProxyConfig } from './types.js';

/**
 * Loads configuration from environment variables with defaults
 */
export const loadConfig = (): ProxyConfig => {
  const rpcUrl = process.env.RPC_URL || process.env.ETHEREUM_RPC_URL;
  if (!rpcUrl) {
    throw new Error('RPC_URL environment variable is required');
  }

  // Private key is now optional - handled by secure signer
  const privateKey = process.env.PRIVATE_KEY || '';

  const escrowContract = process.env.ESCROW_CONTRACT;
  if (!escrowContract) {
    throw new Error('ESCROW_CONTRACT environment variable is required');
  }


  const httpProxyCount = parseInt(process.env.HTTP_PROXY_COUNT || '0');

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
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '60000'), // 60 seconds in milliseconds
    jobTimeout: parseInt(process.env.JOB_TIMEOUT || '300000'), // 5 minutes in milliseconds
    logLevel: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
    httpProxyCount
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

  // Private key validation is now handled by secure signer
  // Only validate if provided
  if (config.privateKey && !/^0x[a-fA-F0-9]{64}$/.test(config.privateKey)) {
    throw new Error('Invalid private key format');
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(config.escrowContract)) {
    throw new Error('Invalid escrow contract address');
  }

  if (config.rateLimitWindow < 1000 || config.rateLimitWindow > 3600000) {
    throw new Error('Rate limit window must be between 1 second and 1 hour (in milliseconds)');
  }

  if (config.jobTimeout < 60000 || config.jobTimeout > 86400000) {
    throw new Error('Job timeout must be between 1 minute and 24 hours (in milliseconds)');
  }

};

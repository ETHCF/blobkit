import dotenv from 'dotenv';
import { ethers } from 'ethers';
import { createApp } from './app.js';
import { loadConfig, validateConfig } from './config.js';
import { createLogger } from './utils/logger.js';
import { ProxyConfig } from './types.js';
import { createSecureSigner, loadSignerConfig } from './services/secure-signer.js';

// Load environment variables
dotenv.config();

const logger = createLogger('Server');

/**
 * Verify proxy is authorized in escrow contract
 */
async function verifyProxyAuthorization(config: ProxyConfig): Promise<void> {
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);

  // Use secure signer
  const signerConfig = loadSignerConfig();
  const secureSigner = await createSecureSigner(signerConfig, provider);
  const proxyAddress = await secureSigner.getAddress();

  // Check authorization in escrow contract with circuit breaker
  const escrowAbi = [
    'function authorizedProxies(address) view returns (bool)',
    'function isProxyAuthorized(address) view returns (bool)'
  ];
  const escrowContract = new ethers.Contract(config.escrowContract, escrowAbi, provider);


  try {
    // Try both method names for compatibility
    let isAuthorized = false;
    try {
      isAuthorized = await escrowContract.isProxyAuthorized(proxyAddress);
    } catch {
      // Fallback to old method name
      isAuthorized = await escrowContract.authorizedProxies(proxyAddress);
    }

    if (!isAuthorized) {
      throw new Error(
        `Proxy ${proxyAddress} is not authorized in escrow contract ${config.escrowContract}`
      );
    }
    logger.info(`Proxy ${proxyAddress} is authorized in escrow contract`);

  } catch (error) {
    if (error instanceof Error && error.message.includes('not authorized')) {
      logger.error('CRITICAL: Proxy is not authorized in escrow contract!');
      throw error;
    }
    if (error instanceof Error && error.message.includes('Circuit breaker')) {
      logger.error('CRITICAL: Cannot verify escrow contract - circuit breaker is OPEN');
      throw new Error(
        'Escrow contract is unreachable. Check RPC connection and contract deployment.'
      );
    }
    // Contract might not be deployed or have different interface
    logger.warn('Could not verify proxy authorization, proceeding anyway');
  }
}

/**
 * Starts the proxy server
 */
const startServer = async () => {
  try {
    // Load and validate configuration
    const config = loadConfig();
    validateConfig(config);

    logger.info('Starting BlobKit proxy server...', {
      port: config.port,
      host: config.host,
      chainId: config.chainId,
      escrowContract: config.escrowContract,
      proxyFeePercent: config.proxyFeePercent
    });

    // Create Express app and context with secure signer
    const { app, jobCompletionQueue } = await createApp(config);

    // Verify proxy authorization before starting
    await verifyProxyAuthorization(config);

    // Connect Redis and start server
    await jobCompletionQueue.connect();
    logger.info('Connected to Redis for persistent job queue');

    const server = app.listen(config.port, config.host, () => {
      logger.info(`Proxy server running on http://${config.host}:${config.port}`, {
        health: `/api/v1/health`,
        docs: `/docs`,
        blob: `/api/v1/blob/write`
      });

      // Start job completion queue after server is ready
      jobCompletionQueue.start();
      logger.info('Job completion retry queue started');
    });

    // Graceful shutdown
    const shutdown = (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

      // Stop job completion queue first
      jobCompletionQueue.stop();

      server.close(async () => {
        // Disconnect Redis
        await jobCompletionQueue.disconnect();
        logger.info('Server closed and Redis disconnected');
        process.exit(0);
      });

      // Force close after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

export { startServer };

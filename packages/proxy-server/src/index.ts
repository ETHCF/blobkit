import dotenv from 'dotenv';
import { createApp } from './app.js';
import { loadConfig, validateConfig } from './config.js';
import { createLogger } from './utils/logger.js';

// Load environment variables
dotenv.config();

const logger = createLogger('Server');

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

    // Create Express app
    const app = createApp(config);

    // Start server
    const server = app.listen(config.port, config.host, () => {
      logger.info(`Proxy server running on http://${config.host}:${config.port}`, {
        health: `/api/v1/health`,
        docs: `/docs`,
        blob: `/api/v1/blob/write`
      });
    });

    // Graceful shutdown
    const shutdown = (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      
      server.close(() => {
        logger.info('Server closed');
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
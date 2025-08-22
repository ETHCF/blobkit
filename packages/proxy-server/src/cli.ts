#!/usr/bin/env node

import { Command } from 'commander';
import { startServer } from './index.js';
import { loadConfig } from './config.js';
import { proxyLogger } from './utils/logger.js';

const logger = proxyLogger.child('cli');
const program = new Command();

program
  .name('blobkit-proxy')
  .description('BlobKit proxy server for blob transaction execution')
  .version('1.0.0');

program
  .command('start')
  .description('Start the proxy server')
  .option('-p, --port <number>', 'Port to listen on')
  .option('-h, --host <string>', 'Host to bind to')
  .option('--rpc-url <string>', 'Ethereum RPC URL')
  .option('--chain-id <number>', 'Chain ID')
  .option('--escrow-contract <string>', 'Escrow contract address')
  .option('--private-key <string>', 'Private key for proxy operations')
  .option('--proxy-fee <number>', 'Proxy fee percentage (0-10)')
  .action(async (options: Record<string, string>) => {
    try {
      // Override config with CLI options
      if (options.port) process.env.PORT = options.port;
      if (options.host) process.env.HOST = options.host;
      if (options.rpcUrl) process.env.RPC_URL = options.rpcUrl;
      if (options.chainId) process.env.CHAIN_ID = options.chainId;
      if (options.escrowContract) process.env.ESCROW_CONTRACT = options.escrowContract;
      if (options.privateKey) process.env.PRIVATE_KEY = options.privateKey;
      if (options.proxyFee) process.env.PROXY_FEE_PERCENT = options.proxyFee;

      await startServer();
    } catch (error) {
      logger.error('Failed to start proxy server:', error);
      process.exit(1);
    }
  });

program
  .command('health')
  .description('Check if a proxy server is healthy')
  .option('--url <string>', 'Proxy server URL', 'http://localhost:3000')
  .action(async (options: { url: string }) => {
    try {
      const response = await fetch(`${options.url}/api/v1/health`);
      const health = await response.json();

      logger.info('Proxy server health check', health);

      if (health.status === 'healthy') {
        logger.info('Proxy server is healthy');
        process.exit(0);
      } else {
        logger.warn('Proxy server is unhealthy');
        process.exit(1);
      }
    } catch (error) {
      logger.error('Failed to check proxy health', error as Error);
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Show current configuration')
  .action(() => {
    try {
      const config = loadConfig();
      logger.info('Current configuration', {
        ...config,
        privateKey: `${config.privateKey.substring(0, 6)}...`
      });
    } catch (error) {
      logger.error('Failed to load configuration:', error);
      process.exit(1);
    }
  });

program
  .command('dev-proxy')
  .description('Start a local development proxy server')
  .action(async () => {
    try {
      // Set development defaults
      process.env.NODE_ENV = 'development';
      process.env.PORT = process.env.PORT || '3000';
      process.env.HOST = process.env.HOST || 'localhost';
      process.env.RPC_URL = process.env.RPC_URL || 'http://localhost:8545';
      process.env.CHAIN_ID = process.env.CHAIN_ID || '31337';
      process.env.LOG_LEVEL = 'debug';
      process.env.PROXY_FEE_PERCENT = '0';

      logger.info('Starting development proxy server...');
      await startServer();
    } catch (error) {
      logger.error('Failed to start dev proxy:', error);
      process.exit(1);
    }
  });

program
  .command('simulate-payment')
  .description('Simulate a payment flow for testing')
  .requiredOption('--job-id <string>', 'Job ID to simulate payment for')
  .option('--amount <string>', 'Payment amount in ETH', '0.001')
  .action((options: { jobId: string; amount: string }) => {
    try {
      const config = loadConfig();
      logger.info(`Simulating payment for job ${options.jobId}`);
      logger.info(`Amount: ${options.amount} ETH`);
      logger.info(`Escrow contract: ${config.escrowContract}`);

      logger.info('Payment simulation completed.');
    } catch (error) {
      logger.error('Failed to simulate payment:', error);
      process.exit(1);
    }
  });

program
  .command('check-health')
  .description('Verify proxy connectivity and configuration')
  .option('--url <string>', 'Proxy server URL', 'http://localhost:3000')
  .action(async (options: { url: string }) => {
    try {
      const response = await fetch(`${options.url}/api/v1/health`);
      const health = await response.json();

      logger.info('Proxy Health Check', {
        status: health.status,
        version: health.version,
        chainId: health.chainId,
        escrowContract: health.escrowContract,
        proxyFeePercent: health.proxyFeePercent,
        maxBlobSize: health.maxBlobSize
      });

      if (health.status === 'healthy') {
        logger.info('Proxy is healthy and ready to accept requests');
        process.exit(0);
      } else {
        logger.error('Proxy is unhealthy');
        process.exit(1);
      }
    } catch (error) {
      logger.error('Failed to connect to proxy', error as Error);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();

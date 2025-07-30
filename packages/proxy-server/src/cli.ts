#!/usr/bin/env node

import { Command } from 'commander';
import { startServer } from './index.js';
import { loadConfig } from './config.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('CLI');
const program = new Command();

program
  .name('blobkit-proxy')
  .description('BlobKit proxy server for blob transaction execution')
  .version('0.0.1');

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
  .action(async (options) => {
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
  .action(async (options) => {
    try {
      const response = await fetch(`${options.url}/api/v1/health`);
      const health = await response.json();
      
      console.log('Proxy server health:', JSON.stringify(health, null, 2));
      
      if (health.status === 'healthy') {
        console.log('✅ Proxy server is healthy');
        process.exit(0);
      } else {
        console.log('❌ Proxy server is unhealthy');
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Failed to check proxy health:', error);
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Show current configuration')
  .action(() => {
    try {
      const config = loadConfig();
      console.log('Current configuration:');
      console.log(JSON.stringify({
        ...config,
        privateKey: config.privateKey.substring(0, 6) + '...' // Hide private key
      }, null, 2));
    } catch (error) {
      logger.error('Failed to load configuration:', error);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse(); 
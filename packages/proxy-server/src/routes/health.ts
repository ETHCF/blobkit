import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { HealthResponse, ProxyConfig } from '../types.js';
import { createLogger } from '../utils/logger.js';
import { circuitBreakerManager } from '../services/circuit-breaker.js';

const logger = createLogger('HealthRoute');

/**
 * Creates health check router
 */
export const createHealthRouter = (config: ProxyConfig, provider: ethers.Provider, signer: ethers.Signer) => {
  const router = Router();
  const startTime = Date.now();


   router.get('/health/details', async (req: Request, res: Response) => {
    try {
      const uptime = Math.floor((Date.now() - startTime) / 1000);
      let rpcHealthy = true;

      // Check blockchain connectivity
      let blocksLag: number | undefined;
      try {
        const latestBlock = await provider.getBlockNumber();
        const currentTime = Math.floor(Date.now() / 1000);
        const block = await provider.getBlock(latestBlock);
        if (block) {
          blocksLag = Math.max(0, Math.floor((currentTime - block.timestamp) / 12)); // Assuming 12s block time
        }
      } catch (error) {
        logger.warn('Failed to check blockchain connectivity:', error as Error);
        rpcHealthy = false;
      }

      // Check circuit breakers
      const circuitMetrics = circuitBreakerManager.getAllMetrics();
      const hasOpenCircuits = circuitBreakerManager.hasOpenCircuits();

      const response: HealthResponse = {
        status: hasOpenCircuits || !rpcHealthy ? 'degraded' : 'healthy',
        version: '0.0.1',
        chainId: config.chainId,
        signer: await signer.getAddress(),
        escrowContract: config.escrowContract,
        proxyFeePercent: config.proxyFeePercent,
        maxBlobSize: config.maxBlobSize,
        uptime,
        blocksLag,
        rpcHealthy,
        circuitBreakers: circuitMetrics
      };

      res.json(response);
    } catch (error) {
      logger.error('Health check failed:', error);

      const response: HealthResponse = {
        status: 'unhealthy',
        version: '0.0.1',
        chainId: config.chainId,
        signer: await signer.getAddress(),
        escrowContract: config.escrowContract,
        proxyFeePercent: config.proxyFeePercent,
        maxBlobSize: config.maxBlobSize,
        rpcHealthy: false,
        uptime: Math.floor((Date.now() - startTime) / 1000)
      };

      res.status(503).json(response);
    }
  });

  router.get('/health', async (req: Request, res: Response) => {
    try {
      const uptime = Math.floor((Date.now() - startTime) / 1000);

      // Check circuit breakers
      const circuitMetrics = circuitBreakerManager.getAllMetrics();
      const hasOpenCircuits = circuitBreakerManager.hasOpenCircuits();

      const response: HealthResponse = {
        status: hasOpenCircuits ? 'degraded' : 'healthy',
        version: '0.0.1',
        chainId: config.chainId,
        signer: await signer.getAddress(),
        escrowContract: config.escrowContract,
        proxyFeePercent: config.proxyFeePercent,
        maxBlobSize: config.maxBlobSize,
        uptime,
        circuitBreakers: circuitMetrics
      };

      res.json(response);
    } catch (error) {
      logger.error('Health check failed:', error);

      const response: HealthResponse = {
        status: 'unhealthy',
        version: '0.0.1',
        chainId: config.chainId,
        signer: await signer.getAddress(),
        escrowContract: config.escrowContract,
        proxyFeePercent: config.proxyFeePercent,
        maxBlobSize: config.maxBlobSize,
        uptime: Math.floor((Date.now() - startTime) / 1000)
      };

      res.status(503).json(response);
    }
  });

  return router;
};

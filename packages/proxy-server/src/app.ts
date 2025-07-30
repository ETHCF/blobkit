import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { ethers } from 'ethers';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';
import { fileURLToPath } from 'url';

import { ProxyConfig } from './types.js';
import { PaymentVerifier } from './services/payment-verifier.js';
import { BlobExecutor } from './services/blob-executor.js';
import { createRateLimit } from './middleware/rate-limit.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createHealthRouter } from './routes/health.js';
import { createBlobRouter } from './routes/blob.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('App');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Creates and configures the Express application
 */
export const createApp = (config: ProxyConfig) => {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors({
    origin: process.env.CORS_ORIGIN || true,
    credentials: true
  }));

  // Request parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Rate limiting
  const rateLimiter = createRateLimit(config.rateLimitRequests, config.rateLimitWindow);
  app.use('/api/', rateLimiter);

  // Request logging
  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    next();
  });

  // Initialize services
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const signer = new ethers.Wallet(config.privateKey, provider);
  const paymentVerifier = new PaymentVerifier(config.rpcUrl, config.escrowContract);
  const blobExecutor = new BlobExecutor(config.rpcUrl, config.chainId, signer);

  // API routes
  app.use('/api/v1', createHealthRouter(config, provider));
  app.use('/api/v1/blob', createBlobRouter(config, paymentVerifier, blobExecutor, signer));

  // Swagger documentation
  try {
    const swaggerPath = path.join(__dirname, '..', 'openapi.yaml');
    const swaggerDocument = YAML.load(swaggerPath);
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  } catch (error) {
    logger.warn('Failed to load OpenAPI documentation:', error);
  }

  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      name: '@blobkit/proxy-server',
      version: '0.0.1',
      description: 'BlobKit proxy server for blob transaction execution',
      endpoints: {
        health: '/api/v1/health',
        blobWrite: '/api/v1/blob/write',
        docs: '/docs'
      }
    });
  });

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}; 
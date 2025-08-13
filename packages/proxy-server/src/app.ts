import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { ethers } from 'ethers';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';

import { ProxyConfig } from './types.js';
import { PaymentVerifier } from './services/payment-verifier.js';
import { BlobExecutor } from './services/blob-executor.js';
import { PersistentJobQueue } from './services/persistent-job-queue.js';
import { createRateLimit } from './middleware/rate-limit.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { tracingMiddleware } from './middleware/tracing.js';
import { createSignatureVerification } from './middleware/signature-verification.js';
import { createHealthRouter } from './routes/health.js';
import { createBlobRouter } from './routes/blob.js';
import { createMetricsRouter } from './routes/metrics.js';
import { createLogger } from './utils/logger.js';
import { createSecureSigner, loadSignerConfig } from './services/secure-signer.js';
import { wrapAsEthersSigner } from './services/ethers-signer-wrapper.js';
import { metricsMiddleware } from './monitoring/prometheus-metrics.js';

const logger = createLogger('App');

// Get dirname for ES modules/CommonJS compatibility
const getDirname = (): string => {
  // In Node.js/CommonJS environments
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }

  // Fallback for environments without __dirname
  return process.cwd();
};

/**
 * Creates and configures the Express application
 */
export interface AppContext {
  app: express.Application;
  jobCompletionQueue: PersistentJobQueue;
}

export const createApp = async (config: ProxyConfig): Promise<AppContext> => {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || true,
      credentials: true
    })
  );

  // Request parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Distributed tracing middleware - must come early
  app.use(tracingMiddleware('blobkit-proxy'));

  // Metrics middleware
  app.use(metricsMiddleware());

  // Rate limiting
  const rateLimiter = createRateLimit(config.rateLimitRequests, config.rateLimitWindow);
  app.use('/api/v1/blob', rateLimiter);

  // Signature verification for blob endpoints (always required)
  const signatureVerifier = createSignatureVerification({
    secret: config.requestSigningSecret,
    required: true
  });
  app.use('/api/v1/blob', signatureVerifier);

  // Request logging (now includes trace context from tracing middleware)
  app.use('/api/v1/blob', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.info(`${req.method} ${req.path}`, {
      traceId: req.traceId,
      spanId: req.spanId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    next();
  });

  // Initialize services with secure signer
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);

  // Create secure signer
  const signerConfig = loadSignerConfig();
  const secureSigner = await createSecureSigner(signerConfig, provider);

  // Wrap as ethers.Signer for compatibility
  const signer = wrapAsEthersSigner(secureSigner, provider);

  const paymentVerifier = new PaymentVerifier(config.rpcUrl, config.escrowContract);
  const blobExecutor = new BlobExecutor(
    config.rpcUrl,
    config.chainId,
    signer,
    config.kzgTrustedSetupPath
  );
  const jobCompletionQueue = new PersistentJobQueue(paymentVerifier, signer);

  // Note: jobCompletionQueue.start() is called after server starts listening

  // API routes
  app.use('/api/v1', createHealthRouter(config, provider, signer));
  app.use(
    '/api/v1/blob',
    createBlobRouter(config, paymentVerifier, blobExecutor, jobCompletionQueue, signer)
  );

  // Metrics endpoint (not under /api to avoid rate limiting)
  app.use('/metrics', createMetricsRouter());

  // Swagger documentation (skip in test environment)
  if (process.env.NODE_ENV !== 'test') {
    try {
      const swaggerPath = process.env.SWAGGER_PATH || path.join(getDirname(),  'openapi.yaml');
      const swaggerDocument = YAML.load(swaggerPath);
      app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    } catch (error) {
      logger.warn('Failed to load OpenAPI documentation:', error as Error);
    }
  }

  // Root endpoint
  app.get('/', (req: express.Request, res: express.Response) => {
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

  return { app, jobCompletionQueue };
};

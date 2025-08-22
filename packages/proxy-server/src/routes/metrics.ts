/**
 * Metrics endpoint for Prometheus scraping
 */

import { Router, Request, Response } from 'express';
import { getPrometheusMetrics } from '../monitoring/prometheus-metrics.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('MetricsRoute');

export function createMetricsRouter(): Router {
  const router = Router();
  const metrics = getPrometheusMetrics();

  /**
   * GET /metrics
   * Prometheus metrics endpoint
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const metricsData = await metrics.getMetrics();
      res.set('Content-Type', metrics.getContentType());
      res.end(metricsData);
    } catch (error) {
      logger.error('Failed to generate metrics', {
        error: error instanceof Error ? error.message : String(error)
      });
      res.status(500).json({ error: 'Failed to generate metrics' });
    }
  });

  return router;
}

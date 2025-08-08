import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { ProxyErrorCode } from '../types.js';

/**
 * Creates rate limiting middleware
 */
export const createRateLimit = (requests: number, windowMs: number) => {
  return rateLimit({
    windowMs: windowMs * 1000, // Convert to milliseconds
    max: requests,
    message: {
      error: ProxyErrorCode.RATE_LIMIT_EXCEEDED,
      message: `Too many requests, limit is ${requests} requests per ${windowMs} seconds`
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      res.status(429).json({
        error: ProxyErrorCode.RATE_LIMIT_EXCEEDED,
        message: `Too many requests, limit is ${requests} requests per ${windowMs} seconds`
      });
    }
  });
};

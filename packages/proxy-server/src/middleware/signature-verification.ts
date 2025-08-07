/**
 * Signature verification middleware
 *
 * Verifies HMAC signatures on incoming requests from SDK clients
 * to ensure requests are authentic and haven't been tampered with
 */

import { Request, Response, NextFunction } from 'express';
import { verifySignature } from '../utils/signature.js';
import { ProxyError, ProxyErrorCode } from '../types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('SignatureVerification');

export interface SignatureVerificationConfig {
  secret: string;
  required: boolean;
}

/**
 * Create signature verification middleware
 *
 * @param config Verification configuration
 * @returns Express middleware function
 */
export function createSignatureVerification(config: SignatureVerificationConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip verification if not required and no signature present
    const signatureHeader = req.headers['x-blobkit-signature'] as string;
    if (!config.required && !signatureHeader) {
      logger.debug('Signature verification skipped - not required and no signature present');
      return next();
    }

    // Extract signature components from headers
    const timestamp = parseInt(req.headers['x-blobkit-timestamp'] as string, 10);
    const nonce = req.headers['x-blobkit-nonce'] as string;

    // Validate required headers are present
    if (!signatureHeader || !timestamp || !nonce) {
      logger.warn('Missing signature headers', {
        hasSignature: !!signatureHeader,
        hasTimestamp: !!timestamp,
        hasNonce: !!nonce,
        ip: req.ip
      });

      return next(
        new ProxyError(ProxyErrorCode.INVALID_REQUEST, 'Missing required signature headers', 401)
      );
    }

    // Verify the signature
    try {
      const isValid = verifySignature(req.body, signatureHeader, timestamp, nonce, config.secret);

      if (!isValid) {
        logger.warn('Invalid signature', {
          ip: req.ip,
          path: req.path,
          timestamp: new Date(timestamp).toISOString()
        });

        return next(
          new ProxyError(ProxyErrorCode.INVALID_REQUEST, 'Invalid request signature', 401)
        );
      }

      // Signature is valid - add verification info to request
      // Extend request object with verification info
      interface SignedRequest extends Request {
        signatureVerified?: boolean;
        signatureTimestamp?: number;
      }
      (req as SignedRequest).signatureVerified = true;
      (req as SignedRequest).signatureTimestamp = timestamp;

      logger.debug('Signature verified successfully', {
        ip: req.ip,
        path: req.path
      });

      next();
    } catch (error) {
      logger.error('Signature verification failed', {
        error: error instanceof Error ? error.message : String(error),
        ip: req.ip
      });

      return next(new ProxyError(ProxyErrorCode.INTERNAL_ERROR, 'Failed to verify signature', 500));
    }
  };
}

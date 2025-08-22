import { Request, Response, NextFunction } from 'express';
import { ProxyError, ProxyErrorCode, ErrorResponse } from '../types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ErrorHandler');

/**
 * Global error handling middleware
 */
export const errorHandler = (
  err: Error | ProxyError,
  req: Request,
  res: Response,
  _next: NextFunction
): Response => {
  // Log the error
  logger.error('Request error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Handle ProxyError instances
  if (err instanceof ProxyError) {
    const response: ErrorResponse = {
      error: err.code,
      message: err.message,
      details: err.details
    };

    return res.status(err.statusCode).json(response);
  }

  // Handle validation errors from express-validator
  if (err.name === 'ValidationError') {
    const response: ErrorResponse = {
      error: ProxyErrorCode.INVALID_REQUEST,
      message: err.message
    };

    return res.status(400).json(response);
  }

  // Handle other known error types
  if (err.name === 'SyntaxError' && 'body' in err) {
    const response: ErrorResponse = {
      error: ProxyErrorCode.INVALID_REQUEST,
      message: 'Invalid JSON in request body'
    };

    return res.status(400).json(response);
  }

  // Default internal server error
  const response: ErrorResponse = {
    error: ProxyErrorCode.INTERNAL_ERROR,
    message: 'Internal server error'
  };

  return res.status(500).json(response);
};

/**
 * 404 handler for unknown routes
 */
export const notFoundHandler = (req: Request, res: Response) => {
  const response: ErrorResponse = {
    error: ProxyErrorCode.INVALID_REQUEST,
    message: `Route ${req.method} ${req.path} not found`
  };

  res.status(404).json(response);
};

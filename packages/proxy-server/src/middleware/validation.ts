import { body, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import { ProxyError, ProxyErrorCode } from '../types.js';

/**
 * Validation rules for blob write requests
 */
export const validateBlobWrite = [
  body('jobId')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('jobId must be a non-empty string'),
  
  body('paymentTxHash')
    .isString()
    .matches(/^0x[a-fA-F0-9]{64}$/)
    .withMessage('paymentTxHash must be a valid transaction hash'),
  
  body('payload')
    .isArray()
    .custom((value) => {
      if (!Array.isArray(value)) return false;
      if (value.length === 0) return false;
      if (value.length > 131072) return false; // 128KB limit
      return value.every(v => Number.isInteger(v) && v >= 0 && v <= 255);
    })
    .withMessage('payload must be an array of bytes (0-255) with max 131072 elements'),
  
  body('meta')
    .isObject()
    .withMessage('meta must be an object'),
  
  body('meta.appId')
    .isString()
    .isLength({ min: 1, max: 50 })
    .withMessage('meta.appId must be a non-empty string'),
  
  body('meta.codec')
    .isString()
    .isLength({ min: 1, max: 50 })
    .withMessage('meta.codec must be a non-empty string'),
  
  body('meta.contentHash')
    .optional()
    .isString()
    .matches(/^(0x)?[a-fA-F0-9]{64}$/)
    .withMessage('meta.contentHash must be a valid SHA-256 hash'),
  
  body('meta.ttlBlocks')
    .optional()
    .isInt({ min: 1, max: 1000000 })
    .withMessage('meta.ttlBlocks must be a positive integer'),
  
  body('meta.timestamp')
    .optional()
    .isInt({ min: 0 })
    .withMessage('meta.timestamp must be a non-negative integer'),
  
  body('meta.filename')
    .optional()
    .isString()
    .isLength({ max: 255 })
    .withMessage('meta.filename must be a string with max 255 characters'),
  
  body('meta.contentType')
    .optional()
    .isString()
    .isLength({ max: 100 })
    .withMessage('meta.contentType must be a string with max 100 characters'),
  
  body('meta.tags')
    .optional()
    .isArray()
    .custom((value) => {
      if (!Array.isArray(value)) return false;
      if (value.length > 10) return false;
      return value.every(tag => typeof tag === 'string' && tag.length <= 50);
    })
    .withMessage('meta.tags must be an array of strings (max 10 items, 50 chars each)')
];

/**
 * Middleware to handle validation errors
 */
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const firstError = errors.array()[0];
    throw new ProxyError(
      ProxyErrorCode.INVALID_REQUEST,
      `Validation error: ${firstError.msg}`,
      400,
      { field: 'path' in firstError ? firstError.path : 'unknown', value: 'value' in firstError ? firstError.value : 'unknown' }
    );
  }
  
  next();
}; 
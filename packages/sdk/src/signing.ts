/**
 * Request signing utilities for secure SDK-proxy communication
 *
 * Uses HMAC-SHA256 for request authentication to ensure:
 * - Requests originate from authorized SDK instances
 * - Request content hasn't been tampered with
 * - Protection against replay attacks via timestamps
 */

import * as crypto from 'crypto';
import { BlobKitError, BlobKitErrorCode } from './types.js';

const SIGNATURE_VERSION = 'v1';
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

export interface SignedRequest {
  signature: string;
  timestamp: number;
  nonce: string;
}

/**
 * Sign a request payload for proxy authentication
 *
 * @param payload Request body to sign
 * @param secret Shared secret for HMAC
 * @returns Signature components for request header
 */
export function signRequest(payload: unknown, secret: string): SignedRequest {
  if (!secret || secret.length < 32) {
    throw new BlobKitError(
      BlobKitErrorCode.INVALID_CONFIG,
      'Request signing secret must be at least 32 characters'
    );
  }

  const timestamp = Date.now();
  const nonce = generateNonce();
  const message = createSignatureMessage(payload, timestamp, nonce);

  const signature = crypto.createHmac('sha256', secret).update(message).digest('hex');

  return {
    signature: `${SIGNATURE_VERSION}:${signature}`,
    timestamp,
    nonce
  };
}

/**
 * Verify a signed request from SDK
 *
 * @param payload Request body
 * @param signatureHeader Signature from request header
 * @param timestamp Timestamp from request header
 * @param nonce Nonce from request header
 * @param secret Shared secret for HMAC
 * @returns True if signature is valid
 */
export function verifySignature(
  payload: unknown,
  signatureHeader: string,
  timestamp: number,
  nonce: string,
  secret: string
): boolean {
  // Check timestamp to prevent replay attacks
  const now = Date.now();
  if (Math.abs(now - timestamp) > TIMESTAMP_TOLERANCE_MS) {
    return false;
  }

  // Parse signature version
  const [version, signature] = signatureHeader.split(':');
  if (version !== SIGNATURE_VERSION) {
    return false;
  }

  // Recreate signature and compare
  const message = createSignatureMessage(payload, timestamp, nonce);
  const expectedSignature = crypto.createHmac('sha256', secret).update(message).digest('hex');

  // Constant-time comparison to prevent timing attacks
  return timingSafeEqual(signature, expectedSignature);
}

/**
 * Create the message to be signed
 * Combines payload, timestamp, and nonce in a deterministic way
 */
function createSignatureMessage(payload: unknown, timestamp: number, nonce: string): string {
  const payloadStr =
    typeof payload === 'string'
      ? payload
      : JSON.stringify(payload, Object.keys(payload as object).sort());

  return `${timestamp}:${nonce}:${payloadStr}`;
}

/**
 * Generate a cryptographically secure nonce
 */
function generateNonce(): string {
  const buffer = new Uint8Array(16);

  // In browser environments, use Web Crypto API
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(buffer);
  } else {
    // In Node.js, use crypto.randomFillSync
    crypto.randomFillSync(buffer);
  }

  return Array.from(buffer, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

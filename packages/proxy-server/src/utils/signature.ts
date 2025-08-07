/**
 * Signature verification utilities for proxy server
 *
 * Verifies HMAC-SHA256 signatures from SDK requests
 */

import { createHmac } from 'crypto';

const SIGNATURE_VERSION = 'v1';
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

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
  const expectedSignature = createHmac('sha256', secret).update(message).digest('hex');

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

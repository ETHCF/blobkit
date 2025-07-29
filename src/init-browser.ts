/**
 * Browser-specific initialization
 * This file contains NO Node.js imports to ensure clean browser bundles
 */

import { loadTrustedSetup, createMockSetup } from './kzg';
import { BlobKit } from './client';
import { BlobKitError } from './types';
import { fetchTrustedSetupWithFallbacks, createMinimalSetup } from './kzg/embedded-setup';

// Singleton tracking for browser initialization
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize with mock trusted setup for development.
 * ⚠️ DO NOT use in production - uses known tau value.
 */
export async function initializeForDevelopment(): Promise<void> {
  const setup = createMockSetup();
  loadTrustedSetup(setup);
}

/**
 * Initialize with Ethereum mainnet trusted setup (auto-download).
 * Works seamlessly in browser environments.
 * Safe for production use.
 */
export async function initialize(): Promise<void> {
  // Check if already initialized
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      // Try to fetch from CDN with fallbacks
      const data = await fetchTrustedSetupWithFallbacks();
      const setup = await parseMainnetTrustedSetup(data);
      loadTrustedSetup(setup);
      // Successfully loaded official Ethereum trusted setup
      return;
    } catch (e) {
      console.warn('BlobKit: Failed to download trusted setup, using minimal setup', e);
      // Use minimal setup as fallback
      const minimalSetup = createMinimalSetup();
      loadTrustedSetup(minimalSetup);
      console.warn('BlobKit: Using minimal trusted setup - for development only!');
      return;
    }
  })();

  return initializationPromise;
}

/**
 * Initialize with official Ethereum KZG trusted setup.
 * For browser environments, use initializeForBrowser instead.
 */
export async function initializeForProduction(
  _g1Path: string,
  _g2Path: string,
  _format: 'binary' | 'text' = 'text'
): Promise<void> {
  throw new BlobKitError(
    'File-based initialization not supported in browser. Use initializeForBrowser() or initialize() instead.',
    'BROWSER_NOT_SUPPORTED'
  );
}

/**
 * Initialize with trusted setup from URLs for browser environments.
 * Fetches trusted setup files and loads them into memory.
 */
export async function initializeForBrowser(options: {
  g1Url: string;
  g2Url: string;
  format?: 'binary' | 'text' | 'combined';
  timeout?: number;
  g1Hash?: string; // Optional SHA-256 for verification
  g2Hash?: string;
}): Promise<void> {
  const format = options.format || 'text';
  const timeout = options.timeout || 30000;

  // Singleton pattern to prevent concurrent initialization
  if (initializationPromise) return initializationPromise;
  
  initializationPromise = (async () => {
    // Handle special 'combined' format
    if (options.format === 'combined') {
      return initializeFromCombinedFile(options);
    }
    
    // Enhanced URL validation
    try {
      const g1Url = new URL(options.g1Url);
      const g2Url = new URL(options.g2Url);
      
      if (g1Url.protocol !== 'https:' || g2Url.protocol !== 'https:') {
        throw new BlobKitError(
          'Trusted setup URLs must use HTTPS for security',
          'INSECURE_URL'
        );
      }

      // Check for credentials in URL (security risk)
      if (g1Url.username || g1Url.password || g2Url.username || g2Url.password) {
        throw new BlobKitError(
          'URLs must not contain credentials',
          'CREDENTIALS_IN_URL'
        );
      }
    } catch (e) {
      if (e instanceof BlobKitError) throw e;
      throw new BlobKitError('Invalid URLs provided', 'INVALID_URL');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Fetch with retry logic
      const [g1Response, g2Response] = await Promise.all([
        fetchWithRetry(options.g1Url, controller.signal),
        fetchWithRetry(options.g2Url, controller.signal)
      ]);

      // Validate responses
      validateResponse(g1Response, 'G1', format, 250000);
      validateResponse(g2Response, 'G2', format, 1000);

      // Convert to Uint8Array
      const g1Data = new Uint8Array(await g1Response.arrayBuffer());
      const g2Data = new Uint8Array(await g2Response.arrayBuffer());

      // Verify hashes if provided
      if (options.g1Hash) await verifyHash(g1Data, options.g1Hash, 'G1');
      if (options.g2Hash) await verifyHash(g2Data, options.g2Hash, 'G2');

      // Load trusted setup
      const { loadTrustedSetupFromBinary, loadTrustedSetupFromText } = await import('./kzg/setup');

      const setup = format === 'binary'
        ? await loadTrustedSetupFromBinary(g1Data, g2Data)
        : await loadTrustedSetupFromText(g1Data, g2Data);

      loadTrustedSetup(setup);

    } catch (error) {
      // Reset singleton on error to allow retry
      initializationPromise = null;
      
      if (error instanceof BlobKitError) {
        throw error;
      }
      
      // Enhanced error handling
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new BlobKitError(
            `Request timeout after ${timeout}ms`,
            'FETCH_TIMEOUT'
          );
        }
        
        if (error.message.includes('fetch')) {
          throw new BlobKitError(
            `Network error: ${error.message}`,
            'NETWORK_ERROR',
            error
          );
        }
      }

      throw new BlobKitError(
        `Failed to initialize browser trusted setup: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'BROWSER_INIT_ERROR',
        error instanceof Error ? error : undefined
      );
    } finally {
      clearTimeout(timeoutId);
    }
  })();

  return initializationPromise;
}

/**
 * Create BlobKit instance from environment variables.
 * Not supported in browser environments.
 */
export function createFromEnv(): BlobKit {
  throw new BlobKitError(
    'Environment variable initialization not supported in browser',
    'BROWSER_NOT_SUPPORTED'
  );
}

/**
 * Create read-only BlobKit instance from environment variables.
 * Not supported in browser environments.
 */
export function createReadOnlyFromEnv(): BlobKit {
  throw new BlobKitError(
    'Environment variable initialization not supported in browser',
    'BROWSER_NOT_SUPPORTED'
  );
}

// Helper functions (same as in init.ts but without Node.js dependencies)

function validateResponse(response: Response, type: string, format: string, maxSize: number): void {
  if (!response.ok) {
    throw new BlobKitError(
      `Failed to fetch ${type} setup: HTTP ${response.status}`,
      `${type}_FETCH_ERROR`
    );
  }

  // Validate content type
  const contentType = response.headers.get('content-type');
  if (format === 'binary' && contentType && !contentType.includes('application/octet-stream')) {
    throw new BlobKitError(
      `Invalid content type for binary ${type} data: ${contentType}`,
      'INVALID_CONTENT_TYPE'
    );
  }

  // Validate file size
  const contentLength = parseInt(response.headers.get('content-length') || '0');
  if (contentLength > maxSize) {
    throw new BlobKitError(
      `${type} file too large: ${contentLength} bytes (max: ${maxSize})`,
      'FILE_TOO_LARGE'
    );
  }
}

async function fetchWithRetry(url: string, signal: AbortSignal, maxRetries: number = 3): Promise<Response> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fetch(url, { signal });
    } catch (error) {
      lastError = error as Error;
      
      if (signal.aborted || attempt === maxRetries) {
        throw error;
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
    }
  }
  
  throw lastError!;
}

async function verifyHash(data: Uint8Array, expectedHash: string, type: string): Promise<void> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  const hashHex = Array.from(hashArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
    
  if (hashHex !== expectedHash.toLowerCase().replace('0x', '')) {
    throw new BlobKitError(
      `${type} hash verification failed`,
      'HASH_MISMATCH'
    );
  }
}

async function parseMainnetTrustedSetup(data: string): Promise<any> {
  const lines = data.trim().split('\n');
  
  // First line is number of G1 points (4096)
  const g1Count = parseInt(lines[0]);
  // Second line is number of G2 points (65)
  const g2Count = parseInt(lines[1]);
  
  // Extract points
  const g1Lines = lines.slice(2, 2 + g1Count);
  const g2Lines = lines.slice(2 + g1Count, 2 + g1Count + g2Count);
  
  // BlobKit only needs first 2 G2 points
  const g2LinesForBlobKit = g2Lines.slice(0, 2);
  
  // Keep original format without 0x prefix
  const g1Text = g1Lines.join('\n');
  const g2Text = g2LinesForBlobKit.join('\n');
  
  // Create Uint8Arrays from text
  const g1Data = new TextEncoder().encode(g1Text);
  const g2Data = new TextEncoder().encode(g2Text);
  
  // Parse using existing functions
  const { loadTrustedSetupFromText } = await import('./kzg/setup');
  return await loadTrustedSetupFromText(g1Data, g2Data);
}

async function initializeFromCombinedFile(options: {
  g1Url: string;
  g2Url: string;
  format?: string;
  timeout?: number;
  g1Hash?: string;
  g2Hash?: string;
}): Promise<void> {
  const timeout = options.timeout || 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Fetch the combined file
    const response = await fetchWithRetry(options.g1Url, controller.signal);
    
    if (!response.ok) {
      throw new BlobKitError(
        `Failed to fetch trusted setup: HTTP ${response.status}`,
        'FETCH_ERROR'
      );
    }
    
    // Read as text
    const data = await response.text();
    
    // Parse the mainnet format
    const lines = data.trim().split('\n');
    const g1Count = parseInt(lines[0]);
    const g2Count = parseInt(lines[1]);
    
    // Extract points
    const g1Lines = lines.slice(2, 2 + g1Count);
    const g2Lines = lines.slice(2 + g1Count, 2 + g1Count + g2Count);
    
    // BlobKit only needs first 2 G2 points
    const g2LinesForBlobKit = g2Lines.slice(0, 2);
    
    // Keep original format without 0x prefix
    const g1Text = g1Lines.join('\n');
    const g2Text = g2LinesForBlobKit.join('\n');
    
    // Create Uint8Arrays
    const g1Data = new TextEncoder().encode(g1Text);
    const g2Data = new TextEncoder().encode(g2Text);
    
    // Load trusted setup
    const { loadTrustedSetupFromText } = await import('./kzg/setup');
    const setup = await loadTrustedSetupFromText(g1Data, g2Data);
    loadTrustedSetup(setup);
    
  } catch (error) {
    // Reset singleton on error to allow retry
    initializationPromise = null;
    
    if (error instanceof BlobKitError) {
      throw error;
    }
    
    throw new BlobKitError(
      `Failed to initialize trusted setup: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'INIT_ERROR',
      error instanceof Error ? error : undefined
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
import { loadTrustedSetup, createMockSetup } from './kzg';
import { BlobKit } from './client';
import { BlobKitConfig, BlobKitError } from './types';

// Constants
const MAX_G1_SIZE = 250_000; // ~196KB + overhead
const MAX_G2_SIZE = 1_000; // ~192 bytes + overhead
const DEFAULT_TIMEOUT_MS = 30_000;

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
 * Initialize with official Ethereum KZG trusted setup.
 * Download files from: https://github.com/ethereum/kzg-ceremony-sequencer
 */
export async function initializeForProduction(
  g1Path: string,
  g2Path: string,
  format: 'binary' | 'text' = 'text'
): Promise<void> {
  const { loadTrustedSetupFromBinary, loadTrustedSetupFromText } = await import('./kzg/setup');

  const setup = format === 'binary'
    ? await loadTrustedSetupFromBinary(g1Path, g2Path)
    : await loadTrustedSetupFromText(g1Path, g2Path);

  loadTrustedSetup(setup);
}

/**
 * Initialize with trusted setup from URLs for browser environments.
 * Fetches trusted setup files and loads them into memory.
 */
export async function initializeForBrowser(options: {
  g1Url: string;
  g2Url: string;
  format?: 'binary' | 'text';
  timeout?: number;
  g1Hash?: string; // Optional SHA-256 for verification
  g2Hash?: string;
}): Promise<void> {
  const format = options.format || 'text';
  const timeout = options.timeout || DEFAULT_TIMEOUT_MS;

  // Singleton pattern to prevent concurrent initialization
  if (initializationPromise) return initializationPromise;
  
  initializationPromise = (async () => {
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

      // Validate hostnames (no localhost in production)
      // Use typeof check for browser compatibility
      const isProduction = typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';
      if (isProduction) {
        if (g1Url.hostname === 'localhost' || g2Url.hostname === 'localhost' || 
            g1Url.hostname === '127.0.0.1' || g2Url.hostname === '127.0.0.1') {
          throw new BlobKitError(
            'Localhost URLs not allowed in production',
            'LOCALHOST_IN_PRODUCTION'
          );
        }
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
      validateResponse(g1Response, 'G1', format, MAX_G1_SIZE);
      validateResponse(g2Response, 'G2', format, MAX_G2_SIZE);

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

// Helper function for response validation
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

// Helper function for fetch with retry
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

// Helper function for hash verification
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

/**
 * Validates environment variable values for common issues.
 */
function validateEnvironmentVariables(config: BlobKitConfig, privateKey?: string): void {
  // Validate RPC URL format
  if (!config.rpcUrl.match(/^https?:\/\/.+/)) {
    throw new BlobKitError('Invalid RPC_URL format', 'INVALID_RPC_URL');
  }

  // Validate chain ID
  if (config.chainId !== undefined && (config.chainId < 1 || config.chainId > 4294967295)) {
    throw new BlobKitError('Invalid CHAIN_ID: must be between 1 and 2^32-1', 'INVALID_CHAIN_ID');
  }

  // Validate compression level
  if (config.compressionLevel !== undefined && (config.compressionLevel < 0 || config.compressionLevel > 11)) {
    throw new BlobKitError('Invalid COMPRESSION_LEVEL: must be between 0 and 11', 'INVALID_COMPRESSION_LEVEL');
  }

  // Validate private key format if provided
  if (privateKey !== undefined) {
    if (!privateKey.match(/^0x[0-9a-fA-F]{64}$/)) {
      throw new BlobKitError('Invalid PRIVATE_KEY format: must be 0x followed by 64 hex characters', 'INVALID_PRIVATE_KEY');
    }
  }

  // Validate archive URL format if provided
  if (config.archiveUrl && !config.archiveUrl.match(/^https?:\/\/.+/)) {
    throw new BlobKitError('Invalid ARCHIVE_URL format', 'INVALID_ARCHIVE_URL');
  }
}

/**
 * Safely parse integer from environment variable with validation.
 */
function parseIntegerFromEnv(value: string | undefined, min?: number, max?: number): number | undefined {
  if (!value) return undefined;
  
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new BlobKitError(`Invalid integer value: ${value}`, 'INVALID_INTEGER');
  }
  
  if (min !== undefined && parsed < min) {
    throw new BlobKitError(`Value ${parsed} is below minimum ${min}`, 'VALUE_TOO_LOW');
  }
  
  if (max !== undefined && parsed > max) {
    throw new BlobKitError(`Value ${parsed} is above maximum ${max}`, 'VALUE_TOO_HIGH');
  }
  
  return parsed;
}

/**
 * Create BlobKit instance from environment variables.
 * Requires: RPC_URL, PRIVATE_KEY
 * Optional: CHAIN_ID, ARCHIVE_URL, DEFAULT_CODEC, COMPRESSION_LEVEL
 */
export function createFromEnv(): BlobKit {
  const config: BlobKitConfig = {
    rpcUrl: process.env.RPC_URL || '',
    chainId: parseIntegerFromEnv(process.env.CHAIN_ID, 1, 4294967295) || 1,
    archiveUrl: process.env.ARCHIVE_URL,
    defaultCodec: process.env.DEFAULT_CODEC,
    compressionLevel: parseIntegerFromEnv(process.env.COMPRESSION_LEVEL, 0, 11)
  };

  if (!config.rpcUrl) {
    throw new BlobKitError('RPC_URL environment variable is required', 'MISSING_RPC_URL');
  }

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new BlobKitError('PRIVATE_KEY environment variable is required', 'MISSING_PRIVATE_KEY');
  }

  validateEnvironmentVariables(config, privateKey);
  return new BlobKit(config, privateKey);
}

/**
 * Create read-only BlobKit instance from environment variables.
 * Requires: RPC_URL
 * Optional: CHAIN_ID, ARCHIVE_URL, DEFAULT_CODEC
 */
export function createReadOnlyFromEnv(): BlobKit {
  const config: BlobKitConfig = {
    rpcUrl: process.env.RPC_URL || '',
    chainId: parseIntegerFromEnv(process.env.CHAIN_ID, 1, 4294967295) || 1,
    archiveUrl: process.env.ARCHIVE_URL,
    defaultCodec: process.env.DEFAULT_CODEC,
    compressionLevel: parseIntegerFromEnv(process.env.COMPRESSION_LEVEL, 0, 11)
  };

  if (!config.rpcUrl) {
    throw new BlobKitError('RPC_URL environment variable is required', 'MISSING_RPC_URL');
  }

  validateEnvironmentVariables(config);
  return new BlobKit(config);
}
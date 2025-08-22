import { BlobKitEnvironment } from './types.js';

/**
 * Detects the current execution environment
 * @returns The detected environment type
 */
export const detectEnvironment = (): BlobKitEnvironment => {
  // Check for browser environment first (before accessing process)
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return 'browser';
  }

  // Check for Node.js environment
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    // Check for override environment variable with validation
    if (process.env.OVERRIDE_BLOBKIT_ENVIRONMENT) {
      const override = process.env.OVERRIDE_BLOBKIT_ENVIRONMENT;
      const validEnvironments: BlobKitEnvironment[] = ['browser', 'node', 'serverless'];

      if (validEnvironments.includes(override as BlobKitEnvironment)) {
        return override as BlobKitEnvironment;
      } else {
        throw new Error(
          `Invalid OVERRIDE_BLOBKIT_ENVIRONMENT value: '${override}'. ` +
            `Must be one of: ${validEnvironments.join(', ')}`
        );
      }
    }

    // Check for serverless environments
    if (
      process.env.VERCEL ||
      process.env.NETLIFY ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.FUNCTIONS_WORKER ||
      process.env.CF_PAGES
    ) {
      return 'serverless';
    }
    return 'node';
  }

  // Fallback to serverless for unknown environments
  return 'serverless';
};

/**
 * Checks if the current environment is a browser
 */
export const isBrowser = (): boolean => {
  return detectEnvironment() === 'browser';
};

/**
 * Checks if the current environment is Node.js
 */
export const isNode = (): boolean => {
  return detectEnvironment() === 'node';
};

/**
 * Checks if the current environment is serverless
 */
export const isServerless = (): boolean => {
  return detectEnvironment() === 'serverless';
};

/**
 * Gets environment-specific features and capabilities
 */
export const getEnvironmentCapabilities = (env: BlobKitEnvironment) => {
  switch (env) {
    case 'browser':
      return {
        supportsDirectTransactions: false,
        requiresProxy: true,
        hasFileSystem: false,
        hasWebCrypto: typeof crypto !== 'undefined',
        hasMetaMask: typeof window !== 'undefined' && !!window.ethereum,
        canSubmitBlobs: false
      };

    case 'node':
      return {
        supportsDirectTransactions: true,
        requiresProxy: false,
        hasFileSystem: true,
        hasWebCrypto: false,
        hasMetaMask: false,
        canSubmitBlobs: true
      };

    case 'serverless':
      return {
        supportsDirectTransactions: true,
        requiresProxy: false,
        hasFileSystem: false,
        hasWebCrypto: typeof crypto !== 'undefined',
        hasMetaMask: false,
        canSubmitBlobs: false
      };

    default:
      throw new Error(`Unknown environment: ${env}`);
  }
};

import { BlobKitEnvironment } from './types.js';

/**
 * Detects the current execution environment
 * @returns The detected environment type
 */
export const detectEnvironment = (): BlobKitEnvironment => {
  // Check for Node.js environment
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    // Check for serverless environments
    if (process.env.VERCEL || 
        process.env.NETLIFY || 
        process.env.AWS_LAMBDA_FUNCTION_NAME ||
        process.env.FUNCTIONS_WORKER ||
        process.env.CF_PAGES) {
      return 'serverless';
    }
    return 'node';
  }

  // Check for browser environment
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return 'browser';
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
        hasMetaMask: typeof window !== 'undefined' && !!(window as any).ethereum
      };
    
    case 'node':
      return {
        supportsDirectTransactions: true,
        requiresProxy: false,
        hasFileSystem: true,
        hasWebCrypto: false,
        hasMetaMask: false
      };
    
    case 'serverless':
      return {
        supportsDirectTransactions: true,
        requiresProxy: false,
        hasFileSystem: false,
        hasWebCrypto: typeof crypto !== 'undefined',
        hasMetaMask: false
      };
    
    default:
      throw new Error(`Unknown environment: ${env}`);
  }
}; 
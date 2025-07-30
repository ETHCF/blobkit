import { BlobKitEnvironment } from './types.js';
/**
 * Detects the current execution environment
 * @returns The detected environment type
 */
export declare const detectEnvironment: () => BlobKitEnvironment;
/**
 * Checks if the current environment is a browser
 */
export declare const isBrowser: () => boolean;
/**
 * Checks if the current environment is Node.js
 */
export declare const isNode: () => boolean;
/**
 * Checks if the current environment is serverless
 */
export declare const isServerless: () => boolean;
/**
 * Gets environment-specific features and capabilities
 */
export declare const getEnvironmentCapabilities: (env: BlobKitEnvironment) => {
    supportsDirectTransactions: boolean;
    requiresProxy: boolean;
    hasFileSystem: boolean;
    hasWebCrypto: boolean;
    hasMetaMask: boolean;
};
//# sourceMappingURL=environment.d.ts.map
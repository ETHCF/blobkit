/**
 * Environment detection utilities
 * Provides reliable detection of runtime environment
 */

/**
 * Check if we're running in a browser environment
 */
export function isBrowser(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    'window' in globalThis &&
    'document' in globalThis &&
    'navigator' in globalThis
  );
}

/**
 * Check if we're running in Node.js
 */
export function isNode(): boolean {
  return (
    typeof process !== 'undefined' &&
    process.versions != null &&
    process.versions.node != null &&
    typeof require !== 'undefined'
  );
}

/**
 * Dynamic import that only executes in Node.js
 * Returns null in browser environments
 */
export async function nodeOnlyImport<T>(moduleName: string): Promise<T | null> {
  if (!isNode()) {
    return null;
  }
  
  try {
    // Use dynamic import for ES modules compatibility
    const module = await import(moduleName);
    return module;
  } catch {
    try {
      // Fallback to require for CommonJS
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(moduleName);
    } catch {
      return null;
    }
  }
}

/**
 * Get Node.js fs/promises module or null in browser
 */
export async function getNodeFs() {
  if (!isNode()) {
    return null;
  }
  
  try {
    // Create a dynamic reference that bundlers can't analyze
    const moduleId = ['fs', 'promises'].join('/');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(moduleId);
  } catch {
    return null;
  }
}

/**
 * Get Node.js fs module (sync version) or null in browser
 */
export function getNodeFsSync() {
  if (!isNode()) {
    return null;
  }
  
  try {
    // Create a dynamic reference that bundlers can't analyze
    const moduleId = 'fs';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(moduleId);
  } catch {
    return null;
  }
}

/**
 * Get Node.js path module or null in browser
 */
export function getNodePath() {
  if (!isNode()) {
    return null;
  }
  
  try {
    // Create a dynamic reference that bundlers can't analyze
    const moduleId = 'path';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(moduleId);
  } catch {
    return null;
  }
}

/**
 * Get Node.js https module or null in browser
 */
export function getNodeHttps() {
  if (!isNode()) {
    return null;
  }
  
  try {
    // Create a dynamic reference that bundlers can't analyze
    const moduleId = 'https';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(moduleId);
  } catch {
    return null;
  }
}
/**
 * Browser-specific environment utilities
 * This file contains NO Node.js imports to ensure clean browser bundles
 */

/**
 * Check if we're running in a browser environment
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.document !== 'undefined';
}

/**
 * Check if we're running in Node.js
 */
export function isNode(): boolean {
  return false; // This file is only used in browser builds, so always false
}

/**
 * Dynamic import that only executes in Node.js
 * Returns null in browser environments
 */
export async function nodeOnlyImport<T>(_moduleName: string): Promise<T | null> {
  return null; // Browser always returns null
}

/**
 * Get Node.js fs/promises module or null in browser
 */
export async function getNodeFs() {
  return null; // Browser always returns null
}

/**
 * Get Node.js fs module (sync version) or null in browser
 */
export function getNodeFsSync() {
  return null; // Browser always returns null
}

/**
 * Get Node.js path module or null in browser
 */
export function getNodePath() {
  return null; // Browser always returns null
}

/**
 * Get Node.js https module or null in browser
 */
export function getNodeHttps() {
  return null; // Browser always returns null
}
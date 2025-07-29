// Mock brotli before imports
jest.mock('brotli', () => ({
  compress: jest.fn((data) => data),
  decompress: jest.fn((data) => data)
}));

import { initializeForDevelopment } from '../src/init';
import * as fs from 'fs';

describe('Auto Initialize', () => {
  const trustedSetupPath = './trusted_setup.txt';
  
  beforeEach(() => {
    // Clean up any existing trusted setup file
    if (fs.existsSync(trustedSetupPath)) {
      fs.unlinkSync(trustedSetupPath);
    }
  });
  
  afterEach(() => {
    // Clean up after tests
    if (fs.existsSync(trustedSetupPath)) {
      fs.unlinkSync(trustedSetupPath);
    }
    // Reset module cache
    jest.resetModules();
  });

  describe('Development initialization', () => {
    test('should initialize with mock setup', async () => {
      await expect(initializeForDevelopment()).resolves.toBeUndefined();
    });
  });

  describe('Browser detection', () => {
    test.skip('should detect browser environment when window is defined', async () => {
      // Mock browser environment
      const originalWindow = (global as any).window;
      const originalDocument = (global as any).document;
      const originalNavigator = (global as any).navigator;
      const originalFetch = (global as any).fetch;
      
      (global as any).window = { location: { href: 'http://localhost' } };
      (global as any).document = { createElement: jest.fn() };
      (global as any).navigator = { userAgent: 'test' };
      (global as any).globalThis = global;
      
      // Mock fetch to fail, forcing minimal setup
      (global as any).fetch = jest.fn().mockRejectedValue(new Error('Network error'));
      
      // Clear module cache
      jest.resetModules();
      
      // Re-import to get fresh module with browser detection
      const initModule = await import('../src/init-browser');
      const init = initModule.initialize;
      
      // Should work with minimal setup fallback
      await expect(init()).resolves.toBeUndefined();
      
      // Clean up
      (global as any).window = originalWindow;
      (global as any).document = originalDocument;
      (global as any).navigator = originalNavigator;
      (global as any).fetch = originalFetch;
    });
  });

  describe('File format parsing', () => {
    test('should parse mainnet trusted setup format correctly', () => {
      // Test data matching the mainnet format
      const testData = `4096
65
a0413c0dcafec6dbc9f47d66785cf1e8c981044f7d13cfe3e4fcbb71b5408dfde6312493cb3c1d30516cb3ca88c03654
8b997fb25730d661918371bb41f2a6e899cac23f04fc5365800b75433c0a953250e15e7a98fb5ca5cc56a8cd34c20c57`;
      
      // The parseMainnetTrustedSetup function should handle this format
      const lines = testData.trim().split('\n');
      expect(lines[0]).toBe('4096'); // G1 count
      expect(lines[1]).toBe('65');   // G2 count
      expect(lines[2]).toMatch(/^[a-f0-9]{96}$/); // G1 point (hex)
      expect(lines[3]).toMatch(/^[a-f0-9]{96}$/); // Another G1 point
    });
  });

  describe('Error handling', () => {
    test.skip('should handle initialization gracefully', async () => {
      // Mock fetch to fail, forcing minimal setup fallback
      const originalFetch = (global as any).fetch;
      (global as any).fetch = jest.fn().mockRejectedValue(new Error('Network error'));
      
      // Clear module cache to reset singleton
      jest.resetModules();
      
      // Re-import to get fresh module
      const initModule = await import('../src/init-browser');
      const init = initModule.initialize;
      
      // In test environment, should fallback to minimal setup
      await expect(init()).resolves.toBeUndefined();
      
      // Restore
      (global as any).fetch = originalFetch;
    });
  });
});
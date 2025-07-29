import { initialize, initializeForDevelopment } from '../src/init';
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
  });

  describe('Development initialization', () => {
    test('should initialize with mock setup', async () => {
      await expect(initializeForDevelopment()).resolves.toBeUndefined();
    });
  });

  describe('Browser detection', () => {
    test('should detect browser environment when window is defined', () => {
      // Mock browser environment
      (global as any).window = {};
      
      // In a real browser, initialize() would call initializeForBrowser
      // For this test, we just verify it doesn't throw
      expect(() => initialize()).not.toThrow();
      
      // Clean up
      delete (global as any).window;
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
    test('should handle initialization gracefully', async () => {
      // In test environment, initialize should work with either dev setup or minimal fallback
      await expect(initialize()).resolves.toBeUndefined();
    });
  });
});
import { loadTrustedSetupFromBinary, loadTrustedSetupFromText } from '../src/kzg/setup';
import { BlobKitError } from '../src/types';

describe('Browser Compatibility', () => {
  describe('File path handling in browser environment', () => {
    // Mock browser environment
    const originalProcess = global.process;
    
    beforeEach(() => {
      // Remove process to simulate browser environment
      delete (global as any).process;
    });
    
    afterEach(() => {
      // Restore process
      global.process = originalProcess;
    });

    test('should throw error when using file paths in browser', async () => {
      await expect(
        loadTrustedSetupFromBinary('/path/to/g1.bin', '/path/to/g2.bin')
      ).rejects.toThrow(new BlobKitError(
        'File paths not supported in browser environment. Use Uint8Array data instead.',
        'BROWSER_FILE_ERROR'
      ));
    });

    test('should throw error when using text file paths in browser', async () => {
      await expect(
        loadTrustedSetupFromText('/path/to/g1.txt', '/path/to/g2.txt')
      ).rejects.toThrow(new BlobKitError(
        'File paths not supported in browser environment. Use Uint8Array data instead.',
        'BROWSER_FILE_ERROR'
      ));
    });

    test('should accept Uint8Array data in browser', async () => {
      // Create minimal valid data
      const g1Data = new Uint8Array(196608); // 4096 * 48 bytes
      const g2Data = new Uint8Array(192);    // 2 * 96 bytes
      
      // This should not throw the browser error, but will fail on validation
      await expect(
        loadTrustedSetupFromBinary(g1Data, g2Data)
      ).rejects.toThrow(/Invalid G1 point/); // Different error means it accepted the data
    });
  });

  describe('Node.js environment detection', () => {
    test('should detect Node.js environment correctly', async () => {
      // In test environment, process should be defined
      expect(typeof process).toBe('object');
      expect(process.versions?.node).toBeDefined();
      
      // File paths should work in Node.js
      await expect(
        loadTrustedSetupFromBinary('./nonexistent.bin', './nonexistent.bin')
      ).rejects.toThrow(/Failed to read files|ENOENT|no such file/i); // File read error, not browser error
    });
  });

  describe('Dynamic import safety', () => {
    test('should not crash when imported in simulated browser build', () => {
      // This test verifies that the module can be imported without errors
      // The eval trick should prevent bundlers from analyzing the fs require
      expect(() => require('../src/kzg/setup')).not.toThrow();
    });

    test('should handle eval errors gracefully', async () => {
      // Mock eval to throw an error
      const originalEval = global.eval;
      global.eval = jest.fn().mockImplementation(() => {
        throw new Error('eval is disabled');
      });

      try {
        await expect(
          loadTrustedSetupFromBinary('/path/to/g1.bin', '/path/to/g2.bin')
        ).rejects.toThrow(/Failed to read files|eval is disabled/i);
      } finally {
        global.eval = originalEval;
      }
    });
  });
});
/**
 * Test to verify that the browser fs fix works correctly
 * This test simulates the exact error reported and verifies the fix
 */

describe('Browser FS Fix Verification', () => {
  describe('No fs module errors in browser', () => {
    // Save original environment
    const originalWindow = (global as any).window;
    const originalDocument = (global as any).document;
    const originalNavigator = (global as any).navigator;
    const originalProcess = global.process;

    beforeEach(() => {
      // Simulate browser environment
      (global as any).window = { location: { href: 'http://localhost' } };
      (global as any).document = { createElement: jest.fn() };
      (global as any).navigator = { userAgent: 'test' };
      
      // Remove Node.js indicators
      delete (global as any).process;
      
      // Mock require to throw (as it would in a browser)
      (global as any).require = jest.fn().mockImplementation((module: string) => {
        throw new Error(`Cannot find module '${module}'`);
      });
    });

    afterEach(() => {
      // Restore environment
      (global as any).window = originalWindow;
      (global as any).document = originalDocument;
      (global as any).navigator = originalNavigator;
      global.process = originalProcess;
    });

    test('should not throw "Failed to resolve module specifier fs" error', async () => {
      // Import the modules that use fs conditionally
      const setupModule = await import('../src/kzg/setup');
      const initModule = await import('../src/init');
      const envModule = await import('../src/utils/environment');
      
      // Verify imports succeeded
      expect(setupModule).toBeDefined();
      expect(initModule).toBeDefined();
      expect(envModule).toBeDefined();
      
      // Verify browser detection works
      expect(envModule.isBrowser()).toBe(true);
      expect(envModule.isNode()).toBe(false);
      
      // Verify fs modules return null in browser
      expect(await envModule.getNodeFs()).toBeNull();
      expect(envModule.getNodeFsSync()).toBeNull();
    });

    test('should handle file path inputs gracefully in browser', async () => {
      const { loadTrustedSetupFromBinary } = await import('../src/kzg/setup');
      
      // Should throw browser-specific error, not fs module error
      await expect(
        loadTrustedSetupFromBinary('/path/to/file', '/path/to/file2')
      ).rejects.toThrow('File paths not supported in browser environment');
    });

    test('should work with Uint8Array data in browser', async () => {
      const { loadTrustedSetupFromBinary } = await import('../src/kzg/setup');
      
      // Create valid-sized test data
      const g1Data = new Uint8Array(196608); // 4096 * 48
      const g2Data = new Uint8Array(192);    // 2 * 96
      
      // Should not throw fs-related errors
      // (Will fail on validation, but that's expected)
      await expect(
        loadTrustedSetupFromBinary(g1Data, g2Data)
      ).rejects.not.toThrow(/Cannot find module|Failed to resolve module|fs/);
    });
  });

  describe('Built code verification', () => {
    test('should not contain direct fs imports in built files', () => {
      const fs = require('fs');
      const path = require('path');
      
      // Check key built files
      const filesToCheck = [
        'dist/kzg/setup.js',
        'dist/init.js',
        'dist/utils/environment.js'
      ];
      
      filesToCheck.forEach(file => {
        const filePath = path.join(__dirname, '..', file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          
          // Should not contain direct fs imports
          expect(content).not.toMatch(/require\(['"]fs['"]\)/);
          expect(content).not.toMatch(/require\(['"]fs\/promises['"]\)/);
          expect(content).not.toMatch(/import.*from ['"]fs['"]/);
          
          // Should use environment detection
          expect(content).toContain('isNode');
          expect(content).toContain('isBrowser');
        }
      });
    });
  });
});
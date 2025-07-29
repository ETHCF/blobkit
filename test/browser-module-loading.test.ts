import { isBrowser, isNode, getNodeFs, getNodeFsSync, getNodePath, getNodeHttps } from '../src/utils/environment';

describe('Browser Module Loading', () => {
  describe('Environment Detection', () => {
    test('should correctly detect test environment as Node.js', () => {
      expect(isNode()).toBe(true);
      expect(isBrowser()).toBe(false);
    });
  });

  describe('Node Module Loading', () => {
    test('should load Node modules in Node.js environment', async () => {
      const fs = await getNodeFs();
      const fsSync = getNodeFsSync();
      const path = getNodePath();
      const https = getNodeHttps();
      
      expect(fs).toBeTruthy();
      expect(fsSync).toBeTruthy();
      expect(path).toBeTruthy();
      expect(https).toBeTruthy();
    });
  });

  describe('Browser Simulation', () => {
    const originalWindow = (global as any).window;
    const originalDocument = (global as any).document;
    const originalNavigator = (global as any).navigator;
    const originalProcess = global.process;
    const originalRequire = (global as any).require;

    beforeEach(() => {
      // Mock browser environment
      (global as any).window = {};
      (global as any).document = {};
      (global as any).navigator = {};
      delete (global as any).process;
      delete (global as any).require;
    });

    afterEach(() => {
      // Restore original environment
      (global as any).window = originalWindow;
      (global as any).document = originalDocument;
      (global as any).navigator = originalNavigator;
      global.process = originalProcess;
      (global as any).require = originalRequire;
    });

    test('should detect browser environment correctly', () => {
      expect(isBrowser()).toBe(true);
      expect(isNode()).toBe(false);
    });

    test('should return null for Node modules in browser', async () => {
      const fs = await getNodeFs();
      const fsSync = getNodeFsSync();
      const path = getNodePath();
      const https = getNodeHttps();
      
      expect(fs).toBeNull();
      expect(fsSync).toBeNull();
      expect(path).toBeNull();
      expect(https).toBeNull();
    });

    test('should not throw errors when accessing modules in browser', async () => {
      // This is the critical test - ensure no errors are thrown
      await expect(getNodeFs()).resolves.toBeNull();
      expect(() => getNodeFsSync()).not.toThrow();
      expect(() => getNodePath()).not.toThrow();
      expect(() => getNodeHttps()).not.toThrow();
    });
  });

  describe('Dynamic Import Safety', () => {
    test('should not include literal fs imports in built code', () => {
      // Read the source code to verify no direct imports
      const environmentSource = require('fs').readFileSync(
        require('path').join(__dirname, '../src/utils/environment.ts'),
        'utf-8'
      );
      
      // Should not contain direct imports
      expect(environmentSource).not.toContain("import * as fs from 'fs'");
      expect(environmentSource).not.toContain('import fs from');
      expect(environmentSource).not.toContain("require('fs')");
      
      // Should use dynamic module ID construction
      expect(environmentSource).toContain("moduleId");
    });
  });
});
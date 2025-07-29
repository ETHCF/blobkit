// Mock brotli before imports
jest.mock('brotli', () => ({
  compress: jest.fn((data) => data),
  decompress: jest.fn((data) => data)
}));

import { initializeForDevelopment } from '../src/init';

describe('Initialize Integration', () => {
  describe('Development mode', () => {
    test('should work immediately without any downloads', async () => {
      await expect(initializeForDevelopment()).resolves.toBeUndefined();
    });
  });

  describe('Browser simulation', () => {
    const originalWindow = (global as any).window;
    const originalDocument = (global as any).document;
    const originalNavigator = (global as any).navigator;
    const originalFetch = (global as any).fetch;

    beforeEach(() => {
      // Reset modules to clear singleton
      jest.resetModules();
      
      // Mock browser environment with all required properties
      (global as any).window = { location: { href: 'http://localhost' } };
      (global as any).document = { createElement: jest.fn() };
      (global as any).navigator = { userAgent: 'test' };
      (global as any).globalThis = global;
      
      // Mock fetch to simulate CORS-enabled CDN
      (global as any).fetch = jest.fn().mockImplementation((url: string) => {
        // Simulate successful response from jsDelivr
        if (url.includes('cdn.jsdelivr.net')) {
          // Use actual generator points from BLS12-381
          // G1 generator (compressed): 48 bytes
          const g1Generator = '97f1d3a73197d7942695638c4fa9ac0fc3688c4f9774b905a14e3a3f171bac586c55e83ff97a1aeffb3af00adb22c6bb';
          // G2 generator (compressed): 96 bytes  
          const g2Generator = '93e02b6052719f607dacd3a088274f65596bd0d09920b61ab5da61bbdc7f5049334cf11213945d57e5ac7d055d042b7e024aa2b2f08f0a91260805272dc51051c6e47ad4fa403b02b4510b647ae3d1770bac0326a805bbefd48056c8c121bdb8';
          
          // Generate mock points (first is generator, rest are dummy but valid format)
          const g1Points = [g1Generator, ...Array(4095).fill('a'.repeat(96))].join('\n');
          const g2Points = [g2Generator, 'b'.repeat(192), ...Array(63).fill('c'.repeat(192))].join('\n');
          const response = `4096\n65\n${g1Points}\n${g2Points}`;
          
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(response)
          });
        }
        
        // Simulate CORS error from GitHub
        if (url.includes('githubusercontent.com')) {
          return Promise.reject(new Error('CORS blocked'));
        }
        
        return Promise.reject(new Error('Unknown URL'));
      });
    });

    afterEach(() => {
      // Restore
      (global as any).window = originalWindow;
      (global as any).document = originalDocument;
      (global as any).navigator = originalNavigator;
      (global as any).fetch = originalFetch;
      
      // Clear module cache to reset singleton
      jest.resetModules();
    });

    test('should work in browser with CDN fallbacks', async () => {
      // Dynamically import to ensure browser environment is set first
      const { initialize: init } = await import('../src/init');
      
      // This should succeed using the jsDelivr CDN
      await expect(init()).resolves.toBeUndefined();
      
      // Verify fetch was called
      expect((global as any).fetch).toHaveBeenCalled();
    });

    test('should fallback to minimal setup if all CDNs fail', async () => {
      // Mock all fetches to fail
      (global as any).fetch = jest.fn().mockRejectedValue(new Error('Network error'));
      
      // Dynamically import to ensure browser environment is set first
      const { initialize: init } = await import('../src/init');
      
      // Should not throw, but use minimal setup
      await expect(init()).resolves.toBeUndefined();
    });
  });

  describe('Real world usage', () => {
    test('developers can use it with zero configuration', async () => {
      // This is what developers will write:
      await initializeForDevelopment(); // For dev/test
      
      // That's it! No file downloads, no URLs, no configuration
      expect(true).toBe(true); // If we got here, it worked
    });
  });
});
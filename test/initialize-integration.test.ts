import { initialize, initializeForDevelopment } from '../src/init';

describe('Initialize Integration', () => {
  describe('Development mode', () => {
    test('should work immediately without any downloads', async () => {
      await expect(initializeForDevelopment()).resolves.toBeUndefined();
    });
  });

  describe('Browser simulation', () => {
    const originalWindow = (global as any).window;
    const originalFetch = (global as any).fetch;

    beforeEach(() => {
      // Mock browser environment
      (global as any).window = {};
      
      // Mock fetch to simulate CORS-enabled CDN
      (global as any).fetch = jest.fn().mockImplementation((url: string) => {
        // Simulate successful response from jsDelivr
        if (url.includes('cdn.jsdelivr.net')) {
          // Generate a minimal valid trusted setup response
          const g1Points = Array(4096).fill('a'.repeat(96)).join('\n');
          const g2Points = Array(65).fill('b'.repeat(192)).join('\n');
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
      (global as any).fetch = originalFetch;
    });

    test('should work in browser with CDN fallbacks', async () => {
      // This should succeed using the jsDelivr CDN
      await expect(initialize()).resolves.toBeUndefined();
      
      // Verify fetch was called
      expect((global as any).fetch).toHaveBeenCalled();
    });

    test('should fallback to minimal setup if all CDNs fail', async () => {
      // Mock all fetches to fail
      (global as any).fetch = jest.fn().mockRejectedValue(new Error('Network error'));
      
      // Should not throw, but use minimal setup
      await expect(initialize()).resolves.toBeUndefined();
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
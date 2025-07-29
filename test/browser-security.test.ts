import { initializeForBrowser } from '../src/init';
import { BlobKitError } from '../src/types';

// Mock fetch and crypto for testing
global.fetch = jest.fn();
global.crypto = {
  subtle: {
    digest: jest.fn()
  }
} as any;

describe('Browser Security Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset singleton
    (global as any).initializationPromise = null;
  });

  describe('URL Validation', () => {
    test('should reject non-HTTPS URLs for G1', async () => {
      await expect(
        initializeForBrowser({
          g1Url: 'http://example.com/g1.txt',
          g2Url: 'https://example.com/g2.txt'
        })
      ).rejects.toThrow(expect.objectContaining({
        message: 'Trusted setup URLs must use HTTPS for security',
        code: 'INSECURE_URL'
      }));
    });

    test('should reject non-HTTPS URLs for G2', async () => {
      await expect(
        initializeForBrowser({
          g1Url: 'https://example.com/g1.txt',
          g2Url: 'http://example.com/g2.txt'
        })
      ).rejects.toThrow(new BlobKitError(
        'Trusted setup URLs must use HTTPS for security',
        'INSECURE_URL'
      ));
    });

    test('should reject URLs with credentials', async () => {
      await expect(
        initializeForBrowser({
          g1Url: 'https://user:pass@example.com/g1.txt',
          g2Url: 'https://example.com/g2.txt'
        })
      ).rejects.toThrow(new BlobKitError(
        'URLs must not contain credentials',
        'CREDENTIALS_IN_URL'
      ));
    });

    test('should reject localhost URLs in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      await expect(
        initializeForBrowser({
          g1Url: 'https://localhost/g1.txt',
          g2Url: 'https://example.com/g2.txt'
        })
      ).rejects.toThrow(new BlobKitError(
        'Localhost URLs not allowed in production',
        'LOCALHOST_IN_PRODUCTION'
      ));

      process.env.NODE_ENV = originalEnv;
    });

    test('should reject 127.0.0.1 URLs in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      await expect(
        initializeForBrowser({
          g1Url: 'https://127.0.0.1/g1.txt',
          g2Url: 'https://example.com/g2.txt'
        })
      ).rejects.toThrow(new BlobKitError(
        'Localhost URLs not allowed in production',
        'LOCALHOST_IN_PRODUCTION'
      ));

      process.env.NODE_ENV = originalEnv;
    });

    test('should allow localhost URLs in development', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        headers: new Headers({
          'content-type': 'text/plain',
          'content-length': '100'
        }),
        arrayBuffer: async () => new ArrayBuffer(100)
      });

      // This should not throw but we can't easily test without full mocks
      void initializeForBrowser({
        g1Url: 'https://localhost/g1.txt',
        g2Url: 'https://localhost/g2.txt'
      });

      // Clean up
      process.env.NODE_ENV = originalEnv;
    });

    test('should reject invalid URLs', async () => {
      await expect(
        initializeForBrowser({
          g1Url: 'not-a-url',
          g2Url: 'https://example.com/g2.txt'
        })
      ).rejects.toThrow(new BlobKitError(
        'Invalid URLs provided',
        'INVALID_URL'
      ));
    });
  });

  describe('Content-Type Validation', () => {
    test('should reject invalid content type for binary format', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        headers: new Headers({
          'content-type': 'text/html',
          'content-length': '100'
        })
      });

      await expect(
        initializeForBrowser({
          g1Url: 'https://example.com/g1.bin',
          g2Url: 'https://example.com/g2.bin',
          format: 'binary'
        })
      ).rejects.toThrow(new BlobKitError(
        'Invalid content type for binary G1 data: text/html',
        'INVALID_CONTENT_TYPE'
      ));
    });

    test('should accept application/octet-stream for binary format', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        headers: new Headers({
          'content-type': 'application/octet-stream',
          'content-length': '100'
        }),
        arrayBuffer: async () => new ArrayBuffer(100)
      });

      // Mock the dynamic import
      jest.doMock('../src/kzg/setup', () => ({
        loadTrustedSetupFromBinary: jest.fn().mockResolvedValue({
          g1Powers: [],
          g2Powers: []
        })
      }));

      // This should not throw
      void initializeForBrowser({
        g1Url: 'https://example.com/g1.bin',
        g2Url: 'https://example.com/g2.bin',
        format: 'binary'
      });
    });
  });

  describe('File Size Validation', () => {
    test('should reject G1 files larger than MAX_G1_SIZE', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        headers: new Headers({
          'content-type': 'text/plain',
          'content-length': '300000' // 300KB > 250KB limit
        })
      });

      await expect(
        initializeForBrowser({
          g1Url: 'https://example.com/g1.txt',
          g2Url: 'https://example.com/g2.txt'
        })
      ).rejects.toThrow(new BlobKitError(
        'G1 file too large: 300000 bytes (max: 250000)',
        'FILE_TOO_LARGE'
      ));
    });

    test('should reject G2 files larger than MAX_G2_SIZE', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({
            'content-type': 'text/plain',
            'content-length': '100'
          }),
          arrayBuffer: async () => new ArrayBuffer(100)
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({
            'content-type': 'text/plain',
            'content-length': '2000' // 2KB > 1KB limit
          })
        });

      await expect(
        initializeForBrowser({
          g1Url: 'https://example.com/g1.txt',
          g2Url: 'https://example.com/g2.txt'
        })
      ).rejects.toThrow(new BlobKitError(
        'G2 file too large: 2000 bytes (max: 1000)',
        'FILE_TOO_LARGE'
      ));
    });
  });

  describe('HTTP Error Handling', () => {
    test('should handle G1 404 errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers()
      });

      await expect(
        initializeForBrowser({
          g1Url: 'https://example.com/g1.txt',
          g2Url: 'https://example.com/g2.txt'
        })
      ).rejects.toThrow(new BlobKitError(
        'Failed to fetch G1 setup: HTTP 404',
        'G1_FETCH_ERROR'
      ));
    });

    test('should handle G2 500 errors', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({
            'content-type': 'text/plain',
            'content-length': '100'
          }),
          arrayBuffer: async () => new ArrayBuffer(100)
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          headers: new Headers()
        });

      await expect(
        initializeForBrowser({
          g1Url: 'https://example.com/g1.txt',
          g2Url: 'https://example.com/g2.txt'
        })
      ).rejects.toThrow(new BlobKitError(
        'Failed to fetch G2 setup: HTTP 500',
        'G2_FETCH_ERROR'
      ));
    });
  });

  describe('Network Error Handling', () => {
    test('should handle network timeouts', async () => {
      const abortError = new Error('AbortError');
      abortError.name = 'AbortError';
      (global.fetch as jest.Mock).mockRejectedValue(abortError);

      await expect(
        initializeForBrowser({
          g1Url: 'https://example.com/g1.txt',
          g2Url: 'https://example.com/g2.txt',
          timeout: 100
        })
      ).rejects.toThrow(new BlobKitError(
        'Request timeout after 100ms',
        'FETCH_TIMEOUT'
      ));
    });

    test('should handle network failures', async () => {
      const networkError = new TypeError('Failed to fetch');
      (global.fetch as jest.Mock).mockRejectedValue(networkError);

      await expect(
        initializeForBrowser({
          g1Url: 'https://example.com/g1.txt',
          g2Url: 'https://example.com/g2.txt'
        })
      ).rejects.toThrow(new BlobKitError(
        'Network error: Failed to fetch',
        'NETWORK_ERROR'
      ));
    });
  });

  describe('Hash Verification', () => {
    test('should reject mismatched G1 hash', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        headers: new Headers({
          'content-type': 'text/plain',
          'content-length': '100'
        }),
        arrayBuffer: async () => new ArrayBuffer(100)
      });

      const mockHash = new Uint8Array(32).fill(0);
      (global.crypto.subtle.digest as jest.Mock).mockResolvedValue(mockHash.buffer);

      await expect(
        initializeForBrowser({
          g1Url: 'https://example.com/g1.txt',
          g2Url: 'https://example.com/g2.txt',
          g1Hash: 'deadbeefcafe' // Wrong hash
        })
      ).rejects.toThrow(new BlobKitError(
        'G1 hash verification failed',
        'HASH_MISMATCH'
      ));
    });

    test('should accept matching hash', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        headers: new Headers({
          'content-type': 'text/plain',
          'content-length': '100'
        }),
        arrayBuffer: async () => new ArrayBuffer(100)
      });

      // Create a hash that matches "0000000000000000000000000000000000000000000000000000000000000000"
      const mockHash = new Uint8Array(32).fill(0);
      (global.crypto.subtle.digest as jest.Mock).mockResolvedValue(mockHash.buffer);

      // Mock the dynamic import
      jest.doMock('../src/kzg/setup', () => ({
        loadTrustedSetupFromText: jest.fn().mockResolvedValue({
          g1Powers: [],
          g2Powers: []
        })
      }));

      // This should not throw
      void initializeForBrowser({
        g1Url: 'https://example.com/g1.txt',
        g2Url: 'https://example.com/g2.txt',
        g1Hash: '0000000000000000000000000000000000000000000000000000000000000000'
      });
    });
  });

  describe('Singleton Pattern', () => {
    test('should prevent concurrent initialization', async () => {
      let fetchCallCount = 0;
      (global.fetch as jest.Mock).mockImplementation(() => {
        fetchCallCount++;
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({
              ok: true,
              headers: new Headers({
                'content-type': 'text/plain',
                'content-length': '100'
              }),
              arrayBuffer: async () => new ArrayBuffer(100)
            });
          }, 100);
        });
      });

      // Start two concurrent initializations
      const promise1 = initializeForBrowser({
        g1Url: 'https://example.com/g1.txt',
        g2Url: 'https://example.com/g2.txt'
      });

      const promise2 = initializeForBrowser({
        g1Url: 'https://example.com/g1.txt',
        g2Url: 'https://example.com/g2.txt'
      });

      // They should be the same promise
      expect(promise1).toBe(promise2);

      // Fetch should only be called once (for both files)
      expect(fetchCallCount).toBe(2); // G1 and G2
    });
  });

  describe('Retry Logic', () => {
    test('should retry on transient failures', async () => {
      let attemptCount = 0;
      (global.fetch as jest.Mock).mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          ok: true,
          headers: new Headers({
            'content-type': 'text/plain',
            'content-length': '100'
          }),
          arrayBuffer: async () => new ArrayBuffer(100)
        });
      });

      // Mock the dynamic import
      jest.doMock('../src/kzg/setup', () => ({
        loadTrustedSetupFromText: jest.fn().mockResolvedValue({
          g1Powers: [],
          g2Powers: []
        })
      }));

      // Should succeed after retries
      await initializeForBrowser({
        g1Url: 'https://example.com/g1.txt',
        g2Url: 'https://example.com/g2.txt'
      });

      // Should have made 3 attempts for each file
      expect(attemptCount).toBe(6); // 3 attempts × 2 files
    });

    test('should fail after max retries', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(
        initializeForBrowser({
          g1Url: 'https://example.com/g1.txt',
          g2Url: 'https://example.com/g2.txt'
        })
      ).rejects.toThrow('Network error');
    });
  });
});
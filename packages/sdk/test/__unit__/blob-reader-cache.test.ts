import { Hex, createTestBlob, toVersionedHash, TEST_COMMITMENT, TEST_PROOF } from '../utils/blob-test-utils';

describe('BlobReader - Cache Operations', () => {
  describe('LRU Cache', () => {
    let cache: BlobCache;

    beforeEach(() => {
      cache = new BlobCache({ maxEntries: 3, maxBytes: 400000 }); // ~3 blobs
    });

    it('should store and retrieve verified blobs', () => {
      const versionedHash = toVersionedHash(TEST_COMMITMENT);
      const blob = {
        versionedHash,
        slot: 1000,
        index: 0,
        commitment: TEST_COMMITMENT,
        proof: TEST_PROOF,
        fieldElements: splitIntoFieldElements(createTestBlob()),
        source: 'provider-beacon' as const
      };

      cache.put(versionedHash, blob);
      const retrieved = cache.get(versionedHash);
      
      expect(retrieved).toEqual(blob);
    });

    it('should evict oldest entry when max entries reached', () => {
      const blobs = Array.from({ length: 4 }, (_, i) => {
        const versionedHash = toVersionedHash(TEST_COMMITMENT.slice(0, -2) + i.toString(16).padStart(2, '0') as any);
        return {
          versionedHash,
          slot: 1000 + i,
          index: i,
          commitment: TEST_COMMITMENT,
          proof: TEST_PROOF,
          fieldElements: splitIntoFieldElements(createTestBlob(i)),
          source: 'provider-beacon' as const
        };
      });

      // Add 4 blobs to cache with max 3
      blobs.forEach(blob => cache.put(blob.versionedHash, blob));

      // First blob should be evicted
      expect(cache.get(blobs[0].versionedHash)).toBeUndefined();
      // Last 3 should remain
      expect(cache.get(blobs[1].versionedHash)).toBeDefined();
      expect(cache.get(blobs[2].versionedHash)).toBeDefined();
      expect(cache.get(blobs[3].versionedHash)).toBeDefined();
    });

    it('should evict entries when max bytes exceeded', () => {
      // Set very small cache
      cache = new BlobCache({ maxEntries: 10, maxBytes: 131072 * 2 }); // 2 blobs worth

      const blobs = Array.from({ length: 3 }, (_, i) => {
        const versionedHash = toVersionedHash(TEST_COMMITMENT.slice(0, -2) + i.toString(16).padStart(2, '0') as any);
        return {
          versionedHash,
          slot: 1000 + i,
          index: i,
          commitment: TEST_COMMITMENT,
          proof: TEST_PROOF,
          fieldElements: splitIntoFieldElements(createTestBlob(i)),
          source: 'provider-beacon' as const
        };
      });

      blobs.forEach(blob => cache.put(blob.versionedHash, blob));

      // Only last 2 should remain due to byte limit
      expect(cache.get(blobs[0].versionedHash)).toBeUndefined();
      expect(cache.get(blobs[1].versionedHash)).toBeDefined();
      expect(cache.get(blobs[2].versionedHash)).toBeDefined();
    });

    it('should update LRU order on get', () => {
      const blobs = Array.from({ length: 3 }, (_, i) => {
        const versionedHash = toVersionedHash(TEST_COMMITMENT.slice(0, -2) + i.toString(16).padStart(2, '0') as any);
        return {
          versionedHash,
          slot: 1000 + i,
          index: i,
          commitment: TEST_COMMITMENT,
          proof: TEST_PROOF,
          fieldElements: splitIntoFieldElements(createTestBlob(i)),
          source: 'provider-beacon' as const
        };
      });

      // Fill cache
      blobs.forEach(blob => cache.put(blob.versionedHash, blob));

      // Access first blob to make it most recently used
      cache.get(blobs[0].versionedHash);

      // Add new blob - should evict blob[1], not blob[0]
      const newBlob = {
        versionedHash: toVersionedHash(TEST_COMMITMENT.slice(0, -2) + 'ff' as any),
        slot: 2000,
        index: 0,
        commitment: TEST_COMMITMENT,
        proof: TEST_PROOF,
        fieldElements: splitIntoFieldElements(createTestBlob(99)),
        source: 'provider-beacon' as const
      };
      cache.put(newBlob.versionedHash, newBlob);

      expect(cache.get(blobs[0].versionedHash)).toBeDefined(); // Still there
      expect(cache.get(blobs[1].versionedHash)).toBeUndefined(); // Evicted
      expect(cache.get(blobs[2].versionedHash)).toBeDefined();
      expect(cache.get(newBlob.versionedHash)).toBeDefined();
    });

    it('should clear all entries', () => {
      const versionedHash = toVersionedHash(TEST_COMMITMENT);
      const blob = {
        versionedHash,
        slot: 1000,
        index: 0,
        commitment: TEST_COMMITMENT,
        proof: TEST_PROOF,
        fieldElements: splitIntoFieldElements(createTestBlob()),
        source: 'provider-beacon' as const
      };

      cache.put(versionedHash, blob);
      expect(cache.get(versionedHash)).toBeDefined();

      cache.clear();
      expect(cache.get(versionedHash)).toBeUndefined();
    });

    it('should handle strict reverify on read when enabled', async () => {
      const strictCache = new BlobCache({ 
        maxEntries: 3, 
        maxBytes: 400000,
        strictReverify: true 
      });

      const versionedHash = toVersionedHash(TEST_COMMITMENT);
      const blob = {
        versionedHash,
        slot: 1000,
        index: 0,
        commitment: TEST_COMMITMENT,
        proof: TEST_PROOF,
        fieldElements: splitIntoFieldElements(createTestBlob()),
        source: 'provider-beacon' as const
      };

      strictCache.put(versionedHash, blob);
      
      // Mock verifier for strict reverify
      const mockVerifier = {
        verifyBlob: jest.fn().mockResolvedValue(true)
      };
      
      const retrieved = await strictCache.getWithReverify(versionedHash, mockVerifier);
      
      expect(mockVerifier.verifyBlob).toHaveBeenCalledWith(
        expect.objectContaining({
          commitment: TEST_COMMITMENT,
          proof: TEST_PROOF
        })
      );
      expect(retrieved).toEqual(blob);
    });

    it('should remove blob from cache if reverify fails', async () => {
      const strictCache = new BlobCache({ 
        maxEntries: 3, 
        maxBytes: 400000,
        strictReverify: true 
      });

      const versionedHash = toVersionedHash(TEST_COMMITMENT);
      const blob = {
        versionedHash,
        slot: 1000,
        index: 0,
        commitment: TEST_COMMITMENT,
        proof: TEST_PROOF,
        fieldElements: splitIntoFieldElements(createTestBlob()),
        source: 'provider-beacon' as const
      };

      strictCache.put(versionedHash, blob);
      
      // Mock verifier that fails
      const mockVerifier = {
        verifyBlob: jest.fn().mockResolvedValue(false)
      };
      
      const retrieved = await strictCache.getWithReverify(versionedHash, mockVerifier);
      
      expect(retrieved).toBeUndefined();
      expect(strictCache.get(versionedHash)).toBeUndefined(); // Removed from cache
    });
  });
});

// Helper function that will be in the actual implementation
function splitIntoFieldElements(blob: Uint8Array): Uint8Array[] {
  const FIELD_ELEMENTS_PER_BLOB = 4096;
  const BYTES_PER_FIELD_ELEMENT = 32;
  
  const elements: Uint8Array[] = [];
  for (let i = 0; i < FIELD_ELEMENTS_PER_BLOB; i++) {
    const start = i * BYTES_PER_FIELD_ELEMENT;
    const end = start + BYTES_PER_FIELD_ELEMENT;
    elements.push(blob.slice(start, end));
  }
  return elements;
}

// Mock cache implementation for testing
class BlobCache {
  private cache = new Map<string, any>();
  private accessOrder: string[] = [];
  private maxEntries: number;
  private maxBytes: number;
  private currentBytes: number = 0;
  private strictReverify: boolean;

  constructor(options: { maxEntries: number; maxBytes: number; strictReverify?: boolean }) {
    this.maxEntries = options.maxEntries;
    this.maxBytes = options.maxBytes;
    this.strictReverify = options.strictReverify || false;
  }

  put(key: string, value: any): void {
    const size = 131072 + 96; // Blob size + overhead
    
    // Remove if exists to update position
    if (this.cache.has(key)) {
      this.remove(key);
    }

    // Evict if needed
    while (this.accessOrder.length >= this.maxEntries || this.currentBytes + size > this.maxBytes) {
      const oldest = this.accessOrder.shift();
      if (oldest) {
        this.cache.delete(oldest);
        this.currentBytes -= size;
      }
    }

    this.cache.set(key, value);
    this.accessOrder.push(key);
    this.currentBytes += size;
  }

  get(key: string): any {
    if (!this.cache.has(key)) {
      return undefined;
    }

    // Update LRU order
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
      this.accessOrder.push(key);
    }

    return this.cache.get(key);
  }

  async getWithReverify(key: string, verifier: any): Promise<any> {
    const blob = this.get(key);
    if (!blob || !this.strictReverify) {
      return blob;
    }

    const isValid = await verifier.verifyBlob(blob);
    if (!isValid) {
      this.remove(key);
      return undefined;
    }

    return blob;
  }

  remove(key: string): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
      this.currentBytes -= 131072 + 96;
    }
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.currentBytes = 0;
  }
}
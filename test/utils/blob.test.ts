import {
  encodeBlob,
  decodeBlob,
  computeContentHash,
  BLOB_SIZE
} from '../../src/blob/utils';
import { BlobKitError } from '../../src/types';

describe('Blob Utils', () => {
  describe('encodeBlob', () => {
    it('should encode data without compression', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const encoded = await encodeBlob(data, false);

      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBe(BLOB_SIZE);
    });

    it('should encode data with compression', async () => {
      const data = new Uint8Array(1000).fill(42);
      const encoded = await encodeBlob(data, true);

      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBe(BLOB_SIZE);
    });

    it('should encode large data without throwing (validation moved to BlobWriter)', async () => {
      // Size validation has been moved to BlobWriter to support future chunking
      const data = new Uint8Array(BLOB_SIZE);
      const encoded = await encodeBlob(data, false);

      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBe(BLOB_SIZE);
    });

    it('should format blob for KZG correctly', async () => {
      const data = new Uint8Array([1, 2, 3]);
      const encoded = await encodeBlob(data, false);

      // Check first byte of each field element is 0
      for (let i = 0; i < 4096; i++) {
        expect(encoded[i * 32]).toBe(0);
      }
    });
  });

  describe('decodeBlob', () => {
    it('should decode blob without compression', async () => {
      const originalData = new Uint8Array([1, 2, 3, 4, 5]);
      const encoded = await encodeBlob(originalData, false);
      const decoded = await decodeBlob(encoded, false);

      expect(decoded.slice(0, 5)).toEqual(originalData);
    });

    it('should decode blob with compression', async () => {
      const originalData = new Uint8Array(100).fill(42);
      const encoded = await encodeBlob(originalData, true);
      const decoded = await decodeBlob(encoded, true);

      expect(decoded).toEqual(originalData);
    });

    it('should throw error for invalid blob size', async () => {
      const invalidBlob = new Uint8Array(100);

      await expect(decodeBlob(invalidBlob)).rejects.toThrow(BlobKitError);
    });
  });

  describe('computeContentHash', () => {
    it('should compute keccak256 hash', () => {
      const data = new Uint8Array([1, 2, 3]);
      const hash = computeContentHash(data);

      expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should produce consistent hashes', () => {
      const data = new Uint8Array([1, 2, 3]);
      const hash1 = computeContentHash(data);
      const hash2 = computeContentHash(data);

      expect(hash1).toBe(hash2);
    });
  });
});

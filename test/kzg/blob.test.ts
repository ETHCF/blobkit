import { blobToFieldElements, evaluatePolynomial } from '../../src/kzg/blob';
import { Fr } from '../../src/kzg/field';
import { BYTES_PER_BLOB, FIELD_ELEMENTS_PER_BLOB } from '../../src/kzg/constants';

describe('Blob Operations', () => {
  describe('blobToFieldElements', () => {
    it('should convert zero blob to field elements', () => {
      const blob = new Uint8Array(BYTES_PER_BLOB);
      const elements = blobToFieldElements(blob);
      
      expect(elements).toHaveLength(FIELD_ELEMENTS_PER_BLOB);
      expect(elements.every(e => e === 0n)).toBe(true);
    });

    it('should convert blob with data to field elements', () => {
      const blob = new Uint8Array(BYTES_PER_BLOB);
      
      // Set some non-zero values
      blob[31] = 1;   // First field element = 1
      blob[63] = 2;   // Second field element = 2
      blob[95] = 255; // Third field element = 255
      
      const elements = blobToFieldElements(blob);
      
      expect(elements[0]).toBe(1n);
      expect(elements[1]).toBe(2n);
      expect(elements[2]).toBe(255n);
    });

    it('should handle field element boundary', () => {
      const blob = new Uint8Array(BYTES_PER_BLOB);
      
      // Set bytes in first field element to 255, but keep first byte as 0
      for (let i = 1; i < 32; i++) {
        blob[i] = 255;
      }
      
      const elements = blobToFieldElements(blob);
      
      // Should create a large but valid field element
      expect(elements[0]).toBeGreaterThan(0n);
    });

    it('should preserve field element ordering', () => {
      const blob = new Uint8Array(BYTES_PER_BLOB);
      
      // Set different patterns
      for (let i = 0; i < 5; i++) {
        blob[32 * i + 31] = i + 1; // Last byte of each field element
      }
      
      const elements = blobToFieldElements(blob);
      
      for (let i = 0; i < 5; i++) {
        expect(elements[i]).toBe(BigInt(i + 1));
      }
    });

    it('should handle maximum field elements', () => {
      const blob = new Uint8Array(BYTES_PER_BLOB);
      const elements = blobToFieldElements(blob);
      
      expect(elements).toHaveLength(FIELD_ELEMENTS_PER_BLOB);
    });

    it('should fail with invalid blob size', () => {
      const invalidBlob = new Uint8Array(100);
      
      expect(() => blobToFieldElements(invalidBlob)).toThrow();
    });

    it('should handle empty blob data', () => {
      const blob = new Uint8Array(BYTES_PER_BLOB);
      const elements = blobToFieldElements(blob);
      
      // All elements should be zero
      expect(elements.every(e => e === 0n)).toBe(true);
    });

    it('should maintain consistent conversion', () => {
      const blob = new Uint8Array(BYTES_PER_BLOB);
      
      // Fill with predictable pattern, respecting field element constraints
      for (let i = 0; i < BYTES_PER_BLOB; i++) {
        if (i % 32 === 0) {
          blob[i] = 0; // First byte of each field element must be 0
        } else {
          blob[i] = i % 256;
        }
      }
      
      const elements1 = blobToFieldElements(blob);
      const elements2 = blobToFieldElements(blob);
      
      expect(elements1).toEqual(elements2);
    });

    it('should handle sparse data correctly', () => {
      const blob = new Uint8Array(BYTES_PER_BLOB);
      
      // Set only specific positions
      blob[100] = 42;
      blob[1000] = 73;
      blob[10000] = 199;
      
      const elements = blobToFieldElements(blob);
      
      // Should have non-zero elements at expected positions
      const elem3 = Math.floor(100 / 32);
      const elem31 = Math.floor(1000 / 32);
      const elem312 = Math.floor(10000 / 32);
      
      expect(elements[elem3]).toBeGreaterThan(0n);
      expect(elements[elem31]).toBeGreaterThan(0n);
      expect(elements[elem312]).toBeGreaterThan(0n);
    });
  });

  describe('evaluatePolynomial', () => {
    it('should evaluate constant polynomial', () => {
      const coeffs = [42n];
      const x = 10n;
      const result = evaluatePolynomial(coeffs, x, Fr);
      
      expect(result).toBe(42n);
    });

    it('should evaluate linear polynomial', () => {
      // p(x) = 3 + 5x
      const coeffs = [3n, 5n];
      const x = 2n;
      const result = evaluatePolynomial(coeffs, x, Fr);
      
      // p(2) = 3 + 5*2 = 13
      expect(result).toBe(13n);
    });

    it('should evaluate quadratic polynomial', () => {
      // p(x) = 1 + 2x + 3x^2
      const coeffs = [1n, 2n, 3n];
      const x = 4n;
      const result = evaluatePolynomial(coeffs, x, Fr);
      
      // p(4) = 1 + 2*4 + 3*16 = 1 + 8 + 48 = 57
      expect(result).toBe(57n);
    });

    it('should handle sparse polynomial coefficients', () => {
      const coeffs = new Array(1000).fill(0n);
      coeffs[0] = 1n;   // x^0 term
      coeffs[500] = 2n; // x^500 term
      coeffs[999] = 3n; // x^999 term
      
      const x = 2n;
      const result = evaluatePolynomial(coeffs, x, Fr);
      
      // Should compute without error
      expect(typeof result).toBe('bigint');
    });

    it('should handle zero polynomial', () => {
      const coeffs = [0n, 0n, 0n];
      const x = 100n;
      const result = evaluatePolynomial(coeffs, x, Fr);
      
      expect(result).toBe(0n);
    });

    it('should evaluate at different points', () => {
      // p(x) = 7 + 3x + 2x^2
      const coeffs = [7n, 3n, 2n];
      
      // Test multiple points
      const points = [0n, 1n, 2n, 5n, 10n];
      const expected = [7n, 12n, 21n, 72n, 237n];
      
      points.forEach((x, i) => {
        const result = evaluatePolynomial(coeffs, x, Fr);
        expect(result).toBe(expected[i]);
      });
    });

    it('should handle edge case with x = 0', () => {
      const coeffs = [5n];
      const x = 0n;
      const result = evaluatePolynomial(coeffs, x, Fr);
      
      expect(result).toBe(5n);
    });
  });
});
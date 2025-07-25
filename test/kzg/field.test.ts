import { Fr } from '../../src/kzg/field';
import { bls12_381 as bls } from '@noble/curves/bls12-381';

describe('Field Arithmetic', () => {
  describe('Fr operations', () => {
    it('should perform addition correctly', () => {
      const a = 5n;
      const b = 7n;
      const result = Fr.add(a, b);
      expect(result).toBe(12n);
    });

    it('should perform subtraction correctly', () => {
      const a = 10n;
      const b = 3n;
      const result = Fr.sub(a, b);
      expect(result).toBe(7n);
    });

    it('should perform multiplication correctly', () => {
      const a = 6n;
      const b = 7n;
      const result = Fr.mul(a, b);
      expect(result).toBe(42n);
    });

    it('should perform negation correctly', () => {
      const a = 5n;
      const neg = Fr.neg(a);
      const sum = Fr.add(a, neg);
      expect(sum).toBe(Fr.ZERO);
    });

    it('should handle modular arithmetic', () => {
      // Test that operations wrap around the modulus
      const nearMax = bls.fields.Fr.ORDER - 1n;
      const a = nearMax;
      const b = 2n;
      const result = Fr.add(a, b);
      // (ORDER - 1) + 2 = ORDER + 1 ≡ 1 (mod ORDER)
      expect(result).toBe(Fr.ONE);
    });

    it('should handle ORDER constant', () => {
      // Fr doesn't have ORDER, but we can test operations still work
      const order = bls.fields.Fr.ORDER;
      const a = order - 1n;
      const b = 1n;
      const result = Fr.add(a, b);
      // Should wrap to 0
      expect(result).toBe(Fr.ZERO);
    });

    it('should handle zero correctly', () => {
      const zero = Fr.ZERO;
      const five = 5n;
      
      expect(Fr.add(zero, five)).toBe(five);
      expect(Fr.mul(zero, five)).toBe(zero);
      expect(Fr.sub(five, five)).toBe(zero);
    });

    it('should handle one correctly', () => {
      const one = Fr.ONE;
      const five = 5n;
      
      expect(Fr.mul(one, five)).toBe(five);
    });

    it('should perform division correctly', () => {
      const a = 20n;
      const b = 4n;
      const result = Fr.div(a, b);
      expect(result).toBe(5n);
    });

    it('should compute multiplicative inverse', () => {
      const a = 7n;
      const inv = Fr.inv(a);
      const product = Fr.mul(a, inv);
      expect(product).toBe(Fr.ONE);
    });

    it('should compute power correctly', () => {
      const a = 3n;
      const n = 4n;
      const result = Fr.pow(a, n);
      expect(result).toBe(81n); // 3^4 = 81
    });

    it('should handle division by inverse', () => {
      const a = 15n;
      const b = 3n;
      
      // a / b should equal a * inv(b)
      const div1 = Fr.div(a, b);
      const div2 = Fr.mul(a, Fr.inv(b));
      expect(div1).toBe(div2);
    });
  });
});
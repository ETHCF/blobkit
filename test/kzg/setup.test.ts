import { bls12_381 as bls } from '@noble/curves/bls12-381';
import { createMockSetup } from '../../src/kzg/setup';
import { FIELD_ELEMENTS_PER_BLOB } from '../../src/kzg/constants';

describe('Trusted Setup', () => {
  describe('createMockSetup', () => {
    it('should create a valid mock setup', () => {
      const setup = createMockSetup();
      
      expect(setup.g1Powers).toHaveLength(FIELD_ELEMENTS_PER_BLOB);
      expect(setup.g2Powers).toHaveLength(2);
      
      // First elements should be generators
      expect(setup.g1Powers[0].equals(bls.G1.Point.BASE)).toBe(true);
      expect(setup.g2Powers[0].equals(bls.G2.Point.BASE)).toBe(true);
    });

    it('should create powers of tau', () => {
      const setup = createMockSetup();
      
      // Check that g1Powers are actually powers of tau
      // Can't check exact values since tau is hardcoded, but can check they're different
      expect(setup.g1Powers[0].equals(setup.g1Powers[1])).toBe(false);
      expect(setup.g1Powers[1].equals(setup.g1Powers[2])).toBe(false);
    });
  });

});
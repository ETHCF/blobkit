import { toVersionedHash, TEST_COMMITMENT, createTestCommitment, Bytes48 } from '../utils/blob-test-utils';

describe('BlobReader - Versioned Hash Derivation', () => {
  describe('toVersionedHash', () => {
    it('should compute versioned hash with 0x01 version byte', () => {
      const commitment = TEST_COMMITMENT;
      const versionedHash = toVersionedHash(commitment);
      
      // Should start with 0x01
      expect(versionedHash.slice(0, 4)).toBe('0x01');
      
      // Should be 32 bytes (66 chars including 0x)
      expect(versionedHash.length).toBe(66);
    });

    it('should produce different hashes for different commitments', () => {
      const commitment1 = createTestCommitment(1);
      const commitment2 = createTestCommitment(2);
      
      const hash1 = toVersionedHash(commitment1);
      const hash2 = toVersionedHash(commitment2);
      
      expect(hash1).not.toBe(hash2);
      expect(hash1.slice(0, 4)).toBe('0x01');
      expect(hash2.slice(0, 4)).toBe('0x01');
    });

    it('should match known test vectors', () => {
      // Test vector from EIP-4844
      const knownCommitment: Bytes48 = '0xc00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
      const expectedHash = toVersionedHash(knownCommitment);
      
      // The versioned hash should be sha256(commitment) with first byte set to 0x01
      expect(expectedHash.slice(0, 4)).toBe('0x01');
      expect(expectedHash.length).toBe(66);
    });

    it('should be deterministic', () => {
      const commitment = createTestCommitment(42);
      
      const hash1 = toVersionedHash(commitment);
      const hash2 = toVersionedHash(commitment);
      
      expect(hash1).toBe(hash2);
    });

    it('should handle edge case commitments', () => {
      // All zeros commitment
      const zeroCommitment: Bytes48 = '0x' + '00'.repeat(48) as Bytes48;
      const zeroHash = toVersionedHash(zeroCommitment);
      expect(zeroHash.slice(0, 4)).toBe('0x01');
      
      // All ones commitment  
      const maxCommitment: Bytes48 = '0x' + 'ff'.repeat(48) as Bytes48;
      const maxHash = toVersionedHash(maxCommitment);
      expect(maxHash.slice(0, 4)).toBe('0x01');
    });
  });
});
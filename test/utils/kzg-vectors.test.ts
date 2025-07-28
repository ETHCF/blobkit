import { bls12_381 as bls } from '@noble/curves/bls12-381';
import {
  blobToKZGCommitment,
  computeKZGProof,
  verifyKZGProof,
  commitmentToVersionedHash,
  loadTrustedSetup,
  createMockSetup
} from '../../src/kzg';
import { BYTES_PER_BLOB } from '../../src/kzg/constants';
import { BlobKitError } from '../../src/types';

const BLOB_SIZE = BYTES_PER_BLOB;

describe('KZG Test Vectors', () => {
  beforeAll(() => {
    const mockSetup = createMockSetup();
    loadTrustedSetup(mockSetup);
  });

  describe('Official Test Vectors', () => {
    it('should pass official test vector for zero blob', async () => {
      const blob = new Uint8Array(BLOB_SIZE);
      
      // Generate commitment
      const commitment = await blobToKZGCommitment(blob);
      expect(commitment).toBeInstanceOf(Uint8Array);
      expect(commitment.length).toBe(48);
      
      // Zero blob should give zero/identity commitment
      const zeroPoint = bls.G1.Point.ZERO.toRawBytes(true);
      expect(commitment).toEqual(zeroPoint);
    });
  });

  describe('Edge Cases', () => {
    it('should handle blob with single non-zero element', async () => {
      const blob = new Uint8Array(BLOB_SIZE);
      blob[31] = 1; // Set last byte of first field element to 1
      
      const commitment = await blobToKZGCommitment(blob);
      expect(commitment).toBeInstanceOf(Uint8Array);
      
      // Should be G1 generator
      const expected = bls.G1.Point.BASE.toRawBytes(true);
      expect(commitment).toEqual(expected);
    });

    it('should handle different coefficient values', async () => {
      const blob = new Uint8Array(BLOB_SIZE);
      blob[31] = 5; // a0 = 5
      
      const commitment = await blobToKZGCommitment(blob);
      
      // Should be 5 * G1
      const expected = bls.G1.Point.BASE.multiply(5n).toRawBytes(true);
      expect(commitment).toEqual(expected);
    });

    it('should create distinct commitments for different blobs', async () => {
      const blob1 = new Uint8Array(BLOB_SIZE);
      const blob2 = new Uint8Array(BLOB_SIZE);
      blob1[31] = 1;
      blob2[31] = 2;
      
      const commitment1 = await blobToKZGCommitment(blob1);
      const commitment2 = await blobToKZGCommitment(blob2);
      
      expect(commitment1).not.toEqual(commitment2);
    });
  });

  describe('Versioned Hash', () => {
    it('should compute versioned hash with correct prefix', async () => {
      const blob = new Uint8Array(BLOB_SIZE);
      blob[1] = 42;
      
      const commitment = await blobToKZGCommitment(blob);
      const versionedHash = commitmentToVersionedHash(commitment);
      
      expect(versionedHash[0]).toBe(0x01);
      expect(versionedHash.length).toBe(32);
    });

    it('should produce different versioned hashes for different blobs', async () => {
      const blob1 = new Uint8Array(BLOB_SIZE);
      const blob2 = new Uint8Array(BLOB_SIZE);
      blob1[1] = 1;
      blob2[1] = 2;
      
      const commitment1 = await blobToKZGCommitment(blob1);
      const commitment2 = await blobToKZGCommitment(blob2);
      
      const hash1 = commitmentToVersionedHash(commitment1);
      const hash2 = commitmentToVersionedHash(commitment2);
      
      expect(hash1).not.toEqual(hash2);
    });
  });

  describe('Error Handling', () => {
    it('should reject blob with invalid size', async () => {
      const invalidBlob = new Uint8Array(1000);
      
      await expect(blobToKZGCommitment(invalidBlob)).rejects.toThrow(BlobKitError);
    });

    it('should reject blob with invalid field elements', async () => {
      const blob = new Uint8Array(BLOB_SIZE);
      // Set first byte of field element to non-zero
      blob[32] = 1;
      
      await expect(blobToKZGCommitment(blob)).rejects.toThrow(BlobKitError);
    });

  });

  describe('Consistency Tests', () => {
    it('should produce consistent commitments for same input', async () => {
      const blob = new Uint8Array(BLOB_SIZE);
      // Set some non-zero values
      blob[31] = 10;
      blob[63] = 20;
      blob[95] = 30;
      
      // Multiple runs should produce same results
      const commitment1 = await blobToKZGCommitment(blob);
      const commitment2 = await blobToKZGCommitment(blob);
      expect(commitment1).toEqual(commitment2);
    });

    it('should verify constant polynomial proofs', async () => {
      const blob = new Uint8Array(BLOB_SIZE);
      blob[31] = 42; // p(x) = 42
      
      const commitment = await blobToKZGCommitment(blob);
      
      // For constant polynomial, value is always 42 regardless of evaluation point
      const points = [0n, 1n, 10n, 100n];
      
      for (const z of points) {
        const { proof, claimedValue } = await computeKZGProof(blob, z);
        expect(claimedValue).toBe(42n);
        
        const isValid = await verifyKZGProof(commitment, z, claimedValue, proof);
        expect(isValid).toBe(true);
        
        // Wrong value should fail
        const wrongValid = await verifyKZGProof(commitment, z, 43n, proof);
        expect(wrongValid).toBe(false);
      }
    });
  });
});
import {
  blobToKZGCommitment,
  computeKZGProof,
  verifyKZGProof,
  commitmentToVersionedHash,
  loadTrustedSetup,
  createMockSetup
} from '../../src/kzg';
import { FIELD_ELEMENTS_PER_BLOB, BYTES_PER_BLOB } from '../../src/kzg/constants';
import { BlobKitError } from '../../src/types';

const BLOB_SIZE = BYTES_PER_BLOB; // 131072 bytes

describe('KZG Module', () => {
  beforeAll(() => {
    // Initialize mock trusted setup for tests
    const mockSetup = createMockSetup();
    loadTrustedSetup(mockSetup);
  });

  describe('Blob Format Validation', () => {
    it('should accept properly formatted blob', async () => {
      const blob = new Uint8Array(BLOB_SIZE);
      // Ensure first byte of each field element is 0
      for (let i = 0; i < FIELD_ELEMENTS_PER_BLOB; i++) {
        blob[i * 32] = 0;
      }

      // Should not throw
      await expect(blobToKZGCommitment(blob)).resolves.toBeDefined();
    });

    it('should reject blob with invalid size', async () => {
      const blob = new Uint8Array(1000); // Wrong size

      await expect(blobToKZGCommitment(blob)).rejects.toThrow(BlobKitError);
    });

    it('should reject blob with invalid field elements', async () => {
      const blob = new Uint8Array(BLOB_SIZE);
      // Set first byte of a field element to non-zero
      blob[32] = 1;

      await expect(blobToKZGCommitment(blob)).rejects.toThrow(BlobKitError);
    });

  });

  describe('Commitment', () => {
    it('should produce consistent commitments for same blob', async () => {
      const blob = new Uint8Array(BLOB_SIZE);
      // Add some data
      for (let i = 0; i < 100; i++) {
        blob[i * 32 + 1] = i % 256;
      }

      const commitment1 = await blobToKZGCommitment(blob);
      const commitment2 = await blobToKZGCommitment(blob);

      expect(commitment1).toEqual(commitment2);
    });

    it('should produce different commitments for different blobs', async () => {
      const blob1 = new Uint8Array(BLOB_SIZE);
      const blob2 = new Uint8Array(BLOB_SIZE);

      // Different data
      blob1[1] = 1;
      blob2[1] = 2;

      const commitment1 = await blobToKZGCommitment(blob1);
      const commitment2 = await blobToKZGCommitment(blob2);

      expect(commitment1).not.toEqual(commitment2);
    });

    it('should produce 48-byte G1 point commitment', async () => {
      const blob = new Uint8Array(BLOB_SIZE);
      const commitment = await blobToKZGCommitment(blob);

      expect(commitment).toBeInstanceOf(Uint8Array);
      expect(commitment.length).toBe(48);
    });
  });

  describe('Proof Generation', () => {
    it('should generate proof for zero blob', async () => {
      const blob = new Uint8Array(BLOB_SIZE);
      // Zero blob: p(x) = 0

      const evaluationPoint = 1n;
      const { proof, claimedValue } = await computeKZGProof(blob, evaluationPoint);

      expect(proof).toBeInstanceOf(Uint8Array);
      expect(proof.length).toBe(48); // G1 point
      expect(claimedValue).toBe(0n); // p(1) = 0
    });

    it('should generate proof for constant polynomial', async () => {
      const blob = new Uint8Array(BLOB_SIZE);
      blob[31] = 5; // a0 = 5, so p(x) = 5

      const evaluationPoint = 10n;
      const { proof, claimedValue } = await computeKZGProof(blob, evaluationPoint);

      expect(proof).toBeInstanceOf(Uint8Array);
      expect(proof.length).toBe(48);
      expect(claimedValue).toBe(5n); // p(10) = 5
    });
  });

  describe('Proof Verification', () => {
    it('should verify valid proof for zero blob', async () => {
      const blob = new Uint8Array(BLOB_SIZE);
      // Zero blob

      const commitment = await blobToKZGCommitment(blob);
      const evaluationPoint = 1n;

      // Generate proof
      const { proof, claimedValue } = await computeKZGProof(blob, evaluationPoint);

      // Verify
      const isValid = await verifyKZGProof(
        commitment,
        evaluationPoint,
        claimedValue,
        proof
      );

      expect(isValid).toBe(true);
    });

    it('should verify valid proof for constant polynomial', async () => {
      const blob = new Uint8Array(BLOB_SIZE);
      blob[31] = 7; // a0 = 7

      const commitment = await blobToKZGCommitment(blob);
      const evaluationPoint = 99n;
      const { proof, claimedValue } = await computeKZGProof(blob, evaluationPoint);

      // Verify correct value
      expect(claimedValue).toBe(7n);
      
      const isValid = await verifyKZGProof(
        commitment,
        evaluationPoint,
        claimedValue,
        proof
      );

      expect(isValid).toBe(true);
    });

    it('should reject proof with wrong value', async () => {
      const blob = new Uint8Array(BLOB_SIZE);
      blob[31] = 1; // a0 = 1

      const commitment = await blobToKZGCommitment(blob);
      const evaluationPoint = 1n;
      const { proof } = await computeKZGProof(blob, evaluationPoint);

      // Wrong value
      const wrongValue = 999n;

      const isValid = await verifyKZGProof(
        commitment,
        evaluationPoint,
        wrongValue,
        proof
      );

      expect(isValid).toBe(false);
    });

    it('should handle invalid proof data gracefully', async () => {
      const invalidCommitment = new Uint8Array(48);
      const invalidProof = new Uint8Array(48);

      const isValid = await verifyKZGProof(
        invalidCommitment,
        1n,
        1n,
        invalidProof
      );

      expect(isValid).toBe(false);
    });
  });

  describe('Versioned Hash', () => {
    it('should compute versioned hash with 0x01 prefix', () => {
      const commitment = new Uint8Array(48);
      commitment[0] = 0xab;

      const versionedHash = commitmentToVersionedHash(commitment);

      expect(versionedHash[0]).toBe(0x01);
      expect(versionedHash.length).toBe(32);
    });

    it('should format versioned hash as hex string', () => {
      const commitment = new Uint8Array(48);

      const versionedHash = commitmentToVersionedHash(commitment);
      const formatted = '0x' + Buffer.from(versionedHash).toString('hex');

      expect(formatted).toMatch(/^0x01[0-9a-f]{62}$/);
      expect(formatted.length).toBe(66); // 0x + 64 hex chars
    });

    it('should produce different hashes for different commitments', () => {
      const commitment1 = new Uint8Array(48);
      const commitment2 = new Uint8Array(48);
      commitment1[0] = 1;
      commitment2[0] = 2;

      const hash1 = commitmentToVersionedHash(commitment1);
      const hash2 = commitmentToVersionedHash(commitment2);

      expect(hash1).not.toEqual(hash2);
      expect(hash1[0]).toBe(0x01);
      expect(hash2[0]).toBe(0x01);
    });
  });

  describe('Integration', () => {
    it('should handle full KZG workflow', async () => {
      // Create a blob with some data
      const blob = new Uint8Array(BLOB_SIZE);
      const testData = 'Hello, KZG!';
      const encoded = new TextEncoder().encode(testData);

      // Place data in blob (respecting field element format)
      for (let i = 0; i < encoded.length; i++) {
        blob[i * 32 + 1] = encoded[i];
      }

      // Generate commitment
      const commitment = await blobToKZGCommitment(blob);
      expect(commitment.length).toBe(48);

      // Generate proof for evaluation at point 0 (common in EIP-4844)
      const { proof } = await computeKZGProof(blob, 0n);
      expect(proof.length).toBe(48);

      // Compute versioned hash
      const versionedHash = commitmentToVersionedHash(commitment);
      const formatted = '0x' + Buffer.from(versionedHash).toString('hex');
      expect(formatted).toMatch(/^0x01[0-9a-f]{62}$/);
    });
  });
});

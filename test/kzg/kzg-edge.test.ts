import {
  blobToKZGCommitment,
  computeKZGProof,
  verifyKZGProof,
  loadTrustedSetup,
  getTrustedSetup,
  createMockSetup
} from '../../src/kzg';
import { BYTES_PER_BLOB } from '../../src/kzg/constants';

describe('KZG Edge Cases', () => {
  describe('Trusted Setup Management', () => {
    it('should throw error when no trusted setup is loaded', async () => {
      // Clear any existing setup
      loadTrustedSetup(null as any);
      
      const blob = new Uint8Array(BYTES_PER_BLOB);
      
      await expect(blobToKZGCommitment(blob))
        .rejects.toThrow('Trusted setup not loaded');
    });

    it('should handle mock setup correctly', async () => {
      const mockSetup = createMockSetup();
      loadTrustedSetup(mockSetup);
      
      const blob = new Uint8Array(BYTES_PER_BLOB);
      blob[31] = 1; // Set some data
      
      const commitment = await blobToKZGCommitment(blob);
      expect(commitment).toHaveLength(48);
    });

    it('should retrieve loaded trusted setup', () => {
      const mockSetup = createMockSetup();
      loadTrustedSetup(mockSetup);
      
      const retrievedSetup = getTrustedSetup();
      expect(retrievedSetup).toBe(mockSetup);
    });
  });

  describe('Blob Validation', () => {
    beforeEach(() => {
      // Ensure we have a valid setup for tests
      const mockSetup = createMockSetup();
      loadTrustedSetup(mockSetup);
    });

    it('should reject blob with invalid size', async () => {
      const invalidBlob = new Uint8Array(1000); // Wrong size
      
      await expect(blobToKZGCommitment(invalidBlob))
        .rejects.toThrow();
    });

    it('should handle empty blob', async () => {
      const blob = new Uint8Array(BYTES_PER_BLOB);
      
      const commitment = await blobToKZGCommitment(blob);
      expect(commitment).toHaveLength(48);
    });

    it('should handle blob with maximum valid data', async () => {
      const blob = new Uint8Array(BYTES_PER_BLOB);
      
      // Fill with valid field element data (first byte of each 32-byte chunk must be 0)
      for (let i = 0; i < 4096; i++) {
        blob[i * 32] = 0; // First byte must be 0
        for (let j = 1; j < 32; j++) {
          blob[i * 32 + j] = 255; // Fill remaining bytes
        }
      }
      
      const commitment = await blobToKZGCommitment(blob);
      expect(commitment).toHaveLength(48);
    });
  });

  describe('KZG Proof Generation', () => {
    beforeEach(() => {
      const mockSetup = createMockSetup();
      loadTrustedSetup(mockSetup);
    });

    it('should generate proof for valid blob and point', async () => {
      const blob = new Uint8Array(BYTES_PER_BLOB);
      blob[31] = 42; // Set some data
      
      const evaluationPoint = 3n;
      const { claimedValue } = await computeKZGProof(blob, evaluationPoint);
      
      expect(typeof claimedValue).toBe('bigint');
    });

    it('should handle proof at point zero', async () => {
      const blob = new Uint8Array(BYTES_PER_BLOB);
      blob[31] = 1;
      
      const { claimedValue } = await computeKZGProof(blob, 0n);
      expect(claimedValue).toBe(1n); // Should be first coefficient
    });
  });

  describe('KZG Verification', () => {
    beforeEach(() => {
      const mockSetup = createMockSetup();
      loadTrustedSetup(mockSetup);
    });

    it('should verify valid proof', async () => {
      const blob = new Uint8Array(BYTES_PER_BLOB);
      blob[31] = 5;
      
      const commitment = await blobToKZGCommitment(blob);
      const evaluationPoint = 7n;
      const { proof, claimedValue } = await computeKZGProof(blob, evaluationPoint);
      
      const isValid = await verifyKZGProof(
        commitment,
        evaluationPoint,
        claimedValue,
        proof
      );
      
      expect(isValid).toBe(true);
    });

    it('should reject invalid proof', async () => {
      const blob = new Uint8Array(BYTES_PER_BLOB);
      blob[31] = 5;
      
      const commitment = await blobToKZGCommitment(blob);
      const evaluationPoint = 7n;
      const { proof } = await computeKZGProof(blob, evaluationPoint);
      
      // Use wrong claimed value
      const wrongClaimedValue = 999n;
      
      const isValid = await verifyKZGProof(
        commitment,
        evaluationPoint,
        wrongClaimedValue,
        proof
      );
      
      expect(isValid).toBe(false);
    });

    it('should handle verification with zero values', async () => {
      const blob = new Uint8Array(BYTES_PER_BLOB);
      
      const commitment = await blobToKZGCommitment(blob);
      const { proof, claimedValue } = await computeKZGProof(blob, 0n);
      
      const isValid = await verifyKZGProof(
        commitment,
        0n,
        claimedValue,
        proof
      );
      
      expect(isValid).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed commitment data', async () => {
      const mockSetup = createMockSetup();
      loadTrustedSetup(mockSetup);
      
      const invalidCommitment = new Uint8Array(20); // Wrong size
      
      const isValid = await verifyKZGProof(
        invalidCommitment,
        1n,
        1n,
        new Uint8Array(48)
      );
      
      expect(isValid).toBe(false);
    });

    it('should handle malformed proof data', async () => {
      const mockSetup = createMockSetup();
      loadTrustedSetup(mockSetup);
      
      const blob = new Uint8Array(BYTES_PER_BLOB);
      const commitment = await blobToKZGCommitment(blob);
      const invalidProof = new Uint8Array(20); // Wrong size
      
      const isValid = await verifyKZGProof(
        commitment,
        1n,
        1n,
        invalidProof
      );
      
      expect(isValid).toBe(false);
    });
  });
});
describe('BlobReader - Validation and Normalization', () => {
  const MAX_BLOBS_PER_BLOCK = 6; // Protocol constant

  describe('indices validation', () => {
    it('should accept valid indices within bounds', () => {
      const validIndices = [0, 1, 2, 3, 4, 5];
      expect(() => validateIndices(validIndices)).not.toThrow();
    });

    it('should reject indices exceeding max blobs per block', () => {
      const invalidIndices = [0, 1, 2, 3, 4, 5, 6]; // 7 indices
      expect(() => validateIndices(invalidIndices)).toThrow('Indices exceed max blobs per block');
    });

    it('should reject negative indices', () => {
      const invalidIndices = [-1, 0, 1];
      expect(() => validateIndices(invalidIndices)).toThrow('Invalid index: -1');
    });

    it('should reject duplicate indices', () => {
      const duplicateIndices = [0, 1, 1, 2];
      expect(() => validateIndices(duplicateIndices)).toThrow('Duplicate blob indices');
    });

    it('should accept empty indices array', () => {
      const emptyIndices: number[] = [];
      expect(() => validateIndices(emptyIndices)).not.toThrow();
    });

    it('should reject non-integer indices', () => {
      const invalidIndices = [0, 1.5, 2];
      expect(() => validateIndices(invalidIndices)).toThrow('Invalid index: 1.5');
    });
  });

  describe('blockId normalization', () => {
    it('should accept special block tags', () => {
      expect(normalizeBlockId('head')).toBe('head');
      expect(normalizeBlockId('finalized')).toBe('finalized');
      expect(normalizeBlockId('genesis')).toBe('genesis');
    });

    it('should accept numeric slot', () => {
      expect(normalizeBlockId(123456)).toBe('123456');
      expect(normalizeBlockId('123456')).toBe('123456');
    });

    it('should accept beacon block root (32 bytes)', () => {
      const blockRoot = '0x' + 'a'.repeat(64); // 32 bytes
      expect(normalizeBlockId(blockRoot)).toBe(blockRoot);
    });

    it('should reject invalid beacon block root', () => {
      const invalidRoot = '0x' + 'a'.repeat(63); // Not 32 bytes
      expect(() => normalizeBlockId(invalidRoot)).toThrow('Invalid beacon block root');
    });

    it('should reject invalid block tags', () => {
      expect(() => normalizeBlockId('latest')).toThrow('Invalid blockId');
      expect(() => normalizeBlockId('pending')).toThrow('Invalid blockId');
    });

    it('should handle edge cases', () => {
      expect(normalizeBlockId(0)).toBe('0'); // Genesis slot
      expect(normalizeBlockId('0')).toBe('0');
    });
  });

  describe('combined validation', () => {
    it('should validate block and indices together', () => {
      const blockId = 'head';
      const indices = [0, 1, 2];
      
      expect(() => validateBlobRequest(blockId, indices)).not.toThrow();
    });

    it('should handle undefined indices', () => {
      const blockId = 'finalized';
      
      expect(() => validateBlobRequest(blockId, undefined)).not.toThrow();
    });
  });
});

// Helper functions that will be implemented in the actual code
function validateIndices(indices: number[]): void {
  const MAX_BLOBS_PER_BLOCK = 6;
  
  if (indices.length > MAX_BLOBS_PER_BLOCK) {
    throw new Error(`Indices exceed max blobs per block (${MAX_BLOBS_PER_BLOCK})`);
  }
  
  const seen = new Set<number>();
  for (const index of indices) {
    if (!Number.isInteger(index)) {
      throw new Error(`Invalid index: ${index}`);
    }
    if (index < 0) {
      throw new Error(`Invalid index: ${index}`);
    }
    if (seen.has(index)) {
      throw new Error('Duplicate blob indices');
    }
    seen.add(index);
  }
}

function normalizeBlockId(blockId: string | number): string {
  if (typeof blockId === 'number') {
    return blockId.toString();
  }
  
  // Special tags
  if (['head', 'finalized', 'genesis'].includes(blockId)) {
    return blockId;
  }
  
  // Numeric string (slot)
  if (/^\d+$/.test(blockId)) {
    return blockId;
  }
  
  // Beacon block root (32 bytes = 64 hex chars + 0x prefix)
  if (/^0x[a-fA-F0-9]{64}$/.test(blockId)) {
    return blockId;
  }
  
  throw new Error(`Invalid blockId: ${blockId}`);
}

function validateBlobRequest(blockId: string | number, indices?: number[]): void {
  normalizeBlockId(blockId);
  if (indices !== undefined) {
    validateIndices(indices);
  }
}
import { BlobSidecarsResponse } from '../utils/blob-test-utils';

type FinalityMode = 'allow-optimistic' | 'disallow-optimistic' | 'require-finalized';

describe('BlobReader - Finality Policy', () => {
  describe('allow-optimistic mode', () => {
    const policy = new FinalityPolicy('allow-optimistic');

    it('should accept finalized blocks', () => {
      const response: BlobSidecarsResponse = {
        data: [],
        execution_optimistic: false,
        finalized: true
      };
      
      expect(() => policy.check(response)).not.toThrow();
    });

    it('should accept optimistic blocks', () => {
      const response: BlobSidecarsResponse = {
        data: [],
        execution_optimistic: true,
        finalized: false
      };
      
      expect(() => policy.check(response)).not.toThrow();
    });

    it('should accept non-optimistic non-finalized blocks', () => {
      const response: BlobSidecarsResponse = {
        data: [],
        execution_optimistic: false,
        finalized: false
      };
      
      expect(() => policy.check(response)).not.toThrow();
    });
  });

  describe('disallow-optimistic mode', () => {
    const policy = new FinalityPolicy('disallow-optimistic');

    it('should accept finalized blocks', () => {
      const response: BlobSidecarsResponse = {
        data: [],
        execution_optimistic: false,
        finalized: true
      };
      
      expect(() => policy.check(response)).not.toThrow();
    });

    it('should reject optimistic blocks', () => {
      const response: BlobSidecarsResponse = {
        data: [],
        execution_optimistic: true,
        finalized: false
      };
      
      expect(() => policy.check(response)).toThrow(PolicyRejected);
      expect(() => policy.check(response)).toThrow(/disallow-optimistic.*execution_optimistic/);
    });

    it('should accept non-optimistic non-finalized blocks', () => {
      const response: BlobSidecarsResponse = {
        data: [],
        execution_optimistic: false,
        finalized: false
      };
      
      expect(() => policy.check(response)).not.toThrow();
    });

    it('should handle missing flags gracefully', () => {
      const response: BlobSidecarsResponse = {
        data: []
        // No flags provided
      };
      
      // Should assume safe defaults (non-optimistic)
      expect(() => policy.check(response)).not.toThrow();
    });
  });

  describe('require-finalized mode', () => {
    const policy = new FinalityPolicy('require-finalized');

    it('should accept finalized blocks', () => {
      const response: BlobSidecarsResponse = {
        data: [],
        execution_optimistic: false,
        finalized: true
      };
      
      expect(() => policy.check(response)).not.toThrow();
    });

    it('should reject non-finalized blocks', () => {
      const response: BlobSidecarsResponse = {
        data: [],
        execution_optimistic: false,
        finalized: false
      };
      
      expect(() => policy.check(response)).toThrow(PolicyRejected);
      expect(() => policy.check(response)).toThrow(/require-finalized.*not finalized/);
    });

    it('should reject optimistic blocks even if finalized flag is true', () => {
      const response: BlobSidecarsResponse = {
        data: [],
        execution_optimistic: true,
        finalized: true // Inconsistent state
      };
      
      expect(() => policy.check(response)).toThrow(PolicyRejected);
      expect(() => policy.check(response)).toThrow(/require-finalized.*execution_optimistic/);
    });

    it('should handle missing finalized flag as non-finalized', () => {
      const response: BlobSidecarsResponse = {
        data: [],
        execution_optimistic: false
        // No finalized flag
      };
      
      expect(() => policy.check(response)).toThrow(PolicyRejected);
    });
  });

  describe('policy decision matrix', () => {
    const testCases = [
      {
        mode: 'allow-optimistic' as FinalityMode,
        optimistic: true,
        finalized: false,
        shouldPass: true
      },
      {
        mode: 'allow-optimistic' as FinalityMode,
        optimistic: false,
        finalized: true,
        shouldPass: true
      },
      {
        mode: 'disallow-optimistic' as FinalityMode,
        optimistic: true,
        finalized: false,
        shouldPass: false
      },
      {
        mode: 'disallow-optimistic' as FinalityMode,
        optimistic: false,
        finalized: true,
        shouldPass: true
      },
      {
        mode: 'require-finalized' as FinalityMode,
        optimistic: false,
        finalized: false,
        shouldPass: false
      },
      {
        mode: 'require-finalized' as FinalityMode,
        optimistic: false,
        finalized: true,
        shouldPass: true
      }
    ];

    testCases.forEach(({ mode, optimistic, finalized, shouldPass }) => {
      it(`${mode} with optimistic=${optimistic} finalized=${finalized} should ${shouldPass ? 'pass' : 'fail'}`, () => {
        const policy = new FinalityPolicy(mode);
        const response: BlobSidecarsResponse = {
          data: [],
          execution_optimistic: optimistic,
          finalized: finalized
        };

        if (shouldPass) {
          expect(() => policy.check(response)).not.toThrow();
        } else {
          expect(() => policy.check(response)).toThrow(PolicyRejected);
        }
      });
    });
  });

  describe('error details', () => {
    it('should include mode and reason in PolicyRejected error', () => {
      const policy = new FinalityPolicy('require-finalized');
      const response: BlobSidecarsResponse = {
        data: [],
        execution_optimistic: false,
        finalized: false
      };

      try {
        policy.check(response);
        fail('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(PolicyRejected);
        expect(error.mode).toBe('require-finalized');
        expect(error.reason).toContain('not finalized');
      }
    });
  });
});

// Mock implementation for testing
class FinalityPolicy {
  constructor(private mode: FinalityMode) {}

  check(response: BlobSidecarsResponse): void {
    const optimistic = response.execution_optimistic || false;
    const finalized = response.finalized || false;

    switch (this.mode) {
      case 'allow-optimistic':
        // Accept everything
        break;
      
      case 'disallow-optimistic':
        if (optimistic) {
          throw new PolicyRejected(
            this.mode,
            'Block is execution_optimistic'
          );
        }
        break;
      
      case 'require-finalized':
        if (optimistic) {
          throw new PolicyRejected(
            this.mode,
            'Block is execution_optimistic'
          );
        }
        if (!finalized) {
          throw new PolicyRejected(
            this.mode,
            'Block is not finalized'
          );
        }
        break;
    }
  }
}

class PolicyRejected extends Error {
  constructor(
    public mode: FinalityMode,
    public reason: string
  ) {
    super(`Policy ${mode} rejected: ${reason}`);
    this.name = 'PolicyRejected';
  }
}
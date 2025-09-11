import { Hex } from '../utils/blob-test-utils';

describe('BlobReader - Error Handling', () => {
  describe('NotFoundWithinSlot', () => {
    it('should include versioned hashes, slot, and indices tested', () => {
      const error = new NotFoundWithinSlot(
        ['0x01abc...', '0x01def...'] as Hex[],
        123456,
        [0, 1, 2]
      );

      expect(error.versionedHashes).toEqual(['0x01abc...', '0x01def...']);
      expect(error.slot).toBe(123456);
      expect(error.indicesTested).toEqual([0, 1, 2]);
      expect(error.message).toContain('123456');
    });

    it('should handle undefined indices', () => {
      const error = new NotFoundWithinSlot(
        ['0x01abc...'] as Hex[],
        123456
      );

      expect(error.indicesTested).toBeUndefined();
    });
  });

  describe('ExpiredBlob', () => {
    it('should include slot and retention window', () => {
      const error = new ExpiredBlob(100000, 131072);

      expect(error.slot).toBe(100000);
      expect(error.retentionWindow).toBe(131072);
      expect(error.message).toContain('100000');
      expect(error.message).toContain('131072');
    });

    it('should calculate age correctly', () => {
      const currentSlot = 200000;
      const targetSlot = 100000;
      const retentionWindow = 131072;
      
      const error = new ExpiredBlob(targetSlot, retentionWindow, currentSlot);
      
      expect(error.message).toContain('age: 100000 slots');
    });
  });

  describe('IntegrityError', () => {
    it('should include versioned hash when provided', () => {
      const error = new IntegrityError('Proof verification failed', '0x01abc...' as Hex);

      expect(error.versionedHash).toBe('0x01abc...');
      expect(error.message).toContain('0x01abc...');
      expect(error.message).toContain('Proof verification failed');
    });

    it('should handle missing versioned hash', () => {
      const error = new IntegrityError('Invalid commitment');

      expect(error.versionedHash).toBeUndefined();
      expect(error.message).toContain('Invalid commitment');
    });
  });

  describe('ProviderUnavailable', () => {
    it('should include status code and retry after', () => {
      const error = new ProviderUnavailable(503, 30);

      expect(error.status).toBe(503);
      expect(error.retryAfter).toBe(30);
      expect(error.message).toContain('503');
      expect(error.message).toContain('30');
    });

    it('should handle missing retry after', () => {
      const error = new ProviderUnavailable(500);

      expect(error.status).toBe(500);
      expect(error.retryAfter).toBeUndefined();
    });

    it('should format message for rate limiting', () => {
      const error = new ProviderUnavailable(429, 60);

      expect(error.message).toContain('429');
      expect(error.message).toContain('retry after 60');
    });
  });

  describe('ReorgDetected', () => {
    it('should include block number and hash mismatch', () => {
      const error = new ReorgDetected(
        1000000,
        '0xexpected123',
        '0xactual456'
      );

      expect(error.blockNumber).toBe(1000000);
      expect(error.expectedHash).toBe('0xexpected123');
      expect(error.actualHash).toBe('0xactual456');
      expect(error.message).toContain('1000000');
      expect(error.message).toContain('0xexpected123');
      expect(error.message).toContain('0xactual456');
    });

    it('should handle missing actual hash', () => {
      const error = new ReorgDetected(
        1000000,
        '0xexpected123'
      );

      expect(error.actualHash).toBeUndefined();
      expect(error.message).toContain('Block not found');
    });
  });

  describe('PolicyRejected', () => {
    it('should include mode and reason', () => {
      const error = new PolicyRejected(
        'require-finalized',
        'Block is not finalized'
      );

      expect(error.mode).toBe('require-finalized');
      expect(error.reason).toBe('Block is not finalized');
      expect(error.message).toContain('require-finalized');
      expect(error.message).toContain('Block is not finalized');
    });
  });

  describe('Error hierarchy', () => {
    it('all errors should extend BlobReaderError', () => {
      const errors = [
        new NotFoundWithinSlot(['0x01'] as Hex[], 1),
        new ExpiredBlob(1, 100),
        new IntegrityError('test'),
        new ProviderUnavailable(500),
        new ReorgDetected(1, '0x1'),
        new PolicyRejected('allow-optimistic', 'test')
      ];

      errors.forEach(error => {
        expect(error).toBeInstanceOf(BlobReaderError);
        expect(error).toBeInstanceOf(Error);
      });
    });
  });

  describe('404 vs data:null normalization', () => {
    it('should treat 404 as no sidecars', () => {
      const response404 = { status: 404, data: undefined };
      const responseNull = { status: 200, data: null };

      const normalized404 = normalizeBeaconResponse(response404);
      const normalizedNull = normalizeBeaconResponse(responseNull);

      expect(normalized404).toEqual({ data: [], found: false });
      expect(normalizedNull).toEqual({ data: [], found: false });
    });

    it('should preserve empty array as found but empty', () => {
      const responseEmpty = { status: 200, data: [] };

      const normalized = normalizeBeaconResponse(responseEmpty);

      expect(normalized).toEqual({ data: [], found: true });
    });
  });

  describe('Duplicate index rejection', () => {
    it('should detect and reject duplicate blob indices', () => {
      const sidecars = [
        { index: '0', blob: '0x...', kzg_commitment: '0x...', kzg_proof: '0x...' },
        { index: '1', blob: '0x...', kzg_commitment: '0x...', kzg_proof: '0x...' },
        { index: '1', blob: '0x...', kzg_commitment: '0x...', kzg_proof: '0x...' } // Duplicate
      ];

      expect(() => validateSidecars(sidecars)).toThrow('Duplicate blob index: 1');
    });
  });

  describe('Expiration check', () => {
    it('should calculate slot age and check retention', () => {
      const currentSlot = 200000;
      const targetSlot = 50000;
      const retentionWindow = 131072; // ~18 days

      const isExpired = checkExpiration(targetSlot, currentSlot, retentionWindow);
      
      expect(isExpired).toBe(true); // 150000 > 131072
    });

    it('should not mark recent slots as expired', () => {
      const currentSlot = 200000;
      const targetSlot = 190000;
      const retentionWindow = 131072;

      const isExpired = checkExpiration(targetSlot, currentSlot, retentionWindow);
      
      expect(isExpired).toBe(false); // 10000 < 131072
    });
  });
});

// Base error class
class BlobReaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

// Specific error classes
class NotFoundWithinSlot extends BlobReaderError {
  constructor(
    public versionedHashes: Hex[],
    public slot: number,
    public indicesTested?: number[]
  ) {
    const indicesMsg = indicesTested ? `, indices tested: [${indicesTested.join(', ')}]` : '';
    super(`Blobs not found within slot ${slot}${indicesMsg}`);
  }
}

class ExpiredBlob extends BlobReaderError {
  constructor(
    public slot: number,
    public retentionWindow: number,
    currentSlot?: number
  ) {
    const ageMsg = currentSlot ? `, age: ${currentSlot - slot} slots` : '';
    super(`Blob at slot ${slot} is expired (retention: ${retentionWindow} slots${ageMsg})`);
  }
}

class IntegrityError extends BlobReaderError {
  constructor(
    message: string,
    public versionedHash?: Hex
  ) {
    const hashMsg = versionedHash ? ` for blob ${versionedHash}` : '';
    super(`${message}${hashMsg}`);
  }
}

class ProviderUnavailable extends BlobReaderError {
  constructor(
    public status: number,
    public retryAfter?: number
  ) {
    const retryMsg = retryAfter ? `, retry after ${retryAfter}s` : '';
    super(`Provider unavailable: ${status}${retryMsg}`);
  }
}

class ReorgDetected extends BlobReaderError {
  constructor(
    public blockNumber: number,
    public expectedHash: string,
    public actualHash?: string
  ) {
    const msg = actualHash 
      ? `Reorg detected at block ${blockNumber}: expected ${expectedHash}, got ${actualHash}`
      : `Reorg detected at block ${blockNumber}: Block not found (expected ${expectedHash})`;
    super(msg);
  }
}

class PolicyRejected extends BlobReaderError {
  constructor(
    public mode: string,
    public reason: string
  ) {
    super(`Policy ${mode} rejected: ${reason}`);
  }
}

// Helper functions
function normalizeBeaconResponse(response: any) {
  if (response.status === 404 || response.data === null) {
    return { data: [], found: false };
  }
  if (Array.isArray(response.data) && response.data.length === 0) {
    return { data: [], found: true };
  }
  return { data: response.data, found: true };
}

function validateSidecars(sidecars: any[]): void {
  const seen = new Set<string>();
  for (const sidecar of sidecars) {
    if (seen.has(sidecar.index)) {
      throw new Error(`Duplicate blob index: ${sidecar.index}`);
    }
    seen.add(sidecar.index);
  }
}

function checkExpiration(targetSlot: number, currentSlot: number, retentionWindow: number): boolean {
  const age = currentSlot - targetSlot;
  return age > retentionWindow;
}
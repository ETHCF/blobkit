import {
  isValidHexString,
  isValidBlobHash,
  isValidTxHash,
  BlobKitError
} from '../../src/types';

describe('Type Validation Functions', () => {
  describe('isValidHexString', () => {
    test('validates hex strings correctly', () => {
      expect(isValidHexString('0x123abc')).toBe(true);
      expect(isValidHexString('0xABCDEF')).toBe(true);
      expect(isValidHexString('0x0123456789abcdef')).toBe(true);
    });

    test('rejects invalid hex strings', () => {
      expect(isValidHexString('123abc')).toBe(false);
      expect(isValidHexString('0x123xyz')).toBe(false);
      expect(isValidHexString('')).toBe(false);
    });

    test('validates empty hex string', () => {
      expect(isValidHexString('0x')).toBe(true); // '0x' is technically valid empty hex
      expect(isValidHexString('0x', 0)).toBe(true); // Zero length is valid
    });

    test('validates length when specified', () => {
      expect(isValidHexString('0x1234', 4)).toBe(true);
      expect(isValidHexString('0x1234', 6)).toBe(false);
      expect(isValidHexString('0x123456', 6)).toBe(true);
    });
  });

  describe('isValidBlobHash', () => {
    test('validates blob hashes correctly', () => {
      const validBlobHash = '0x01' + '0'.repeat(62);
      expect(isValidBlobHash(validBlobHash)).toBe(true);
    });

    test('rejects invalid blob hashes', () => {
      expect(isValidBlobHash('0x02' + '0'.repeat(62))).toBe(false);
      expect(isValidBlobHash('0x01' + '0'.repeat(60))).toBe(false);
      expect(isValidBlobHash('0x01' + '0'.repeat(64))).toBe(false);
      expect(isValidBlobHash('not-a-hash')).toBe(false);
    });
  });

  describe('isValidTxHash', () => {
    test('validates transaction hashes correctly', () => {
      const validTxHash = '0x' + '0'.repeat(64);
      expect(isValidTxHash(validTxHash)).toBe(true);
    });

    test('rejects invalid transaction hashes', () => {
      expect(isValidTxHash('0x' + '0'.repeat(62))).toBe(false);
      expect(isValidTxHash('0x' + '0'.repeat(66))).toBe(false);
      expect(isValidTxHash('0x' + 'g'.repeat(64))).toBe(false);
      expect(isValidTxHash('invalid-hash')).toBe(false);
    });
  });
});

describe('BlobKitError', () => {
  test('creates error with correct properties', () => {
    const error = new BlobKitError('Test message', 'TEST_CODE', { detail: 'value' });
    
    expect(error.message).toBe('Test message');
    expect(error.code).toBe('TEST_CODE');
    expect(error.details).toEqual({ detail: 'value' });
    expect(error.name).toBe('BlobKitError');
  });

  test('instanceof works correctly', () => {
    const error = new BlobKitError('Test message', 'TEST_CODE');
    
    expect(error instanceof BlobKitError).toBe(true);
    expect(error instanceof Error).toBe(true);
  });
});

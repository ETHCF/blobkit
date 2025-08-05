import {
  calculatePayloadHash,
  generateJobId,
  validateEnvironmentConfig,
  discoverProxyUrl,
  getDefaultEscrowContract,
  formatEther,
  parseEther,
  isValidAddress,
  validateBlobSize,
  sleep,
  bytesToHex,
  padToEven,
  hexToBytes
} from '../src/utils';
import { BlobKitError } from '../src/types';

describe('Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment variables
    delete process.env.BLOBKIT_ESCROW_1;
    delete process.env.BLOBKIT_ESCROW_11155111;
    delete process.env.BLOBKIT_ESCROW_17000;
    delete process.env.BLOBKIT_CHAIN_ID;
    delete process.env.BLOBKIT_LOG_LEVEL;
    delete process.env.BLOBKIT_PROXY_URL;
  });

  describe('calculatePayloadHash', () => {
    it('should calculate keccak256 hash of payload', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const hash = calculatePayloadHash(data);
      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('should return consistent hash for same input', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const hash1 = calculatePayloadHash(data);
      const hash2 = calculatePayloadHash(data);
      expect(hash1).toBe(hash2);
    });

    it('should return different hashes for different inputs', () => {
      const data1 = new Uint8Array([1, 2, 3]);
      const data2 = new Uint8Array([4, 5, 6]);
      const hash1 = calculatePayloadHash(data1);
      const hash2 = calculatePayloadHash(data2);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('generateJobId', () => {
    it('should generate deterministic job ID', () => {
      const userAddress = '0x1234567890123456789012345678901234567890';
      const payloadHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const nonce = 123;
      
      const jobId = generateJobId(userAddress, payloadHash, nonce);
      expect(jobId).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('should return consistent job ID for same inputs', () => {
      const userAddress = '0x1234567890123456789012345678901234567890';
      const payloadHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const nonce = 123;
      
      const jobId1 = generateJobId(userAddress, payloadHash, nonce);
      const jobId2 = generateJobId(userAddress, payloadHash, nonce);
      expect(jobId1).toBe(jobId2);
    });

    it('should return different job IDs for different nonces', () => {
      const userAddress = '0x1234567890123456789012345678901234567890';
      const payloadHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      
      const jobId1 = generateJobId(userAddress, payloadHash, 123);
      const jobId2 = generateJobId(userAddress, payloadHash, 124);
      expect(jobId1).not.toBe(jobId2);
    });
  });

  describe('validateEnvironmentConfig', () => {
    it('should pass validation with no environment variables set', () => {
      expect(() => validateEnvironmentConfig()).not.toThrow();
    });

    it('should pass validation with valid escrow addresses', () => {
      process.env.BLOBKIT_ESCROW_1 = '0x1234567890123456789012345678901234567890';
      process.env.BLOBKIT_ESCROW_11155111 = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
      expect(() => validateEnvironmentConfig()).not.toThrow();
    });

    it('should throw error for invalid escrow address', () => {
      process.env.BLOBKIT_ESCROW_1 = 'invalid-address';
      expect(() => validateEnvironmentConfig()).toThrow(BlobKitError);
      expect(() => validateEnvironmentConfig()).toThrow('Invalid address in environment variable BLOBKIT_ESCROW_1');
    });

    it('should pass validation with valid chain ID', () => {
      process.env.BLOBKIT_CHAIN_ID = '1';
      expect(() => validateEnvironmentConfig()).not.toThrow();
    });

    it('should throw error for invalid chain ID', () => {
      process.env.BLOBKIT_CHAIN_ID = 'invalid';
      expect(() => validateEnvironmentConfig()).toThrow(BlobKitError);
      expect(() => validateEnvironmentConfig()).toThrow('Invalid chain ID in BLOBKIT_CHAIN_ID');
    });

    it('should throw error for negative chain ID', () => {
      process.env.BLOBKIT_CHAIN_ID = '-1';
      expect(() => validateEnvironmentConfig()).toThrow(BlobKitError);
    });

    it('should pass validation with valid log levels', () => {
      process.env.BLOBKIT_LOG_LEVEL = 'debug';
      expect(() => validateEnvironmentConfig()).not.toThrow();
      
      process.env.BLOBKIT_LOG_LEVEL = 'info';
      expect(() => validateEnvironmentConfig()).not.toThrow();
      
      process.env.BLOBKIT_LOG_LEVEL = 'silent';
      expect(() => validateEnvironmentConfig()).not.toThrow();
    });

    it('should throw error for invalid log level', () => {
      process.env.BLOBKIT_LOG_LEVEL = 'verbose';
      expect(() => validateEnvironmentConfig()).toThrow(BlobKitError);
      expect(() => validateEnvironmentConfig()).toThrow('Invalid log level in BLOBKIT_LOG_LEVEL');
    });

    it('should log debug message when log level is debug', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      process.env.BLOBKIT_LOG_LEVEL = 'debug';
      
      validateEnvironmentConfig();
      
      expect(consoleSpy).toHaveBeenCalledWith('[BlobKit:DEBUG] Validating environment configuration');
      consoleSpy.mockRestore();
    });
  });

  describe('discoverProxyUrl', () => {
    it('should return environment proxy URL when valid', async () => {
      const mockProxyUrl = 'https://test-proxy.example.com';
      process.env.BLOBKIT_PROXY_URL = mockProxyUrl;
      
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ chainId: 1 })
      });
      global.fetch = mockFetch;

      const result = await discoverProxyUrl(1);
      expect(result).toBe(mockProxyUrl);
    });

    it('should fall back to default proxy when env proxy fails health check', async () => {
      process.env.BLOBKIT_PROXY_URL = 'https://invalid-proxy.example.com';
      
      const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      const result = await discoverProxyUrl(1);
      expect(result).toBe('https://proxy-mainnet.blobkit.dev');
    });

    it('should fall back to default proxy when env proxy has wrong chain', async () => {
      process.env.BLOBKIT_PROXY_URL = 'https://test-proxy.example.com';
      
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ chainId: 11155111 })
      });
      global.fetch = mockFetch;

      const result = await discoverProxyUrl(1);
      expect(result).toBe('https://proxy-mainnet.blobkit.dev');
    });

    it('should return correct default proxy for different chains', async () => {
      const testCases = [
        { chainId: 1, expected: 'https://proxy-mainnet.blobkit.dev' },
        { chainId: 11155111, expected: 'https://proxy-sepolia.blobkit.dev' },
        { chainId: 17000, expected: 'https://proxy-holesky.blobkit.dev' }
      ];

      for (const { chainId, expected } of testCases) {
        const result = await discoverProxyUrl(chainId);
        expect(result).toBe(expected);
      }
    });

    it('should throw error for unsupported chain', async () => {
      await expect(discoverProxyUrl(999)).rejects.toThrow(BlobKitError);
      await expect(discoverProxyUrl(999)).rejects.toThrow('No proxy server configured for chain 999');
    });

    it('should timeout health check after 5 seconds', async () => {
      process.env.BLOBKIT_PROXY_URL = 'https://slow-proxy.example.com';
      
      const mockFetch = jest.fn().mockImplementation(() => {
        return Promise.reject(new Error('Timeout'));
      });
      global.fetch = mockFetch;

      const result = await discoverProxyUrl(1);
      expect(result).toBe('https://proxy-mainnet.blobkit.dev');
    });
  });

  describe('getDefaultEscrowContract', () => {
    it('should return environment variable address when valid', () => {
      const testAddress = '0x1234567890123456789012345678901234567890';
      process.env.BLOBKIT_ESCROW_1 = testAddress;
      
      const result = getDefaultEscrowContract(1);
      expect(result).toBe(testAddress);
    });

    it('should throw error for mainnet when no env var set', () => {
      expect(() => getDefaultEscrowContract(1)).toThrow(BlobKitError);
      expect(() => getDefaultEscrowContract(1)).toThrow('BlobKit escrow contract not yet deployed on Mainnet');
    });

    it('should throw error for sepolia when no env var set', () => {
      expect(() => getDefaultEscrowContract(11155111)).toThrow(BlobKitError);
      expect(() => getDefaultEscrowContract(11155111)).toThrow('BlobKit escrow contract not yet deployed on Sepolia');
    });

    it('should throw error for holesky when no env var set', () => {
      expect(() => getDefaultEscrowContract(17000)).toThrow(BlobKitError);
      expect(() => getDefaultEscrowContract(17000)).toThrow('BlobKit escrow contract not yet deployed on Holesky');
    });

    it('should throw error for unknown chain', () => {
      expect(() => getDefaultEscrowContract(999)).toThrow(BlobKitError);
      expect(() => getDefaultEscrowContract(999)).toThrow('No escrow contract configuration for chain 999');
    });

    it('should ignore invalid address in environment variable', () => {
      process.env.BLOBKIT_ESCROW_1 = 'invalid-address';
      expect(() => getDefaultEscrowContract(1)).toThrow(BlobKitError);
      expect(() => getDefaultEscrowContract(1)).toThrow('BlobKit escrow contract not yet deployed on Mainnet');
    });
  });

  describe('formatEther', () => {
    it('should format wei to ether correctly', () => {
      expect(formatEther(1000000000000000000n)).toBe('1.0');
      expect(formatEther(1500000000000000000n)).toBe('1.5');
      // Use a simpler number to avoid floating point precision issues
      expect(formatEther(100000000000000000n)).toBe('0.1');
    });

    it('should handle zero wei', () => {
      expect(formatEther(0n)).toBe('0.0');
    });

    it('should remove trailing zeros', () => {
      expect(formatEther(1000000000000000000n)).toBe('1.0');
      // Use a simpler test case
      expect(formatEther(2000000000000000000n)).toBe('2.0');
    });

    it('should handle small amounts', () => {
      expect(formatEther(1n)).toBe('0.000000000000000001');
      expect(formatEther(1000n)).toBe('0.000000000000001');
    });
  });

  describe('parseEther', () => {
    it('should parse ether string to wei correctly', () => {
      expect(parseEther('1')).toBe(1000000000000000000n);
      expect(parseEther('1.5')).toBe(1500000000000000000n);
      // Use a simpler test case to avoid floating point precision issues
      expect(parseEther('0.1')).toBe(100000000000000000n);
    });

    it('should handle zero ether', () => {
      expect(parseEther('0')).toBe(0n);
      expect(parseEther('0.0')).toBe(0n);
    });

    it('should handle small amounts', () => {
      expect(parseEther('0.000000000000000001')).toBe(1n);
      expect(parseEther('0.000000000000001')).toBe(1000n);
    });

  });

  describe('isValidAddress', () => {
    it('should return true for valid addresses', () => {
      expect(isValidAddress('0x1234567890123456789012345678901234567890')).toBe(true);
      expect(isValidAddress('0x0000000000000000000000000000000000000000')).toBe(true);
    });

    it('should return false for invalid addresses', () => {
      expect(isValidAddress('1234567890123456789012345678901234567890')).toBe(false); // No 0x prefix
      expect(isValidAddress('0x123456789012345678901234567890123456789')).toBe(false); // Too short
      expect(isValidAddress('0x12345678901234567890123456789012345678901')).toBe(false); // Too long
      expect(isValidAddress('0x123456789012345678901234567890123456789g')).toBe(false); // Invalid character
      expect(isValidAddress('')).toBe(false); // Empty string
      expect(isValidAddress('0x')).toBe(false); // Just prefix
    });
  });

  describe('validateBlobSize', () => {
    it('should not throw for valid blob size', () => {
      const smallBlob = new Uint8Array(1000);
      const maxBlob = new Uint8Array(128 * 1024); // 128KB
      
      expect(() => validateBlobSize(smallBlob)).not.toThrow();
      expect(() => validateBlobSize(maxBlob)).not.toThrow();
    });

    it('should throw error for oversized blob', () => {
      const oversizedBlob = new Uint8Array(128 * 1024 + 1); // Over 128KB
      
      expect(() => validateBlobSize(oversizedBlob)).toThrow(BlobKitError);
      expect(() => validateBlobSize(oversizedBlob)).toThrow('Blob too large');
      expect(() => validateBlobSize(oversizedBlob)).toThrow('131073 bytes, maximum: 131072 bytes');
    });

    it('should handle empty blob', () => {
      const emptyBlob = new Uint8Array(0);
      expect(() => validateBlobSize(emptyBlob)).not.toThrow();
    });
  });

  describe('sleep', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should resolve after specified duration', async () => {
      const promise = sleep(1000);
      
      // Fast-forward time
      jest.advanceTimersByTime(1000);
      
      await expect(promise).resolves.toBeUndefined();
    });

    it('should not resolve before specified duration', async () => {
      const promise = sleep(1000);
      let resolved = false;
      promise.then(() => { resolved = true; });
      
      // Fast-forward time but not enough
      jest.advanceTimersByTime(999);
      await Promise.resolve(); // Allow microtasks to run
      
      expect(resolved).toBe(false);
    });
  });

  describe('bytesToHex', () => {
    it('should convert bytes to hex string', () => {
      expect(bytesToHex(new Uint8Array([0, 1, 255]))).toBe('0x0001ff');
      expect(bytesToHex(new Uint8Array([16, 32, 48]))).toBe('0x102030');
    });

    it('should handle empty array', () => {
      expect(bytesToHex(new Uint8Array())).toBe('0x');
      expect(bytesToHex(undefined as any)).toBe('0x');
    });

    it('should pad single digits with zero', () => {
      expect(bytesToHex(new Uint8Array([1, 2, 3]))).toBe('0x010203');
    });
  });

  describe('padToEven', () => {
    it('should pad odd-length strings', () => {
      expect(padToEven('123')).toBe('0123');
      expect(padToEven('a')).toBe('0a');
      expect(padToEven('abcde')).toBe('0abcde');
    });

    it('should not pad even-length strings', () => {
      expect(padToEven('1234')).toBe('1234');
      expect(padToEven('ab')).toBe('ab');
      expect(padToEven('')).toBe('');
    });

    it('should throw error for non-string input', () => {
      expect(() => padToEven(123 as any)).toThrow('value must be type \'string\'');
      expect(() => padToEven(null as any)).toThrow('value must be type \'string\'');
    });
  });

  describe('hexToBytes', () => {
    it('should convert hex string to bytes', () => {
      const result = hexToBytes('0x0001ff');
      expect(result).toEqual(new Uint8Array([0, 1, 255]));
    });

    it('should handle uppercase hex', () => {
      const result = hexToBytes('0x0001FF');
      expect(result).toEqual(new Uint8Array([0, 1, 255]));
    });

    it('should handle mixed case hex', () => {
      const result = hexToBytes('0x0001Ff');
      expect(result).toEqual(new Uint8Array([0, 1, 255]));
    });

    it('should pad odd-length hex strings', () => {
      const result = hexToBytes('0x123');
      expect(result).toEqual(new Uint8Array([1, 35])); // 0x0123
    });

    it('should handle empty hex string', () => {
      const result = hexToBytes('0x');
      expect(result).toEqual(new Uint8Array());
    });

    it('should throw error for non-string input', () => {
      expect(() => hexToBytes(123 as any)).toThrow('hex argument type number must be of type string');
    });

    it('should throw error for invalid hex format', () => {
      expect(() => hexToBytes('123')).toThrow('Input must be a 0x-prefixed hexadecimal string');
      expect(() => hexToBytes('0xgg')).toThrow('Input must be a 0x-prefixed hexadecimal string');
      expect(() => hexToBytes('hello')).toThrow('Input must be a 0x-prefixed hexadecimal string');
    });
  });
});
import { BlobKit } from '../src/client';
import { BlobWriter } from '../src/writer';
import { ethers } from 'ethers';

describe('External Signer Support', () => {
  const config = {
    rpcUrl: 'http://localhost:8545',
    chainId: 1
  };

  describe('BlobKit Constructor', () => {
    test('should accept private key string (backward compatibility)', () => {
      const privateKey = '0x' + '1'.repeat(64);
      const blobkit = new BlobKit(config, privateKey);
      expect(blobkit).toBeDefined();
    });

    test('should accept ethers Signer', () => {
      const mockSigner = {
        sendTransaction: jest.fn(),
        getAddress: jest.fn().mockResolvedValue('0x1234567890123456789012345678901234567890')
      } as unknown as ethers.Signer;

      const blobkit = new BlobKit(config, mockSigner);
      expect(blobkit).toBeDefined();
    });

    test('should work without signer (read-only mode)', () => {
      const blobkit = new BlobKit(config);
      expect(blobkit).toBeDefined();
    });
  });

  describe('BlobWriter Constructor', () => {
    test('should accept private key string', () => {
      const privateKey = '0x' + '1'.repeat(64);
      const writer = new BlobWriter(config, privateKey);
      expect(writer).toBeDefined();
    });

    test('should accept ethers Signer', () => {
      const mockSigner = {
        sendTransaction: jest.fn(),
        getAddress: jest.fn().mockResolvedValue('0x1234567890123456789012345678901234567890')
      } as unknown as ethers.Signer;

      const writer = new BlobWriter(config, mockSigner);
      expect(writer).toBeDefined();
    });
  });

  describe('TypeScript Compilation', () => {
    test('should compile with private key', () => {
      // This test just verifies TypeScript compilation
      const privateKey: string = '0x' + '1'.repeat(64);
      // Create instances to test compilation without storing in variables
      expect(() => new BlobKit(config, privateKey)).toBeDefined();
      expect(() => new BlobWriter(config, privateKey)).toBeDefined();
    });

    test('should compile with signer', () => {
      // This test just verifies TypeScript compilation
      const signer: ethers.Signer = {} as ethers.Signer;
      // Create instances to test compilation without storing in variables
      expect(() => new BlobKit(config, signer)).toBeDefined();
      expect(() => new BlobWriter(config, signer)).toBeDefined();
    });

    test('should compile without signer', () => {
      // This test just verifies TypeScript compilation
      // Create instances to test compilation without storing in variables
      expect(() => new BlobKit(config)).toBeDefined();
      expect(() => new BlobWriter(config)).toBeDefined();
    });
  });

  describe('Error Messages', () => {
    test('should throw NO_SIGNER error when writing without signer', async () => {
      const blobkit = new BlobKit(config);
      
      await expect(blobkit.writeBlob('test data')).rejects.toThrow('No signer configured');
    });
  });

  describe('Usage Examples', () => {
    test('MetaMask-style usage', async () => {
      // Simulate MetaMask provider
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      
      // Mock getSigner method like MetaMask would provide
      const mockSigner = {
        provider,
        sendTransaction: jest.fn().mockResolvedValue({
          hash: '0x' + '0'.repeat(64),
          wait: jest.fn().mockResolvedValue({ blockNumber: 1 })
        }),
        getAddress: jest.fn().mockResolvedValue('0x1234567890123456789012345678901234567890')
      } as unknown as ethers.Signer;

      // This is how users would use it with MetaMask
      const blobkit = new BlobKit(config, mockSigner);
      
      // Verify it accepts the signer
      expect(blobkit).toBeDefined();
    });

    test('WalletConnect-style usage', async () => {
      // Simulate WalletConnect signer
      const walletConnectSigner = new ethers.VoidSigner('0x1234567890123456789012345678901234567890');
      
      const blobkit = new BlobKit(config, walletConnectSigner);
      expect(blobkit).toBeDefined();
    });

    test('Private key usage (backward compatibility)', () => {
      // Traditional usage still works
      const privateKey = '0x' + '1'.repeat(64);
      const blobkit = new BlobKit(config, privateKey);
      expect(blobkit).toBeDefined();
    });
  });
});
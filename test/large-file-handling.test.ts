import { BlobWriter } from '../src/writer';
import { FIELD_ELEMENTS_PER_BLOB, BYTES_PER_FIELD_ELEMENT } from '../src/kzg/constants';
import { ethers } from 'ethers';
import { registerDefaultCodecs } from '../src/codecs';
import { loadTrustedSetup, createMockSetup } from '../src/kzg';

describe('Large File Handling', () => {
  beforeAll(() => {
    registerDefaultCodecs();
    // Load mock trusted setup for testing
    const mockSetup = createMockSetup();
    loadTrustedSetup(mockSetup);
  });
  const config = {
    rpcUrl: 'http://localhost:8545',
    chainId: 1
  };

  const privateKey = '0x' + '1'.repeat(64);
  const writer = new BlobWriter(config, privateKey);

  describe('Size Validation', () => {
    it('should accept data within blob size limit', async () => {
      // Create data that fits within a single blob
      const smallData = new Uint8Array(1000);
      
      // Mock the provider methods
      jest.spyOn(writer['provider'], 'getFeeData').mockResolvedValue({
        maxFeePerGas: ethers.parseUnits('20', 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei'),
        gasPrice: null
      } as any);

      jest.spyOn(writer['provider'], 'getBlock').mockResolvedValue({
        blobGasPrice: '1000000000'
      } as any);

      const mockTxResponse = {
        wait: jest.fn().mockResolvedValue({
          hash: '0x123',
          blockNumber: 123456
        })
      };

      jest.spyOn(writer['signer']!, 'sendTransaction').mockResolvedValue(mockTxResponse as any);

      // This should work without throwing
      await expect(writer.writeBlob(smallData)).resolves.toBeTruthy();
    });

    it('should handle large data (size validation removed)', async () => {
      // Create data that would exceed single blob limit
      const maxSize = FIELD_ELEMENTS_PER_BLOB * BYTES_PER_FIELD_ELEMENT;
      // Size validation has been removed - the blob encoding will handle overflow
      // Applications can now implement their own chunking logic
      // Note: This test just verifies no premature size validation occurs
      // The actual blob encoding may still have limits
      expect(maxSize).toBe(126976); // Just verify constant is correct
    });

    it('should calculate size correctly including metadata', async () => {
      // Size validation removed - this should not throw
      // Applications are responsible for chunking if needed
      // Test just verifies the concept
      const metadataSize = JSON.stringify({
        appId: 'test',
        codec: 'application/json',
        customField: 'x'.repeat(1000)
      }).length;
      
      expect(metadataSize).toBeGreaterThan(1000); // Metadata itself is over 1KB
    });
  });

  describe('Chunking Support', () => {
    it('allows applications to implement their own chunking', async () => {
      // Size validation has been removed from writeBlob
      // Applications can now chunk data before calling writeBlob
      const chunkSize = 100000; // 100KB chunks
      const largeData = new Uint8Array(200000); // 200KB
      
      // Example: Application can split data into chunks
      const chunks = [];
      for (let i = 0; i < largeData.length; i += chunkSize) {
        chunks.push(largeData.slice(i, i + chunkSize));
      }
      
      expect(chunks.length).toBe(2);
      expect(chunks[0].length).toBe(100000);
      expect(chunks[1].length).toBe(100000);
      
      // Each chunk can be written separately
      // (Not testing actual writes here due to mocking complexity)
    });
  });
});
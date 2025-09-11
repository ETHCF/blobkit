/**
 * BlobReader Native Beacon API Integration Tests
 * 
 * Tests the native blob reading implementation against the Ethereum Beacon API spec.
 * Reference: https://ethereum.github.io/beacon-APIs/#/Beacon/getBlobSidecars
 * 
 * These tests follow TDD principles - they define the expected behavior
 * before implementation exists.
 */

import { BlobReader } from '../../src/blob-reader';
import { 
  createTestTxHash, 
  createTestBlockHash,
  createTestCommitment,
  toVersionedHash,
  createTestBlob,
  blobToHex,
  hexToBytes,
  BLOB_SIZE,
  FIELD_ELEMENTS_PER_BLOB,
  BYTES_PER_FIELD_ELEMENT
} from '../utils/blob-test-utils';

// Mock the actual dependencies that BlobReader will use
jest.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: jest.fn().mockImplementation(() => ({
      getTransaction: jest.fn(),
      getBlock: jest.fn(),
      getTransactionReceipt: jest.fn()
    }))
  }
}));

// Mock KZG functions
jest.mock('../../src/kzg', () => ({
  verifyBlobKzgProof: jest.fn().mockResolvedValue(true),
  verifyBlobKzgProofBatch: jest.fn().mockResolvedValue(true),
  blobToKzgCommitment: jest.fn(),
  decodeBlob: jest.fn(blob => blob)
}));

import { verifyBlobKzgProof, verifyBlobKzgProofBatch } from '../../src/kzg';

describe('BlobReader - Native Beacon API Implementation', () => {
  let reader: BlobReader;
  let mockProvider: any;
  let mockFetch: jest.Mock;

  const BEACON_URL = 'http://localhost:5052';
  const GENESIS_TIME = 1606824023;
  const SECONDS_PER_SLOT = 12;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock global fetch for beacon requests
    mockFetch = jest.fn();
    global.fetch = mockFetch;

    // Create mock provider
    mockProvider = {
      getTransaction: jest.fn(),
      getBlock: jest.fn(),
      getTransactionReceipt: jest.fn()
    };

    // Create reader with native configuration
    reader = new BlobReader({
      rpcUrl: 'http://localhost:8545',
      beaconUrls: [BEACON_URL],
      finalityMode: 'allow-optimistic',
      useNativeReader: true // Flag to enable native reading
    });

    // Override provider for testing
    (reader as any).provider = mockProvider;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('readBlobsByTx - Native Implementation', () => {
    it('should fetch blobs from beacon chain for type-3 transaction', async () => {
      const txHash = createTestTxHash(1);
      const blockNumber = 1000000;
      const blockHash = createTestBlockHash(blockNumber);
      const slot = 8000000;
      const timestamp = GENESIS_TIME + (slot * SECONDS_PER_SLOT);

      // Setup commitments and versioned hashes
      const commitment1 = createTestCommitment(0);
      const commitment2 = createTestCommitment(1);
      const versionedHash1 = toVersionedHash(commitment1);
      const versionedHash2 = toVersionedHash(commitment2);

      // Mock provider responses
      mockProvider.getTransaction.mockResolvedValue({
        hash: txHash,
        type: 3,
        blockNumber,
        blockHash,
        blobVersionedHashes: [versionedHash1, versionedHash2]
      });

      mockProvider.getBlock.mockResolvedValue({
        number: blockNumber,
        hash: blockHash,
        timestamp
      });

      // Mock beacon API response
      const beaconResponse = {
        data: [
          {
            index: '0',
            blob: blobToHex(createTestBlob(0)),
            kzg_commitment: commitment1,
            kzg_proof: '0x' + 'a'.repeat(96),
            signed_block_header: {
              message: {
                slot: slot.toString(),
                proposer_index: '12345',
                parent_root: '0x' + '1'.repeat(64),
                state_root: '0x' + '2'.repeat(64),
                body_root: '0x' + '3'.repeat(64)
              },
              signature: '0x' + '4'.repeat(192)
            },
            kzg_commitment_inclusion_proof: Array(17).fill('0x' + '0'.repeat(64))
          },
          {
            index: '1',
            blob: blobToHex(createTestBlob(1)),
            kzg_commitment: commitment2,
            kzg_proof: '0x' + 'b'.repeat(96),
            signed_block_header: {
              message: {
                slot: slot.toString(),
                proposer_index: '12345',
                parent_root: '0x' + '1'.repeat(64),
                state_root: '0x' + '2'.repeat(64),
                body_root: '0x' + '3'.repeat(64)
              },
              signature: '0x' + '4'.repeat(192)
            },
            kzg_commitment_inclusion_proof: Array(17).fill('0x' + '0'.repeat(64))
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => beaconResponse
      });

      // Execute
      const result = await reader.readBlobsByTx(txHash);

      // Verify
      expect(result).toHaveLength(2);
      expect(result[0].versionedHash).toBe(versionedHash1);
      expect(result[0].commitment).toBe(commitment1);
      expect(result[0].slot).toBe(slot);
      expect(result[1].versionedHash).toBe(versionedHash2);
      expect(result[1].commitment).toBe(commitment2);

      // Verify beacon API was called correctly
      expect(mockFetch).toHaveBeenCalledWith(
        `${BEACON_URL}/eth/v1/beacon/blob_sidecars/${slot}`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Accept': 'application/json'
          })
        })
      );

      // Verify KZG batch verification was used
      expect(verifyBlobKzgProofBatch).toHaveBeenCalledWith(
        expect.arrayContaining([expect.any(Uint8Array), expect.any(Uint8Array)]),
        [commitment1, commitment2],
        expect.any(Array)
      );
    });

    it('should calculate slot correctly from block timestamp', async () => {
      const testCases = [
        { timestamp: GENESIS_TIME, expectedSlot: 0 },
        { timestamp: GENESIS_TIME + 12, expectedSlot: 1 },
        { timestamp: GENESIS_TIME + 120, expectedSlot: 10 },
        { timestamp: GENESIS_TIME + 1200, expectedSlot: 100 }
      ];

      for (const { timestamp, expectedSlot } of testCases) {
        const txHash = createTestTxHash(Math.random());
        const commitment = createTestCommitment(0);
        const versionedHash = toVersionedHash(commitment);

        mockProvider.getTransaction.mockResolvedValue({
          hash: txHash,
          type: 3,
          blockNumber: 1000000,
          blockHash: '0xblock',
          blobVersionedHashes: [versionedHash]
        });

        mockProvider.getBlock.mockResolvedValue({
          number: 1000000,
          hash: '0xblock',
          timestamp
        });

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{
              index: '0',
              blob: blobToHex(createTestBlob(0)),
              kzg_commitment: commitment,
              kzg_proof: '0x' + 'a'.repeat(96),
              signed_block_header: {
                message: { slot: expectedSlot.toString() },
                signature: '0x' + '0'.repeat(192)
              },
              kzg_commitment_inclusion_proof: []
            }]
          })
        });

        await reader.readBlobsByTx(txHash);

        // Verify correct slot was requested
        expect(mockFetch).toHaveBeenCalledWith(
          `${BEACON_URL}/eth/v1/beacon/blob_sidecars/${expectedSlot}`,
          expect.any(Object)
        );

        mockFetch.mockClear();
      }
    });

    it('should only return blobs matching transaction versioned hashes', async () => {
      const txHash = createTestTxHash(2);
      const commitment1 = createTestCommitment(1);
      const commitment2 = createTestCommitment(2);
      const commitment3 = createTestCommitment(3);
      const versionedHash1 = toVersionedHash(commitment1);
      const versionedHash3 = toVersionedHash(commitment3);

      mockProvider.getTransaction.mockResolvedValue({
        hash: txHash,
        type: 3,
        blockNumber: 1000000,
        blockHash: '0xblock',
        blobVersionedHashes: [versionedHash1, versionedHash3] // Only want blobs 1 and 3
      });

      mockProvider.getBlock.mockResolvedValue({
        number: 1000000,
        hash: '0xblock',
        timestamp: GENESIS_TIME + (8000000 * SECONDS_PER_SLOT)
      });

      // Beacon returns all 3 blobs for the slot
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              index: '0',
              blob: blobToHex(createTestBlob(1)),
              kzg_commitment: commitment1,
              kzg_proof: '0x' + 'a'.repeat(96)
            },
            {
              index: '1',
              blob: blobToHex(createTestBlob(2)),
              kzg_commitment: commitment2,
              kzg_proof: '0x' + 'b'.repeat(96)
            },
            {
              index: '2',
              blob: blobToHex(createTestBlob(3)),
              kzg_commitment: commitment3,
              kzg_proof: '0x' + 'c'.repeat(96)
            }
          ]
        })
      });

      const result = await reader.readBlobsByTx(txHash);

      // Should only return blobs 1 and 3
      expect(result).toHaveLength(2);
      expect(result[0].versionedHash).toBe(versionedHash1);
      expect(result[1].versionedHash).toBe(versionedHash3);
    });

    it('should throw error when blob not found in slot', async () => {
      const txHash = createTestTxHash(3);
      const versionedHash = toVersionedHash(createTestCommitment(0));

      mockProvider.getTransaction.mockResolvedValue({
        hash: txHash,
        type: 3,
        blockNumber: 1000000,
        blockHash: '0xblock',
        blobVersionedHashes: [versionedHash]
      });

      mockProvider.getBlock.mockResolvedValue({
        number: 1000000,
        hash: '0xblock',
        timestamp: GENESIS_TIME + (8000000 * SECONDS_PER_SLOT)
      });

      // Beacon returns empty array
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] })
      });

      await expect(reader.readBlobsByTx(txHash))
        .rejects.toThrow('not found at slot');
    });

    it('should detect reorganization when block hash changes', async () => {
      const txHash = createTestTxHash(4);
      const originalHash = '0xoriginal';
      const reorgedHash = '0xreorged';

      mockProvider.getTransaction.mockResolvedValue({
        hash: txHash,
        type: 3,
        blockNumber: 1000000,
        blockHash: originalHash,
        blobVersionedHashes: [toVersionedHash(createTestCommitment(0))]
      });

      // First call returns original, second returns different hash
      mockProvider.getBlock
        .mockResolvedValueOnce({
          number: 1000000,
          hash: originalHash,
          timestamp: GENESIS_TIME
        })
        .mockResolvedValueOnce({
          number: 1000000,
          hash: reorgedHash,
          timestamp: GENESIS_TIME
        });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{
            index: '0',
            blob: blobToHex(createTestBlob(0)),
            kzg_commitment: createTestCommitment(0),
            kzg_proof: '0x' + 'a'.repeat(96)
          }]
        })
      });

      await expect(reader.readBlobsByTx(txHash))
        .rejects.toThrow('Reorg detected');
    });
  });

  describe('readBlobsByBlock - Native Implementation', () => {
    it('should fetch specific blob indices from block', async () => {
      const slot = 8000000;
      const indices = [0, 2, 4];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: indices.map(i => ({
            index: i.toString(),
            blob: blobToHex(createTestBlob(i)),
            kzg_commitment: createTestCommitment(i),
            kzg_proof: '0x' + 'a'.repeat(96)
          }))
        })
      });

      const result = await reader.readBlobsByBlock(slot, indices);

      expect(result).toHaveLength(3);
      expect(result.map(b => b.index)).toEqual([0, 2, 4]);

      // Verify correct API call with indices parameter
      expect(mockFetch).toHaveBeenCalledWith(
        `${BEACON_URL}/eth/v1/beacon/blob_sidecars/${slot}?indices=0,2,4`,
        expect.any(Object)
      );
    });

    it('should fetch all blobs when no indices specified', async () => {
      const slot = 8000000;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: Array.from({ length: 3 }, (_, i) => ({
            index: i.toString(),
            blob: blobToHex(createTestBlob(i)),
            kzg_commitment: createTestCommitment(i),
            kzg_proof: '0x' + 'a'.repeat(96)
          }))
        })
      });

      const result = await reader.readBlobsByBlock(slot);

      expect(result).toHaveLength(3);
      
      // Should not include indices parameter
      expect(mockFetch).toHaveBeenCalledWith(
        `${BEACON_URL}/eth/v1/beacon/blob_sidecars/${slot}`,
        expect.any(Object)
      );
    });

    it('should handle block identifiers (head, genesis, finalized)', async () => {
      const identifiers = ['head', 'genesis', 'finalized'];

      for (const identifier of identifiers) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [] })
        });

        await reader.readBlobsByBlock(identifier);

        expect(mockFetch).toHaveBeenCalledWith(
          `${BEACON_URL}/eth/v1/beacon/blob_sidecars/${identifier}`,
          expect.any(Object)
        );
      }
    });

    it('should use batch KZG verification for multiple blobs', async () => {
      const slot = 8000000;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: Array.from({ length: 3 }, (_, i) => ({
            index: i.toString(),
            blob: blobToHex(createTestBlob(i)),
            kzg_commitment: createTestCommitment(i),
            kzg_proof: '0x' + String.fromCharCode(97 + i).repeat(96)
          }))
        })
      });

      await reader.readBlobsByBlock(slot);

      expect(verifyBlobKzgProofBatch).toHaveBeenCalledTimes(1);
      expect(verifyBlobKzgProof).not.toHaveBeenCalled();
    });

    it('should fall back to individual verification when batch fails', async () => {
      const slot = 8000000;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: Array.from({ length: 3 }, (_, i) => ({
            index: i.toString(),
            blob: blobToHex(createTestBlob(i)),
            kzg_commitment: createTestCommitment(i),
            kzg_proof: '0x' + 'a'.repeat(96)
          }))
        })
      });

      // Batch verification fails
      (verifyBlobKzgProofBatch as jest.Mock).mockResolvedValueOnce(false);
      
      // Individual verification: second blob fails
      (verifyBlobKzgProof as jest.Mock)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      await expect(reader.readBlobsByBlock(slot))
        .rejects.toThrow('KZG verification failed');

      expect(verifyBlobKzgProofBatch).toHaveBeenCalledTimes(1);
      expect(verifyBlobKzgProof).toHaveBeenCalledTimes(2);
    });
  });

  describe('readBlobByHash - Native Implementation', () => {
    it('should fetch single blob by versioned hash', async () => {
      const slot = 8000000;
      const commitment = createTestCommitment(0);
      const versionedHash = toVersionedHash(commitment);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              index: '0',
              blob: blobToHex(createTestBlob(0)),
              kzg_commitment: commitment,
              kzg_proof: '0x' + 'a'.repeat(96)
            }
          ]
        })
      });

      const result = await reader.readBlobByHash(versionedHash, slot);

      expect(result.versionedHash).toBe(versionedHash);
      expect(result.commitment).toBe(commitment);
      expect(result.slot).toBe(slot);
    });

    it('should throw when blob not found at slot', async () => {
      const slot = 8000000;
      const versionedHash = toVersionedHash(createTestCommitment(0));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] })
      });

      await expect(reader.readBlobByHash(versionedHash, slot))
        .rejects.toThrow('not found at slot');
    });
  });

  describe('Finality Policy', () => {
    it('should allow optimistic blocks with allow-optimistic policy', async () => {
      reader = new BlobReader({
        rpcUrl: 'http://localhost:8545',
        beaconUrls: [BEACON_URL],
        finalityMode: 'allow-optimistic',
        useNativeReader: true
      });
      (reader as any).provider = mockProvider;

      // Mock beacon response with execution_optimistic in block header
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{
            index: '0',
            blob: blobToHex(createTestBlob(0)),
            kzg_commitment: createTestCommitment(0),
            kzg_proof: '0x' + 'a'.repeat(96),
            signed_block_header: {
              message: { 
                slot: '8000000',
                execution_optimistic: true 
              },
              signature: '0x' + '0'.repeat(192)
            }
          }]
        })
      });

      const result = await reader.readBlobsByBlock(8000000);
      expect(result).toHaveLength(1);
    });

    it('should reject optimistic blocks with disallow-optimistic policy', async () => {
      reader = new BlobReader({
        rpcUrl: 'http://localhost:8545',
        beaconUrls: [BEACON_URL],
        finalityMode: 'disallow-optimistic',
        useNativeReader: true
      });
      (reader as any).provider = mockProvider;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{
            index: '0',
            blob: blobToHex(createTestBlob(0)),
            kzg_commitment: createTestCommitment(0),
            kzg_proof: '0x' + 'a'.repeat(96),
            signed_block_header: {
              message: { 
                slot: '8000000',
                execution_optimistic: true 
              },
              signature: '0x' + '0'.repeat(192)
            }
          }]
        })
      });

      await expect(reader.readBlobsByBlock(8000000))
        .rejects.toThrow('Policy violation');
    });
  });

  describe('Blob Expiry', () => {
    it('should throw error for expired blobs beyond retention window', async () => {
      const currentSlot = 200000;
      const retentionWindow = 131072; // ~18 days
      const expiredSlot = currentSlot - retentionWindow - 1;

      reader = new BlobReader({
        rpcUrl: 'http://localhost:8545',
        beaconUrls: [BEACON_URL],
        currentSlot,
        retentionWindow,
        useNativeReader: true
      });
      (reader as any).provider = mockProvider;

      await expect(reader.readBlobsByBlock(expiredSlot))
        .rejects.toThrow('Blob expired');
    });

    it('should allow blob at exact retention boundary', async () => {
      const currentSlot = 200000;
      const retentionWindow = 131072;
      const boundarySlot = currentSlot - retentionWindow;

      reader = new BlobReader({
        rpcUrl: 'http://localhost:8545',
        beaconUrls: [BEACON_URL],
        currentSlot,
        retentionWindow,
        useNativeReader: true
      });
      (reader as any).provider = mockProvider;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] })
      });

      await expect(reader.readBlobsByBlock(boundarySlot))
        .resolves.toEqual([]);
    });
  });

  describe('Network Resilience', () => {
    it('should fallback to secondary beacon on primary failure', async () => {
      const beacon2 = 'http://localhost:5053';
      
      reader = new BlobReader({
        rpcUrl: 'http://localhost:8545',
        beaconUrls: [BEACON_URL, beacon2],
        useNativeReader: true
      });
      (reader as any).provider = mockProvider;

      // First beacon fails
      mockFetch
        .mockRejectedValueOnce(new Error('Connection refused'))
        // Second beacon succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [] })
        });

      await reader.readBlobsByBlock('head');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenCalledWith(
        `${beacon2}/eth/v1/beacon/blob_sidecars/head`,
        expect.any(Object)
      );
    });

    it('should retry on transient errors with exponential backoff', async () => {
      reader = new BlobReader({
        rpcUrl: 'http://localhost:8545',
        beaconUrls: [BEACON_URL],
        maxRetries: 3,
        useNativeReader: true
      });
      (reader as any).provider = mockProvider;

      mockFetch
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [] })
        });

      await reader.readBlobsByBlock('head');

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should handle HTTP error codes appropriately', async () => {
      const errorCases = [
        { status: 404, shouldRetry: false },
        { status: 429, shouldRetry: true },
        { status: 500, shouldRetry: true },
        { status: 503, shouldRetry: true }
      ];

      for (const { status, shouldRetry } of errorCases) {
        mockFetch.mockReset();
        
        reader = new BlobReader({
          rpcUrl: 'http://localhost:8545',
          beaconUrls: [BEACON_URL],
          maxRetries: 2,
          useNativeReader: true
        });
        (reader as any).provider = mockProvider;

        if (shouldRetry) {
          mockFetch
            .mockResolvedValueOnce({ ok: false, status })
            .mockResolvedValueOnce({
              ok: true,
              json: async () => ({ data: [] })
            });

          await reader.readBlobsByBlock('head');
          expect(mockFetch).toHaveBeenCalledTimes(2);
        } else {
          mockFetch.mockResolvedValueOnce({ ok: false, status });

          await expect(reader.readBlobsByBlock('head'))
            .rejects.toThrow();
          expect(mockFetch).toHaveBeenCalledTimes(1);
        }
      }
    });
  });

  describe('Data Integrity', () => {
    it('should reject blobs with incorrect size', async () => {
      const wrongSizeBlob = new Uint8Array(BLOB_SIZE - 100);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{
            index: '0',
            blob: blobToHex(wrongSizeBlob),
            kzg_commitment: createTestCommitment(0),
            kzg_proof: '0x' + 'a'.repeat(96)
          }]
        })
      });

      await expect(reader.readBlobsByBlock(8000000))
        .rejects.toThrow('Invalid blob size');
    });

    it('should validate field elements are within BLS modulus', async () => {
      const invalidBlob = new Uint8Array(BLOB_SIZE);
      // Set first field element to all 0xFF (exceeds BLS modulus)
      for (let i = 0; i < BYTES_PER_FIELD_ELEMENT; i++) {
        invalidBlob[i] = 0xFF;
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{
            index: '0',
            blob: blobToHex(invalidBlob),
            kzg_commitment: createTestCommitment(0),
            kzg_proof: '0x' + 'a'.repeat(96)
          }]
        })
      });

      await expect(reader.readBlobsByBlock(8000000))
        .rejects.toThrow('Field element exceeds BLS modulus');
    });

    it('should detect corrupted data through KZG verification', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{
            index: '0',
            blob: blobToHex(createTestBlob(0)),
            kzg_commitment: createTestCommitment(0),
            kzg_proof: '0x' + 'a'.repeat(96)
          }]
        })
      });

      (verifyBlobKzgProof as jest.Mock).mockResolvedValueOnce(false);

      await expect(reader.readBlobsByBlock(8000000))
        .rejects.toThrow('KZG verification failed');
    });
  });

  describe('Caching', () => {
    it('should cache finalized blobs', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{
            index: '0',
            blob: blobToHex(createTestBlob(0)),
            kzg_commitment: createTestCommitment(0),
            kzg_proof: '0x' + 'a'.repeat(96),
            signed_block_header: {
              message: { 
                slot: '7000000',
                finalized: true 
              },
              signature: '0x' + '0'.repeat(192)
            }
          }]
        })
      });

      // First call
      await reader.readBlobsByBlock(7000000);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await reader.readBlobsByBlock(7000000);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not cache non-finalized blobs', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{
            index: '0',
            blob: blobToHex(createTestBlob(0)),
            kzg_commitment: createTestCommitment(0),
            kzg_proof: '0x' + 'a'.repeat(96),
            signed_block_header: {
              message: { 
                slot: '8000000',
                finalized: false 
              },
              signature: '0x' + '0'.repeat(192)
            }
          }]
        })
      });

      // First call
      await reader.readBlobsByBlock(8000000);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call should fetch again
      await reader.readBlobsByBlock(8000000);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Concurrent Requests', () => {
    it('should deduplicate concurrent requests for same blob', async () => {
      let resolvePromise: () => void;
      const blockingPromise = new Promise(resolve => {
        resolvePromise = resolve;
      });

      mockFetch.mockImplementationOnce(async () => {
        await blockingPromise;
        return {
          ok: true,
          json: async () => ({ data: [] })
        };
      });

      // Start multiple concurrent requests
      const promises = Array(5).fill(0).map(() => 
        reader.readBlobsByBlock(8000000)
      );

      // Should only make one fetch
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Resolve and wait for all
      resolvePromise!();
      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Health Monitoring', () => {
    it('should report health status for all beacon endpoints', async () => {
      const beacon2 = 'http://localhost:5053';
      
      reader = new BlobReader({
        rpcUrl: 'http://localhost:8545',
        beaconUrls: [BEACON_URL, beacon2],
        useNativeReader: true
      });

      mockFetch
        .mockResolvedValueOnce({ ok: true, status: 200 }) // First beacon healthy
        .mockRejectedValueOnce(new Error('Connection refused')); // Second beacon unhealthy

      const health = await reader.health();

      expect(health).toHaveLength(2);
      expect(health[0].status).toBe('ok');
      expect(health[1].status).toBe('error');
      expect(health[1].error).toContain('Connection refused');
    });
  });
});
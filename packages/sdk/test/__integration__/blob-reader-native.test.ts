/**
 * Native Blob Reader Tests
 * 
 * Tests for native blob reading from Ethereum beacon nodes.
 * Based on Ethereum Beacon API: https://ethereum.github.io/beacon-APIs/
 */

import { ethers } from 'ethers';
import { 
  verifyBlobKzgProof, 
  verifyBlobKzgProofBatch,
  decodeBlob 
} from '../../src/kzg';
import { BlobKitConfig, BlobReadResult } from '../../src/types';
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
import { createHash } from 'crypto';

import * as BlobReaderModule from '../../src/blob-reader';

jest.mock('ethers');
jest.mock('../../src/kzg');

// Ethereum constants
const BLS_MODULUS = BigInt('52435875175126190479447740508185965837690552500527637822603658699938581184513');
const DENEB_FORK_SLOT = 8626176;
const DENEB_FORK_TIMESTAMP = 1710338135;
const BLOB_RETENTION_EPOCHS = 4096;
const SLOTS_PER_EPOCH = 32;
const BLOB_RETENTION_SLOTS = BLOB_RETENTION_EPOCHS * SLOTS_PER_EPOCH;

describe('BlobReader', () => {
  let mockProvider: jest.Mocked<ethers.JsonRpcProvider>;
  let originalFetch: typeof global.fetch;
  let mockFetch: jest.Mock;

  const BEACON_URL = 'http://localhost:5052';
  const GENESIS_TIME = 1606824023;
  const SECONDS_PER_SLOT = 12;

  beforeEach(() => {
    jest.clearAllMocks();
    
    originalFetch = global.fetch;
    mockFetch = jest.fn();
    global.fetch = mockFetch;

    mockProvider = {
      getTransaction: jest.fn(),
      getBlock: jest.fn(),
      getTransactionReceipt: jest.fn(),
      _getConnection: jest.fn().mockReturnValue({ url: 'http://localhost:8545' })
    } as any;

    (ethers.JsonRpcProvider as any).mockImplementation(() => mockProvider);
    (verifyBlobKzgProof as jest.Mock).mockResolvedValue(true);
    (verifyBlobKzgProofBatch as jest.Mock).mockResolvedValue(true);
    (decodeBlob as jest.Mock).mockImplementation(blob => blob);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Request Format', () => {
    it('sends correct headers', async () => {
      const config: BlobKitConfig = {
        ethereumRpcUrl: 'http://localhost:8545',
        beaconApiUrl: BEACON_URL,
        enableNativeReader: true
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] })
      });

      const reader = new BlobReaderModule.BlobReader(config);
      await reader.readBlobsByBlock('head');

      expect(mockFetch).toHaveBeenCalledWith(
        `${BEACON_URL}/eth/v1/beacon/blob_sidecars/head`,
        expect.objectContaining({
          headers: expect.objectContaining({
            'accept': 'application/json'
          })
        })
      );
    });

    it('formats indices as comma-separated list', async () => {
      const config: BlobKitConfig = {
        ethereumRpcUrl: 'http://localhost:8545',
        beaconApiUrl: BEACON_URL,
        enableNativeReader: true
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] })
      });

      const reader = new BlobReaderModule.BlobReader(config);
      await reader.readBlobsByBlock('head', [0, 1, 3]);

      expect(mockFetch).toHaveBeenCalledWith(
        `${BEACON_URL}/eth/v1/beacon/blob_sidecars/head?indices=0,1,3`,
        expect.any(Object)
      );
    });

    it('accepts all block ID formats', async () => {
      const config: BlobKitConfig = {
        ethereumRpcUrl: 'http://localhost:8545',
        beaconApiUrl: BEACON_URL,
        enableNativeReader: true
      };

      const blockIds = [
        'head',
        'genesis', 
        'finalized',
        '12345',
        '0x' + 'a'.repeat(64)
      ];

      for (const blockId of blockIds) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [] })
        });

        const reader = new BlobReaderModule.BlobReader(config);
        await reader.readBlobsByBlock(blockId);

        expect(mockFetch).toHaveBeenCalledWith(
          `${BEACON_URL}/eth/v1/beacon/blob_sidecars/${blockId}`,
          expect.any(Object)
        );
      }
    });
  });

  describe('Response Handling', () => {
    it('parses beacon API response correctly', async () => {
      const config: BlobKitConfig = {
        ethereumRpcUrl: 'http://localhost:8545',
        beaconApiUrl: BEACON_URL,
        enableNativeReader: true
      };

      const slot = DENEB_FORK_SLOT + 100000;

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          execution_optimistic: false,
          finalized: true,
          data: [{
            index: '0',
            blob: blobToHex(createTestBlob(0)),
            kzg_commitment: createTestCommitment(0),
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
          }]
        })
      });

      const reader = new BlobReaderModule.BlobReader(config);
      const result = await reader.readBlobsByBlock(slot);

      expect(result).toHaveLength(1);
      expect(result[0].slot).toBe(slot);
    });

    it('returns empty array for blocks without blobs', async () => {
      const config: BlobKitConfig = {
        ethereumRpcUrl: 'http://localhost:8545',
        beaconApiUrl: BEACON_URL,
        enableNativeReader: true
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          execution_optimistic: false,
          finalized: true,
          data: []
        })
      });

      const reader = new BlobReaderModule.BlobReader(config);
      const result = await reader.readBlobsByBlock('head');

      expect(result).toEqual([]);
    });

    it('handles 404 for non-existent blocks', async () => {
      const config: BlobKitConfig = {
        ethereumRpcUrl: 'http://localhost:8545',
        beaconApiUrl: BEACON_URL,
        enableNativeReader: true
      };

      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          code: 404,
          message: 'Block not found'
        })
      });

      const reader = new BlobReaderModule.BlobReader(config);
      
      await expect(reader.readBlobsByBlock('99999999'))
        .rejects.toThrow();
    });
  });

  describe('KZG Verification', () => {
    it('uses batch verification for multiple blobs', async () => {
      const config: BlobKitConfig = {
        ethereumRpcUrl: 'http://localhost:8545',
        beaconApiUrl: BEACON_URL,
        enableNativeReader: true
      };

      const slot = DENEB_FORK_SLOT + 100000;

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          execution_optimistic: false,
          finalized: false,
          data: Array.from({ length: 3 }, (_, i) => ({
            index: i.toString(),
            blob: blobToHex(createTestBlob(i)),
            kzg_commitment: createTestCommitment(i),
            kzg_proof: '0x' + String.fromCharCode(97 + i).repeat(96),
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
          }))
        })
      });

      const reader = new BlobReaderModule.BlobReader(config);
      await reader.readBlobsByBlock(slot);

      expect(verifyBlobKzgProofBatch).toHaveBeenCalledTimes(1);
      expect(verifyBlobKzgProofBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.any(Uint8Array),
          expect.any(Uint8Array),
          expect.any(Uint8Array)
        ]),
        expect.arrayContaining([
          createTestCommitment(0),
          createTestCommitment(1),
          createTestCommitment(2)
        ]),
        expect.any(Array)
      );
    });

    it('falls back to individual verification on batch failure', async () => {
      const config: BlobKitConfig = {
        ethereumRpcUrl: 'http://localhost:8545',
        beaconApiUrl: BEACON_URL,
        enableNativeReader: true
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          execution_optimistic: false,
          finalized: false,
          data: Array.from({ length: 3 }, (_, i) => ({
            index: i.toString(),
            blob: blobToHex(createTestBlob(i)),
            kzg_commitment: createTestCommitment(i),
            kzg_proof: '0x' + 'a'.repeat(96),
            signed_block_header: {
              message: {
                slot: (DENEB_FORK_SLOT + 100000).toString(),
                proposer_index: '12345',
                parent_root: '0x' + '1'.repeat(64),
                state_root: '0x' + '2'.repeat(64),
                body_root: '0x' + '3'.repeat(64)
              },
              signature: '0x' + '4'.repeat(192)
            },
            kzg_commitment_inclusion_proof: Array(17).fill('0x' + '0'.repeat(64))
          }))
        })
      });

      (verifyBlobKzgProofBatch as jest.Mock).mockResolvedValueOnce(false);
      (verifyBlobKzgProof as jest.Mock)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const reader = new BlobReaderModule.BlobReader(config);
      
      await expect(reader.readBlobsByBlock(DENEB_FORK_SLOT + 100000))
        .rejects.toThrow(BlobReaderModule.IntegrityError);

      expect(verifyBlobKzgProofBatch).toHaveBeenCalledTimes(1);
      expect(verifyBlobKzgProof).toHaveBeenCalledTimes(3);
    });
  });

  describe('Field Element Validation', () => {
    it('rejects field elements exceeding BLS modulus', async () => {
      const config: BlobKitConfig = {
        ethereumRpcUrl: 'http://localhost:8545',
        beaconApiUrl: BEACON_URL,
        enableNativeReader: true
      };

      const invalidBlob = new Uint8Array(BLOB_SIZE);
      for (let i = 0; i < BYTES_PER_FIELD_ELEMENT; i++) {
        invalidBlob[i] = 0xFF;
      }

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          execution_optimistic: false,
          finalized: false,
          data: [{
            index: '0',
            blob: blobToHex(invalidBlob),
            kzg_commitment: createTestCommitment(0),
            kzg_proof: '0x' + 'a'.repeat(96),
            signed_block_header: {
              message: {
                slot: (DENEB_FORK_SLOT + 100000).toString(),
                proposer_index: '12345',
                parent_root: '0x' + '1'.repeat(64),
                state_root: '0x' + '2'.repeat(64),
                body_root: '0x' + '3'.repeat(64)
              },
              signature: '0x' + '4'.repeat(192)
            },
            kzg_commitment_inclusion_proof: Array(17).fill('0x' + '0'.repeat(64))
          }]
        })
      });

      const reader = new BlobReaderModule.BlobReader(config);
      
      await expect(reader.readBlobsByBlock(DENEB_FORK_SLOT + 100000))
        .rejects.toThrow(BlobReaderModule.IntegrityError);
    });
  });

  describe('Legacy Methods', () => {
    it('readBlob works with versioned hash', async () => {
      const config: BlobKitConfig = {
        ethereumRpcUrl: 'http://localhost:8545',
        beaconApiUrl: BEACON_URL,
        archiveUrl: 'https://blobscan.com',
        enableNativeReader: true
      };

      const versionedHash = toVersionedHash(createTestCommitment(0));
      
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => blobToHex(createTestBlob(0))
      });

      const reader = new BlobReaderModule.BlobReader(config);
      const result: BlobReadResult = await reader.readBlob(versionedHash);

      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(result.source).toBe('archive');
    });

    it('readBlob works with transaction hash', async () => {
      const config: BlobKitConfig = {
        ethereumRpcUrl: 'http://localhost:8545',
        beaconApiUrl: BEACON_URL,
        archiveUrl: 'https://blobscan.com',
        enableNativeReader: true
      };

      const txHash = createTestTxHash(1);
      const versionedHash = toVersionedHash(createTestCommitment(0));

      mockProvider.getTransaction.mockResolvedValue({
        hash: txHash,
        type: 3,
        blockNumber: 10000000,
        blockHash: '0xblock',
        blobVersionedHashes: [versionedHash]
      } as any);

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => blobToHex(createTestBlob(0))
      });

      const reader = new BlobReaderModule.BlobReader(config);
      const result: BlobReadResult = await reader.readBlob(txHash, 0);

      expect(result.blobIndex).toBe(0);
      expect(result.source).toBe('archive');
    });
  });

  describe('Transaction Blob Reading', () => {
    it('fetches all blobs for type-3 transaction', async () => {
      const config: BlobKitConfig = {
        ethereumRpcUrl: 'http://localhost:8545',
        beaconApiUrl: BEACON_URL,
        enableNativeReader: true
      };

      const txHash = createTestTxHash(1) as BlobReaderModule.Hex;
      const blockNumber = 10000000;
      const slot = DENEB_FORK_SLOT + 100000;
      const timestamp = GENESIS_TIME + (slot * SECONDS_PER_SLOT);

      const commitment1 = createTestCommitment(0);
      const commitment2 = createTestCommitment(1);
      const versionedHash1 = toVersionedHash(commitment1);
      const versionedHash2 = toVersionedHash(commitment2);

      mockProvider.getTransaction.mockResolvedValue({
        hash: txHash,
        type: 3,
        blockNumber,
        blockHash: createTestBlockHash(blockNumber),
        blobVersionedHashes: [versionedHash1, versionedHash2]
      } as any);

      mockProvider.getBlock.mockResolvedValue({
        number: blockNumber,
        hash: createTestBlockHash(blockNumber),
        timestamp
      } as any);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          execution_optimistic: false,
          finalized: false,
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
        })
      });

      const reader = new BlobReaderModule.BlobReader(config);
      const result = await reader.readBlobsByTx(txHash);

      expect(result).toHaveLength(2);
      expect(result[0].versionedHash).toBe(versionedHash1);
      expect(result[1].versionedHash).toBe(versionedHash2);
      expect(verifyBlobKzgProof).toHaveBeenCalled();
    });

    it('detects reorganization', async () => {
      const config: BlobKitConfig = {
        ethereumRpcUrl: 'http://localhost:8545',
        beaconApiUrl: BEACON_URL,
        enableNativeReader: true
      };

      const txHash = createTestTxHash(2) as BlobReaderModule.Hex;

      mockProvider.getTransaction.mockResolvedValue({
        hash: txHash,
        type: 3,
        blockNumber: 10000000,
        blockHash: '0xoriginal',
        blobVersionedHashes: [toVersionedHash(createTestCommitment(0))]
      } as any);

      mockProvider.getBlock
        .mockResolvedValueOnce({
          number: 10000000,
          hash: '0xoriginal',
          timestamp: GENESIS_TIME + (DENEB_FORK_SLOT + 100000) * SECONDS_PER_SLOT
        } as any)
        .mockResolvedValueOnce({
          number: 10000000,
          hash: '0xreorged',
          timestamp: GENESIS_TIME + (DENEB_FORK_SLOT + 100000) * SECONDS_PER_SLOT
        } as any);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          execution_optimistic: true,
          finalized: false,
          data: [{
            index: '0',
            blob: blobToHex(createTestBlob(0)),
            kzg_commitment: createTestCommitment(0),
            kzg_proof: '0x' + 'a'.repeat(96),
            signed_block_header: {
              message: {
                slot: (DENEB_FORK_SLOT + 100000).toString(),
                proposer_index: '12345',
                parent_root: '0x' + '1'.repeat(64),
                state_root: '0x' + '2'.repeat(64),
                body_root: '0x' + '3'.repeat(64)
              },
              signature: '0x' + '4'.repeat(192)
            },
            kzg_commitment_inclusion_proof: Array(17).fill('0x' + '0'.repeat(64))
          }]
        })
      });

      const reader = new BlobReaderModule.BlobReader(config);
      
      await expect(reader.readBlobsByTx(txHash))
        .rejects.toThrow(BlobReaderModule.ReorgDetected);
    });
  });

  describe('Blob Retention', () => {
    it('detects expired blobs', async () => {
      const currentSlot = DENEB_FORK_SLOT + 200000;
      const expiredSlot = currentSlot - BLOB_RETENTION_SLOTS - 1;

      const config: BlobKitConfig = {
        ethereumRpcUrl: 'http://localhost:8545',
        beaconApiUrl: BEACON_URL,
        enableNativeReader: true,
        currentSlot,
        retentionWindow: BLOB_RETENTION_SLOTS
      };

      const reader = new BlobReaderModule.BlobReader(config);
      
      await expect(reader.readBlobsByBlock(expiredSlot))
        .rejects.toThrow(BlobReaderModule.ExpiredBlob);
    });

    it('uses archive for expired blobs', async () => {
      const currentSlot = DENEB_FORK_SLOT + 200000;
      const expiredSlot = DENEB_FORK_SLOT + 50000;
      const versionedHash = toVersionedHash(createTestCommitment(0));

      const config: BlobKitConfig = {
        ethereumRpcUrl: 'http://localhost:8545',
        beaconApiUrl: BEACON_URL,
        archiveUrl: 'https://blobscan.com',
        enableNativeReader: true,
        currentSlot,
        retentionWindow: BLOB_RETENTION_SLOTS
      };

      mockFetch.mockImplementation(async (url: string) => {
        if (url === `https://blobscan.com/blobs/${versionedHash}/data`) {
          return {
            ok: true,
            text: async () => blobToHex(createTestBlob(0))
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const reader = new BlobReaderModule.BlobReader(config);
      const result = await reader.readBlobByHash(versionedHash, expiredSlot);

      expect(result.versionedHash).toBe(versionedHash);
      expect(result.source).toBe('archive');
    });
  });

  describe('Finality Policies', () => {
    it('enforces require-finalized policy', async () => {
      const config: BlobKitConfig = {
        ethereumRpcUrl: 'http://localhost:8545',
        beaconApiUrl: BEACON_URL,
        enableNativeReader: true,
        finalityPolicy: 'require-finalized'
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          execution_optimistic: false,
          finalized: false,
          data: [{
            index: '0',
            blob: blobToHex(createTestBlob(0)),
            kzg_commitment: createTestCommitment(0),
            kzg_proof: '0x' + 'a'.repeat(96),
            signed_block_header: {
              message: {
                slot: (DENEB_FORK_SLOT + 100000).toString(),
                proposer_index: '12345',
                parent_root: '0x' + '1'.repeat(64),
                state_root: '0x' + '2'.repeat(64),
                body_root: '0x' + '3'.repeat(64)
              },
              signature: '0x' + '4'.repeat(192)
            },
            kzg_commitment_inclusion_proof: Array(17).fill('0x' + '0'.repeat(64))
          }]
        })
      });

      const reader = new BlobReaderModule.BlobReader(config);
      
      await expect(reader.readBlobsByBlock(DENEB_FORK_SLOT + 100000))
        .rejects.toThrow(BlobReaderModule.PolicyRejected);
    });

    it('enforces disallow-optimistic policy', async () => {
      const config: BlobKitConfig = {
        ethereumRpcUrl: 'http://localhost:8545',
        beaconApiUrl: BEACON_URL,
        enableNativeReader: true,
        finalityPolicy: 'disallow-optimistic'
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          execution_optimistic: true,
          finalized: false,
          data: [{
            index: '0',
            blob: blobToHex(createTestBlob(0)),
            kzg_commitment: createTestCommitment(0),
            kzg_proof: '0x' + 'a'.repeat(96),
            signed_block_header: {
              message: {
                slot: (DENEB_FORK_SLOT + 100000).toString(),
                proposer_index: '12345',
                parent_root: '0x' + '1'.repeat(64),
                state_root: '0x' + '2'.repeat(64),
                body_root: '0x' + '3'.repeat(64)
              },
              signature: '0x' + '4'.repeat(192)
            },
            kzg_commitment_inclusion_proof: Array(17).fill('0x' + '0'.repeat(64))
          }]
        })
      });

      const reader = new BlobReaderModule.BlobReader(config);
      
      await expect(reader.readBlobsByBlock(DENEB_FORK_SLOT + 100000))
        .rejects.toThrow(BlobReaderModule.PolicyRejected);
    });
  });

  describe('Caching', () => {
    it('implements LRU eviction', async () => {
      const config: BlobKitConfig = {
        ethereumRpcUrl: 'http://localhost:8545',
        beaconApiUrl: BEACON_URL,
        enableNativeReader: true,
        cacheConfig: {
          maxEntries: 2,
          maxSizeBytes: 2 * BLOB_SIZE
        }
      };

      let callCount = 0;
      mockFetch.mockImplementation(async (url: string) => {
        callCount++;
        const match = url.match(/blob_sidecars\/(\d+)/);
        if (match) {
          const slot = parseInt(match[1]);
          return {
            ok: true,
            json: async () => ({
              execution_optimistic: false,
              finalized: true,
              data: [{
                index: '0',
                blob: blobToHex(createTestBlob(slot)),
                kzg_commitment: createTestCommitment(slot % 100),
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
              }]
            })
          };
        }
        return { ok: true, json: async () => ({ data: [] }) };
      });

      const reader = new BlobReaderModule.BlobReader(config);
      
      const slot1 = DENEB_FORK_SLOT + 10000;
      const slot2 = DENEB_FORK_SLOT + 10001;
      const slot3 = DENEB_FORK_SLOT + 10002;
      
      await reader.readBlobsByBlock(slot1);
      await reader.readBlobsByBlock(slot2);
      
      const initialCallCount = callCount;
      
      await reader.readBlobsByBlock(slot1);
      expect(callCount).toBe(initialCallCount);
      
      await reader.readBlobsByBlock(slot3);
      
      await reader.readBlobsByBlock(slot1);
      expect(callCount).toBeGreaterThan(initialCallCount + 1);
    });
  });

  describe('Network Resilience', () => {
    it('fails over to secondary endpoints', async () => {
      const config: BlobKitConfig = {
        ethereumRpcUrl: 'http://localhost:8545',
        beaconApiUrls: [BEACON_URL, 'http://localhost:5053'],
        enableNativeReader: true
      };

      let attemptCount = 0;
      mockFetch.mockImplementation(async (url: string) => {
        attemptCount++;
        if (url.includes('5052')) {
          throw new Error('Connection refused');
        }
        if (url.includes('5053')) {
          return {
            ok: true,
            json: async () => ({
              execution_optimistic: false,
              finalized: true,
              data: []
            })
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const reader = new BlobReaderModule.BlobReader(config);
      await reader.readBlobsByBlock('head');

      expect(attemptCount).toBe(2);
    });

    it('retries with backoff', async () => {
      const config: BlobKitConfig = {
        ethereumRpcUrl: 'http://localhost:8545',
        beaconApiUrl: BEACON_URL,
        enableNativeReader: true,
        maxRetries: 3,
        retryDelayMs: 10
      };

      let attemptCount = 0;
      const attemptTimes: number[] = [];
      
      mockFetch.mockImplementation(async () => {
        attemptTimes.push(Date.now());
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Timeout');
        }
        return {
          ok: true,
          json: async () => ({
            execution_optimistic: false,
            finalized: true,
            data: []
          })
        };
      });

      const reader = new BlobReaderModule.BlobReader(config);
      await reader.readBlobsByBlock('head');

      expect(attemptCount).toBe(3);
      
      if (attemptTimes.length >= 3) {
        const delay1 = attemptTimes[1] - attemptTimes[0];
        const delay2 = attemptTimes[2] - attemptTimes[1];
        expect(delay2).toBeGreaterThanOrEqual(delay1);
      }
    });
  });

  describe('Request Deduplication', () => {
    it('deduplicates concurrent requests', async () => {
      const config: BlobKitConfig = {
        ethereumRpcUrl: 'http://localhost:8545',
        beaconApiUrl: BEACON_URL,
        enableNativeReader: true
      };

      let resolvePromise: () => void;
      const blockingPromise = new Promise<void>(resolve => {
        resolvePromise = resolve;
      });

      let fetchCount = 0;
      mockFetch.mockImplementation(async () => {
        fetchCount++;
        await blockingPromise;
        return {
          ok: true,
          json: async () => ({
            execution_optimistic: false,
            finalized: true,
            data: []
          })
        };
      });

      const reader = new BlobReaderModule.BlobReader(config);
      const slot = DENEB_FORK_SLOT + 100000;
      
      const promises = Array(5).fill(0).map(() => 
        reader.readBlobsByBlock(slot)
      );

      expect(fetchCount).toBe(1);

      resolvePromise!();
      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(fetchCount).toBe(1);
      
      results.forEach(result => {
        expect(result).toEqual([]);
      });
    });
  });

  describe('Deneb Fork', () => {
    it('rejects pre-Deneb blob requests', async () => {
      const config: BlobKitConfig = {
        ethereumRpcUrl: 'http://localhost:8545',
        beaconApiUrl: BEACON_URL,
        enableNativeReader: true
      };

      const preDenebSlot = DENEB_FORK_SLOT - 1;

      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          code: 400,
          message: 'Blobs are not supported before Deneb fork'
        })
      });

      const reader = new BlobReaderModule.BlobReader(config);
      
      await expect(reader.readBlobsByBlock(preDenebSlot))
        .rejects.toThrow();
    });
  });

  describe('Versioned Hash', () => {
    it('calculates correctly per EIP-4844', () => {
      const commitment = createTestCommitment(0);
      const commitmentBytes = hexToBytes(commitment);
      
      const hash = createHash('sha256').update(commitmentBytes).digest();
      hash[0] = 0x01;
      const expectedHash = ('0x' + hash.toString('hex')) as `0x${string}`;

      const calculatedHash = toVersionedHash(commitment);
      
      expect(calculatedHash).toBe(expectedHash);
      expect(calculatedHash.startsWith('0x01')).toBe(true);
      expect(calculatedHash).toHaveLength(66);
    });
  });

  describe('Health Check', () => {
    it('reports endpoint health', async () => {
      const config: BlobKitConfig = {
        ethereumRpcUrl: 'http://localhost:8545',
        beaconApiUrls: [BEACON_URL, 'http://localhost:5053'],
        enableNativeReader: true
      };

      mockFetch.mockImplementation(async (url: string) => {
        if (url === `${BEACON_URL}/eth/v1/beacon/blob_sidecars/head`) {
          return { 
            ok: true, 
            status: 200,
            json: async () => ({
              execution_optimistic: false,
              finalized: true,
              data: []
            })
          };
        }
        if (url === 'http://localhost:5053/eth/v1/beacon/blob_sidecars/head') {
          throw new Error('Connection refused');
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const reader = new BlobReaderModule.BlobReader(config);
      const health = await reader.health();

      expect(health).toHaveLength(2);
      expect(health[0]).toMatchObject({
        endpoint: BEACON_URL,
        status: 'ok'
      });
      expect(health[1]).toMatchObject({
        endpoint: 'http://localhost:5053',
        status: 'error',
        error: expect.stringContaining('Connection refused')
      });
    });
  });

  describe('Data Integrity', () => {
    it('rejects incorrect blob size', async () => {
      const config: BlobKitConfig = {
        ethereumRpcUrl: 'http://localhost:8545',
        beaconApiUrl: BEACON_URL,
        enableNativeReader: true
      };

      const wrongSizeBlob = new Uint8Array(BLOB_SIZE - 1);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          execution_optimistic: false,
          finalized: true,
          data: [{
            index: '0',
            blob: blobToHex(wrongSizeBlob),
            kzg_commitment: createTestCommitment(0),
            kzg_proof: '0x' + 'a'.repeat(96),
            signed_block_header: {
              message: {
                slot: (DENEB_FORK_SLOT + 100000).toString(),
                proposer_index: '12345',
                parent_root: '0x' + '1'.repeat(64),
                state_root: '0x' + '2'.repeat(64),
                body_root: '0x' + '3'.repeat(64)
              },
              signature: '0x' + '4'.repeat(192)
            },
            kzg_commitment_inclusion_proof: Array(17).fill('0x' + '0'.repeat(64))
          }]
        })
      });

      const reader = new BlobReaderModule.BlobReader(config);
      
      await expect(reader.readBlobsByBlock(DENEB_FORK_SLOT + 100000))
        .rejects.toThrow('Invalid blob size');
    });

    it('detects KZG verification failures', async () => {
      const config: BlobKitConfig = {
        ethereumRpcUrl: 'http://localhost:8545',
        beaconApiUrl: BEACON_URL,
        enableNativeReader: true
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          execution_optimistic: false,
          finalized: true,
          data: [{
            index: '0',
            blob: blobToHex(createTestBlob(0)),
            kzg_commitment: createTestCommitment(0),
            kzg_proof: '0x' + 'a'.repeat(96),
            signed_block_header: {
              message: {
                slot: (DENEB_FORK_SLOT + 100000).toString(),
                proposer_index: '12345',
                parent_root: '0x' + '1'.repeat(64),
                state_root: '0x' + '2'.repeat(64),
                body_root: '0x' + '3'.repeat(64)
              },
              signature: '0x' + '4'.repeat(192)
            },
            kzg_commitment_inclusion_proof: Array(17).fill('0x' + '0'.repeat(64))
          }]
        })
      });

      (verifyBlobKzgProof as jest.Mock).mockResolvedValueOnce(false);

      const reader = new BlobReaderModule.BlobReader(config);
      
      await expect(reader.readBlobsByBlock(DENEB_FORK_SLOT + 100000))
        .rejects.toThrow(BlobReaderModule.IntegrityError);
    });
  });
});
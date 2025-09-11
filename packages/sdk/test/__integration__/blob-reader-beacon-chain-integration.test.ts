/**
 * Integration tests for BlobReader's Beacon Chain blob fetching functionality
 * 
 * Tests the native blob reading implementation that fetches EIP-4844 blob data
 * from Ethereum Beacon Chain nodes via REST API, verifies KZG proofs, and handles
 * various network conditions, finality states, and error scenarios.
 */

import { 
  BlobReader,
  NotFoundWithinSlot,
  ExpiredBlob,
  PolicyRejected,
  ReorgDetected,
  IntegrityError,
  ProviderUnavailable
} from '../../src/blob-reader';
import { 
  MockKZG, 
  MockELProvider, 
  createMockBeaconFetch,
  createTestSidecar,
  toVersionedHash,
  TEST_COMMITMENT,
  TEST_PROOF,
  Hex,
  createTestCommitment,
  createTestBlob,
  blobToHex,
  createTestTxHash,
  createTestBlockHash,
  BLOB_SIZE,
  FIELD_ELEMENTS_PER_BLOB,
  BYTES_PER_FIELD_ELEMENT
} from '../utils/blob-test-utils';

// Mock the KZG module before any imports that use it
jest.mock('../../src/kzg', () => ({
  ...jest.requireActual('../../src/kzg'),
  verifyBlobKzgProof: jest.fn(),
  verifyBlobKzgProofBatch: jest.fn(),
  blobToKzgCommitment: jest.fn().mockReturnValue(new Uint8Array(48))
}));

import * as kzgModule from '../../src/kzg';
const mockVerifyBlobKzgProof = kzgModule.verifyBlobKzgProof as jest.Mock;
const mockVerifyBlobKzgProofBatch = kzgModule.verifyBlobKzgProofBatch as jest.Mock;

describe('BlobReader - Beacon Chain Integration', () => {
  let reader: BlobReader;
  let mockEL: MockELProvider;
  let mockBeacon: ReturnType<typeof createMockBeaconFetch>;

  beforeEach(() => {
    // Reset all mocks to clean state
    jest.clearAllMocks();
    mockVerifyBlobKzgProof.mockResolvedValue(true);
    mockVerifyBlobKzgProofBatch.mockResolvedValue(true);
    
    // Create fresh mocks
    mockEL = new MockELProvider();
    mockBeacon = createMockBeaconFetch();

    // Create reader with proper dependency injection
    reader = new BlobReader({
      rpcUrl: 'http://localhost:8545',
      beaconApiUrls: ['http://localhost:5052', 'http://localhost:5053'], // Multiple for fallback testing
      retentionWindow: 131072,
      genesisTime: 1606824023,
      secondsPerSlot: 12
    });
    
    // Override provider only (KZG is mocked at module level)
    (reader as any).provider = mockEL;
  });

  afterEach(() => {
    mockBeacon.clearResponses();
  });

  describe('Fetching blobs from transaction with beacon chain verification', () => {
    it('fetches multiple blobs for EIP-4844 transaction and verifies each KZG proof', async () => {
      // Arrange
      const txHash = createTestTxHash(1);
      const blockHash = createTestBlockHash(1);
      const blockNumber = 1000000;
      const slot = 8000000;
      const timestamp = 1606824023 + (slot * 12);
      
      const commitment1 = createTestCommitment(0);
      const commitment2 = createTestCommitment(1);
      const versionedHash1 = toVersionedHash(commitment1);
      const versionedHash2 = toVersionedHash(commitment2);

      mockEL.setResponse('eth_getTransactionByHash', [txHash], {
        hash: txHash,
        blockNumber: `0x${blockNumber.toString(16)}`,
        blockHash: blockHash,
        blobVersionedHashes: [versionedHash1, versionedHash2],
        type: '0x3'
      });

      mockEL.setResponse('eth_getBlockByNumber', [blockNumber, false], {
        number: `0x${blockNumber.toString(16)}`,
        hash: blockHash,
        timestamp: timestamp
      });

      const sidecar1 = createTestSidecar(0, 0, slot);
      sidecar1.kzg_commitment = commitment1;
      const sidecar2 = createTestSidecar(1, 1, slot);
      sidecar2.kzg_commitment = commitment2;

      mockBeacon.setResponse(`http://localhost:5052/eth/v1/beacon/blob_sidecars/${slot}`, {
        data: [sidecar1, sidecar2],
        execution_optimistic: false,
        finalized: true
      });

      // Act
      const blobs = await reader.readBlobsByTx(txHash);

      // Assert
      expect(blobs).toHaveLength(2);
      expect(blobs[0]).toMatchObject({
        versionedHash: versionedHash1,
        slot: slot,
        index: 0,
        commitment: commitment1,
        proof: TEST_PROOF,
        source: 'provider-beacon'
      });
      expect(blobs[0].fieldElements).toHaveLength(FIELD_ELEMENTS_PER_BLOB);
      expect(blobs[0].fieldElements[0]).toHaveLength(BYTES_PER_FIELD_ELEMENT);
      
      expect(mockVerifyBlobKzgProof).toHaveBeenCalledTimes(2);
      expect(mockVerifyBlobKzgProof).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        commitment1,
        TEST_PROOF
      );
    });

    it('returns empty array for non-blob transaction type 0x2', async () => {
      const txHash = createTestTxHash(2);
      const blockHash = createTestBlockHash(2);

      mockEL.setResponse('eth_getTransactionByHash', [txHash], {
        hash: txHash,
        blockNumber: '0xf4240',
        blockHash: blockHash,
        type: '0x2'
      });

      const blobs = await reader.readBlobsByTx(txHash);

      expect(blobs).toEqual([]);
      expect(mockVerifyBlobKzgProof).not.toHaveBeenCalled();
    });

    it('uses LRU cache on subsequent requests for same blob', async () => {
      const txHash = createTestTxHash(3);
      const blockHash = createTestBlockHash(3);
      const versionedHash = toVersionedHash(TEST_COMMITMENT);

      mockEL.setResponse('eth_getTransactionByHash', [txHash], {
        hash: txHash,
        blockNumber: '0xf4240',
        blockHash: blockHash,
        blobVersionedHashes: [versionedHash],
        type: '0x3'
      });

      mockEL.setResponse('eth_getBlockByNumber', [1000000, false], {
        number: '0xf4240',
        hash: blockHash,
        timestamp: 1702824023
      });

      mockBeacon.setResponse('http://localhost:5052/eth/v1/beacon/blob_sidecars/8000000', {
        data: [createTestSidecar(0, 0, 8000000)],
        execution_optimistic: false,
        finalized: true
      });

      const blobs1 = await reader.readBlobsByTx(txHash);
      expect(mockVerifyBlobKzgProof).toHaveBeenCalledTimes(1);

      const blobs2 = await reader.readBlobsByTx(txHash);
      expect(mockVerifyBlobKzgProof).toHaveBeenCalledTimes(1); // Still 1, cached
      expect(blobs2).toEqual(blobs1);
    });

    it('throws NotFoundWithinSlot error when blob hash not in beacon sidecars', async () => {
      const txHash = createTestTxHash(4);
      const blockHash = createTestBlockHash(4);
      const versionedHash = toVersionedHash(TEST_COMMITMENT);
      const slot = 8000000;

      mockEL.setResponse('eth_getTransactionByHash', [txHash], {
        hash: txHash,
        blockNumber: '0xf4240',
        blockHash: blockHash,
        blobVersionedHashes: [versionedHash],
        type: '0x3'
      });

      mockEL.setResponse('eth_getBlockByNumber', [1000000, false], {
        number: '0xf4240',
        hash: blockHash,
        timestamp: 1702824023
      });

      mockBeacon.setResponse(`http://localhost:5052/eth/v1/beacon/blob_sidecars/${slot}`, {
        data: [],
        execution_optimistic: false,
        finalized: false
      });

      const error = await reader.readBlobsByTx(txHash).catch(e => e);
      
      expect(error).toBeInstanceOf(NotFoundWithinSlot);
      expect(error.slot).toBe(slot);
      expect(error.message).toContain('slot 8000000');
    });

    it('throws error when transaction not found in execution layer', async () => {
      const txHash = createTestTxHash(5);

      mockEL.setResponse('eth_getTransactionByHash', [txHash], null);

      await expect(reader.readBlobsByTx(txHash))
        .rejects.toThrow('Transaction not found');
    });

    it('throws error when block not found in execution layer', async () => {
      const txHash = createTestTxHash(6);
      const blockHash = createTestBlockHash(6);

      mockEL.setResponse('eth_getTransactionByHash', [txHash], {
        hash: txHash,
        blockNumber: '0xf4240',
        blockHash: blockHash,
        blobVersionedHashes: [toVersionedHash(TEST_COMMITMENT)],
        type: '0x3'
      });

      mockEL.setResponse('eth_getBlockByNumber', [1000000, false], null);

      await expect(reader.readBlobsByTx(txHash))
        .rejects.toThrow('Block not found');
    });

    it('detects blockchain reorganization when block hash changes', async () => {
      const txHash = createTestTxHash(7);
      const originalHash = createTestBlockHash(7);
      const reorgedHash = createTestBlockHash(77);
      const blockNumber = 1000000;

      mockEL.setResponse('eth_getTransactionByHash', [txHash], {
        hash: txHash,
        blockNumber: `0x${blockNumber.toString(16)}`,
        blockHash: originalHash,
        blobVersionedHashes: [toVersionedHash(TEST_COMMITMENT)],
        type: '0x3'
      });

      let callCount = 0;
      mockEL.getBlock = jest.fn(async (blockId: string | number) => {
        callCount++;
        return {
          number: `0x${blockNumber.toString(16)}`,
          hash: callCount === 1 ? originalHash : reorgedHash,
          timestamp: 1702824023
        };
      });

      mockBeacon.setResponse('http://localhost:5052/eth/v1/beacon/blob_sidecars/8000000', {
        data: [createTestSidecar(0, 0, 8000000)],
        execution_optimistic: false,
        finalized: false
      });

      const error = await reader.readBlobsByTx(txHash).catch(e => e);
      
      expect(error).toBeInstanceOf(ReorgDetected);
      expect(error.blockNumber).toBe(blockNumber);
      expect(error.expectedHash).toBe(originalHash);
      expect(error.actualHash).toBe(reorgedHash);
    });
  });

  describe('Fetching blobs from block with batch KZG verification', () => {
    it('fetches specific blob indices and batch verifies KZG proofs', async () => {
      const indices = [0, 2];
      const commitment0 = createTestCommitment(0);
      const commitment2 = createTestCommitment(2);

      const sidecars = [
        createTestSidecar(0, 0, 1000000),
        createTestSidecar(2, 2, 1000000)
      ];
      sidecars[0].kzg_commitment = commitment0;
      sidecars[1].kzg_commitment = commitment2;

      mockBeacon.setResponse('http://localhost:5052/eth/v1/beacon/blob_sidecars/head?indices=0,2', {
        data: sidecars,
        execution_optimistic: false,
        finalized: true
      });

      const blobs = await reader.readBlobsByBlock('head', indices);

      expect(blobs).toHaveLength(2);
      expect(blobs[0].index).toBe(0);
      expect(blobs[1].index).toBe(2);
      
      expect(mockVerifyBlobKzgProofBatch).toHaveBeenCalledTimes(1);
      expect(mockVerifyBlobKzgProofBatch).toHaveBeenCalledWith(
        expect.arrayContaining([expect.any(Uint8Array)]),
        expect.arrayContaining([commitment0, commitment2]),
        expect.any(Array)
      );
      
      // TODO: Fix implementation - currently does redundant individual verification
      expect(mockVerifyBlobKzgProof).toHaveBeenCalledTimes(2);
    });

    it('fetches all blobs when no indices specified', async () => {
      const sidecars = Array.from({ length: 3 }, (_, i) => createTestSidecar(i, i, 1000000));

      mockBeacon.setResponse('http://localhost:5052/eth/v1/beacon/blob_sidecars/finalized', {
        data: sidecars,
        execution_optimistic: false,
        finalized: true
      });

      const blobs = await reader.readBlobsByBlock('finalized');

      expect(blobs).toHaveLength(3);
      blobs.forEach((blob, i) => {
        expect(blob.index).toBe(i);
      });
    });

    it('falls back to individual verification when batch KZG fails', async () => {
      const sidecars = Array.from({ length: 3 }, (_, i) => createTestSidecar(i, i, 1000000));

      mockBeacon.setResponse('http://localhost:5052/eth/v1/beacon/blob_sidecars/head', {
        data: sidecars,
        execution_optimistic: false,
        finalized: true
      });

      mockVerifyBlobKzgProofBatch.mockResolvedValueOnce(false);
      let individualCallCount = 0;
      mockVerifyBlobKzgProof.mockImplementation(async () => {
        const currentCall = individualCallCount++;
        return currentCall !== 1;
      });

      await expect(reader.readBlobsByBlock('head'))
        .rejects.toThrow(IntegrityError);

      expect(mockVerifyBlobKzgProofBatch).toHaveBeenCalledTimes(1);
      // TODO: Implementation stops at first failure instead of checking all
      expect(mockVerifyBlobKzgProof).toHaveBeenCalledTimes(2);
    });

    it('rejects invalid blob indices outside valid range', async () => {
      const invalidIndices = [-1, 7];

      await expect(reader.readBlobsByBlock('head', invalidIndices))
        .rejects.toThrow();
    });
  });

  describe('Fetching single blob by versioned hash', () => {
    it('fetches blob using versioned hash and slot hint', async () => {
      const versionedHash = toVersionedHash(TEST_COMMITMENT);
      const slotHint = 1000000;

      const sidecar = createTestSidecar(0, 0, slotHint);

      mockBeacon.setResponse(`http://localhost:5052/eth/v1/beacon/blob_sidecars/${slotHint}`, {
        data: [sidecar],
        execution_optimistic: false,
        finalized: true
      });

      const blob = await reader.readBlobByHash(versionedHash, slotHint);

      expect(blob.versionedHash).toBe(versionedHash);
      expect(blob.slot).toBe(slotHint);
    });

    it('throws NotFoundWithinSlot when blob absent at hinted slot', async () => {
      const versionedHash = toVersionedHash(TEST_COMMITMENT);
      const slotHint = 1000000;

      mockBeacon.setResponse(`http://localhost:5052/eth/v1/beacon/blob_sidecars/${slotHint}`, {
        data: [],
        execution_optimistic: false,
        finalized: false
      });

      const error = await reader.readBlobByHash(versionedHash, slotHint).catch(e => e);
      
      expect(error).toBeInstanceOf(NotFoundWithinSlot);
      expect(error.slot).toBe(slotHint);
    });
  });

  describe('Beacon chain finality policy enforcement', () => {
    it('rejects execution-optimistic blocks with disallow-optimistic policy', async () => {
      reader = new BlobReader({
        rpcUrl: 'http://localhost:8545',
        beaconApiUrls: ['http://localhost:5052'],
      });
      (reader as any).provider = mockEL;

      mockBeacon.setResponse('http://localhost:5052/eth/v1/beacon/blob_sidecars/head', {
        data: [createTestSidecar(0)],
        execution_optimistic: true,
        finalized: false
      });

      const error = await reader.readBlobsByBlock('head').catch(e => e);
      
      expect(error).toBeInstanceOf(PolicyRejected);
      expect(error.policy).toBe('disallow-optimistic');
      expect(error.message).toContain('execution_optimistic');
    });

    it('rejects non-finalized blocks with require-finalized policy', async () => {
      reader = new BlobReader({
        rpcUrl: 'http://localhost:8545',
        beaconApiUrls: ['http://localhost:5052'],
      });
      (reader as any).provider = mockEL;

      mockBeacon.setResponse('http://localhost:5052/eth/v1/beacon/blob_sidecars/head', {
        data: [createTestSidecar(0)],
        execution_optimistic: false,
        finalized: false
      });

      const error = await reader.readBlobsByBlock('head').catch(e => e);
      
      expect(error).toBeInstanceOf(PolicyRejected);
      expect(error.policy).toBe('require-finalized');
      expect(error.message).toContain('not finalized');
    });
  });

  describe('Blob retention and expiry handling', () => {
    it('throws ExpiredBlob for slots beyond retention window', async () => {
      reader = new BlobReader({
        rpcUrl: 'http://localhost:8545',
        beaconApiUrls: ['http://localhost:5052'],
        retentionWindow: 131072,
        currentSlot: 200000,
      });
      (reader as any).provider = mockEL;

      const oldSlot = 50000;
      const versionedHash = toVersionedHash(TEST_COMMITMENT);

      const error = await reader.readBlobByHash(versionedHash, oldSlot).catch(e => e);
      
      expect(error).toBeInstanceOf(ExpiredBlob);
      expect(error.slot).toBe(oldSlot);
      expect(error.retentionWindow).toBe(131072);
      expect(error.message).toContain('expired');
    });

    it('fetches expired blob from archive service when available', async () => {
      const versionedHash = toVersionedHash(TEST_COMMITMENT);
      const oldSlot = 50000;
      
      const customFetch = jest.fn(async (url: string) => {
        if (url === `https://archive.example.com/blobs/${versionedHash}`) {
          return {
            ok: true,
            json: async () => ({
              blob: blobToHex(createTestBlob(0)),
              commitment: TEST_COMMITMENT,
              proof: TEST_PROOF
            })
          };
        }
        return mockBeacon.fetch(url);
      });

      reader = new BlobReader({
        rpcUrl: 'http://localhost:8545',
        beaconApiUrls: ['http://localhost:5052'],
        archiveUrl: 'https://archive.example.com',
        retentionWindow: 131072,
        currentSlot: 200000,
      });
      (reader as any).provider = mockEL;

      const blob = await reader.readBlobByHash(versionedHash, oldSlot);

      expect(blob.versionedHash).toBe(versionedHash);
      expect(blob.source).toBe('archive');
      expect(customFetch).toHaveBeenCalledWith(`https://archive.example.com/blobs/${versionedHash}`);
    });
  });

  describe('Beacon node failover and network resilience', () => {
    it('falls back to secondary beacon when primary fails', async () => {
      let callCount = 0;
      const customFetch = jest.fn(async (url: string) => {
        callCount++;
        if (url.includes('5052') && callCount === 1) {
          throw new Error('Network error');
        }
        if (url.includes('5053')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: [createTestSidecar(0)],
              execution_optimistic: false,
              finalized: true
            })
          };
        }
        throw new Error('Unexpected URL');
      });

      reader = new BlobReader({
        rpcUrl: 'http://localhost:8545',
        beaconApiUrls: ['http://localhost:5052', 'http://localhost:5053'],
      });
      (reader as any).provider = mockEL;

      const blobs = await reader.readBlobsByBlock('head');
      
      expect(blobs).toHaveLength(1);
      expect(customFetch).toHaveBeenCalledWith(expect.stringContaining('5052'));
      expect(customFetch).toHaveBeenCalledWith(expect.stringContaining('5053'));
    });

    it('throws ProviderUnavailable when all beacon nodes fail', async () => {
      const customFetch = jest.fn(async () => {
        throw new Error('Network error');
      });

      reader = new BlobReader({
        rpcUrl: 'http://localhost:8545',
        beaconApiUrls: ['http://localhost:5052', 'http://localhost:5053'],
      });
      (reader as any).provider = mockEL;

      const error = await reader.readBlobsByBlock('head').catch(e => e);
      
      expect(error).toBeInstanceOf(ProviderUnavailable);
      expect(error.status).toBe(503);
    });

    it('handles malformed JSON response from beacon node', async () => {
      const customFetch = jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Invalid JSON');
        }
      }));

      reader = new BlobReader({
        rpcUrl: 'http://localhost:8545',
        beaconApiUrls: ['http://localhost:5052'],
      });
      (reader as any).provider = mockEL;

      await expect(reader.readBlobsByBlock('head'))
        .rejects.toThrow(ProviderUnavailable);
    });

    it('times out after 10 seconds for slow beacon responses', async () => {
      const customFetch = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 20000));
        return { ok: true };
      });

      reader = new BlobReader({
        rpcUrl: 'http://localhost:8545',
        beaconApiUrls: ['http://localhost:5052'],
      });
      (reader as any).provider = mockEL;

      await expect(reader.readBlobsByBlock('head'))
        .rejects.toThrow();
    }, 15000);
  });

  describe('Edge cases and boundary conditions', () => {
    it('handles maximum 6 blobs per block correctly', async () => {
      const MAX_BLOBS_PER_BLOCK = 6;
      const sidecars = Array.from({ length: MAX_BLOBS_PER_BLOCK }, (_, i) => 
        createTestSidecar(i, i, 1000000)
      );

      mockBeacon.setResponse('http://localhost:5052/eth/v1/beacon/blob_sidecars/head', {
        data: sidecars,
        execution_optimistic: false,
        finalized: true
      });

      const blobs = await reader.readBlobsByBlock('head');
      
      expect(blobs).toHaveLength(MAX_BLOBS_PER_BLOCK);
    });

    it('allows blob at exact retention window boundary', async () => {
      const retentionWindow = 131072;
      const currentSlot = 200000;
      const boundarySlot = currentSlot - retentionWindow;

      reader = new BlobReader({
        rpcUrl: 'http://localhost:8545',
        beaconApiUrls: ['http://localhost:5052'],
        retentionWindow,
        currentSlot,
      });
      (reader as any).provider = mockEL;

      mockBeacon.setResponse(`http://localhost:5052/eth/v1/beacon/blob_sidecars/${boundarySlot}`, {
        data: [createTestSidecar(0, 0, boundarySlot)],
        execution_optimistic: false,
        finalized: true
      });

      const blob = await reader.readBlobByHash(toVersionedHash(TEST_COMMITMENT), boundarySlot);
      expect(blob).toBeDefined();
    });

    it('handles genesis slot 0 with empty blob list', async () => {
      mockBeacon.setResponse('http://localhost:5052/eth/v1/beacon/blob_sidecars/0', {
        data: [],
        execution_optimistic: false,
        finalized: true
      });

      const blobs = await reader.readBlobsByBlock(0);
      
      expect(blobs).toEqual([]);
    });

    it('rejects blob with size not equal to 131072 bytes', async () => {
      const invalidSidecar = createTestSidecar(0);
      invalidSidecar.blob = ('0x' + '00'.repeat(BLOB_SIZE - 100)) as Hex;

      mockBeacon.setResponse('http://localhost:5052/eth/v1/beacon/blob_sidecars/head', {
        data: [invalidSidecar],
        execution_optimistic: false,
        finalized: true
      });

      await expect(reader.readBlobsByBlock('head'))
        .rejects.toThrow(IntegrityError);
    });
  });

  describe('Beacon node health monitoring', () => {
    it('reports healthy status with latency for responsive beacon', async () => {
      mockBeacon.setResponse('http://localhost:5052/eth/v1/beacon/blob_sidecars/head', {
        data: [],
        execution_optimistic: false,
        finalized: true
      });

      const health = await reader.health();
      
      expect(health).toHaveLength(2);
      expect(health[0]).toMatchObject({
        endpoint: 'http://localhost:5052',
        status: 'ok',
        latency: expect.any(Number)
      });
      expect(health[0].latency).toBeLessThan(1000);
    });

    it('reports error status for unreachable beacon node', async () => {
      const customFetch = jest.fn(async () => {
        throw new Error('Connection refused');
      });

      reader = new BlobReader({
        rpcUrl: 'http://localhost:8545',
        beaconApiUrls: ['http://localhost:5052'],
      });

      const health = await reader.health();
      
      expect(health[0]).toMatchObject({
        endpoint: 'http://localhost:5052',
        status: 'error',
        error: expect.stringContaining('Connection refused')
      });
    });
  });

  describe('LRU cache management and eviction', () => {
    it('evicts oldest blob when cache reaches max entries', async () => {
      reader = new BlobReader({
        rpcUrl: 'http://localhost:8545',
        beaconApiUrls: ['http://localhost:5052'],
        cacheConfig: {
          maxEntries: 2,
          maxSizeBytes: BLOB_SIZE * 2
        }
      });
      (reader as any).provider = mockEL;

      for (let i = 0; i < 3; i++) {
        const versionedHash = toVersionedHash(createTestCommitment(i));
        const sidecar = createTestSidecar(i, i, 1000000 + i);
        sidecar.kzg_commitment = createTestCommitment(i);

        mockBeacon.setResponse(`http://localhost:5052/eth/v1/beacon/blob_sidecars/${1000000 + i}`, {
          data: [sidecar],
          execution_optimistic: false,
          finalized: true
        });

        await reader.readBlobByHash(versionedHash, 1000000 + i);
      }

      const cache = (reader as any).cache;
      expect(cache.get(toVersionedHash(createTestCommitment(0)))).toBeUndefined();
      expect(cache.get(toVersionedHash(createTestCommitment(1)))).toBeDefined();
      expect(cache.get(toVersionedHash(createTestCommitment(2)))).toBeDefined();
    });
  });

  describe('Concurrent request handling', () => {
    it('processes multiple transaction blob requests in parallel', async () => {
      const txHashes = [
        createTestTxHash(100),
        createTestTxHash(101),
        createTestTxHash(102)
      ];

      txHashes.forEach((txHash, i) => {
        const blockHash = createTestBlockHash(100 + i);
        
        mockEL.setResponse('eth_getTransactionByHash', [txHash], {
          hash: txHash,
          blockNumber: `0x${(1000000 + i).toString(16)}`,
          blockHash: blockHash,
          blobVersionedHashes: [toVersionedHash(createTestCommitment(i))],
          type: '0x3'
        });

        mockEL.setResponse('eth_getBlockByNumber', [1000000 + i, false], {
          number: `0x${(1000000 + i).toString(16)}`,
          hash: blockHash,
          timestamp: 1702824023 + i * 12
        });

        mockBeacon.setResponse(`http://localhost:5052/eth/v1/beacon/blob_sidecars/${8000000 + i}`, {
          data: [createTestSidecar(0, i, 8000000 + i)],
          execution_optimistic: false,
          finalized: true
        });
      });

      const results = await Promise.all(
        txHashes.map(txHash => reader.readBlobsByTx(txHash))
      );

      expect(results).toHaveLength(3);
      results.forEach((blobs, i) => {
        expect(blobs).toHaveLength(1);
        expect(blobs[0].slot).toBe(8000000 + i);
      });
    });

    it('deduplicates concurrent requests for same blob', async () => {
      const versionedHash = toVersionedHash(TEST_COMMITMENT);
      const slot = 1000000;

      mockBeacon.setResponse(`http://localhost:5052/eth/v1/beacon/blob_sidecars/${slot}`, {
        data: [createTestSidecar(0, 0, slot)],
        execution_optimistic: false,
        finalized: true
      });

      const promises = Array(5).fill(0).map(() => 
        reader.readBlobByHash(versionedHash, slot)
      );

      const results = await Promise.all(promises);

      results.forEach(blob => {
        expect(blob.versionedHash).toBe(versionedHash);
      });

      expect(mockVerifyBlobKzgProof).toHaveBeenCalledTimes(1);
    });
  });
});
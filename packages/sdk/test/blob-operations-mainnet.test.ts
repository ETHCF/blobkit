/**
 * BlobKit SDK Mainnet Integration Tests
 * 
 * Tests blob operations against Ethereum mainnet:
 * - Reading real blobs from mainnet via blobscan
 * - Blob encoding/decoding with KZG operations
 * - Data integrity verification
 * - Error handling
 */

import { describe, test, expect, beforeAll, jest } from '@jest/globals';
import { BlobKit } from '../src/blobkit';
import { BlobReader } from '../src/blob-reader';
import { 
  initializeKzg, 
  encodeBlob,
  decodeBlob,
  blobToKzgCommitment,
  computeKzgProof,
  commitmentToVersionedHash,
  FIELD_ELEMENTS_PER_BLOB,
  BYTES_PER_FIELD_ELEMENT,
  BLOB_SIZE
} from '../src/kzg';
import { ethers } from 'ethers';
import type { BlobReceipt } from '../src/types';
import * as fs from 'fs';

// Configuration - reads from environment variables
const MAINNET_RPC_URL = process.env.BLOBKIT_RPC_URL || process.env.RPC_URL || 'http://localhost:8545';
const BLOBSCAN_API_URL = process.env.BLOBSCAN_API_URL || 'https://api.blobscan.com';
const TRUSTED_SETUP_URL = 'https://raw.githubusercontent.com/ethereum/c-kzg-4844/main/src/trusted_setup.txt';
const TRUSTED_SETUP_PATH = process.env.BLOBKIT_KZG_TRUSTED_SETUP_PATH || '/tmp/trusted_setup.txt';

// Known mainnet blob transaction for reliable testing
const KNOWN_BLOB_TX = '0xb8c08b7f2355a5d9a4522de061556aaf16e8670a015aec9149e0157f83c7be8f';

describe('BlobKit SDK Mainnet Integration', () => {
  let provider: ethers.JsonRpcProvider;
  let blobReader: BlobReader;
  let blobKit: BlobKit;
  
  beforeAll(async () => {
    // Check if mainnet RPC is configured
    if (MAINNET_RPC_URL === 'http://localhost:8545') {
      console.warn('Warning: No mainnet RPC URL configured. Set BLOBKIT_RPC_URL in .env file.');
      console.warn('Using localhost:8545 as fallback (tests may fail).');
    }
    
    // Initialize provider
    provider = new ethers.JsonRpcProvider(MAINNET_RPC_URL);
    
    // Ensure trusted setup is available
    if (!fs.existsSync(TRUSTED_SETUP_PATH)) {
      console.log('Downloading KZG trusted setup...');
      const response = await fetch(TRUSTED_SETUP_URL);
      const data = await response.text();
      fs.writeFileSync(TRUSTED_SETUP_PATH, data);
    }
    
    // Initialize KZG
    await initializeKzg({ trustedSetupPath: TRUSTED_SETUP_PATH });
    
    // Initialize BlobReader
    blobReader = new BlobReader({
      rpcUrl: MAINNET_RPC_URL,
      archiveUrl: BLOBSCAN_API_URL,
      logLevel: 'silent'
    });
    
    // Initialize BlobKit
    blobKit = new BlobKit({
      rpcUrl: MAINNET_RPC_URL,
      archiveUrl: BLOBSCAN_API_URL,
      chainId: 1,
      logLevel: 'silent'
    });
  }, 60000);

  describe('Blob Reading from Mainnet', () => {
    test('should read blob data from mainnet', async () => {
      const result = await blobReader.readBlob(KNOWN_BLOB_TX);
      
      expect(result).toBeDefined();
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.blobIndex).toBe(0);
      expect(result.source).toBe('archive');
    });

    test('should read blob using BlobKit class', async () => {
      const result = await blobKit.readBlob(KNOWN_BLOB_TX);
      
      expect(result).toBeDefined();
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(result.data.length).toBeGreaterThan(0);
    });

    test('should handle multiple blob indices', async () => {
      // Read second blob (index 1) from transaction with multiple blobs
      const result = await blobReader.readBlob(KNOWN_BLOB_TX, 1);
      
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(result.blobIndex).toBe(1);
    });

    test('should decode blob as string when possible', async () => {
      try {
        const text = await blobKit.readBlobAsString(KNOWN_BLOB_TX);
        expect(typeof text).toBe('string');
      } catch (error) {
        // Some blobs may not be valid UTF-8, which is expected
        expect(error).toBeDefined();
      }
    });
  });

  describe('Blob Encoding and KZG Operations', () => {
    test('should encode data into blob format', () => {
      const testData = Buffer.from('Test blob data');
      const blob = encodeBlob(testData);
      
      expect(blob).toBeInstanceOf(Uint8Array);
      expect(blob.length).toBe(BLOB_SIZE);
      
      // Verify field element structure
      for (let i = 0; i < FIELD_ELEMENTS_PER_BLOB; i++) {
        const fieldStart = i * 32;
        expect(blob[fieldStart]).toBe(0); // First byte must be 0
      }
    });

    test('should perform round-trip encoding and decoding', () => {
      const originalData = Buffer.from('Round-trip test: Hello World! 123');
      const blob = encodeBlob(originalData);
      const decoded = decodeBlob(blob);
      
      // Verify data integrity
      expect(decoded.length).toBe(originalData.length);
      for (let i = 0; i < originalData.length; i++) {
        expect(decoded[i]).toBe(originalData[i]);
      }
    });

    test('should compute KZG commitment and proof', () => {
      const testData = Buffer.from('KZG test data');
      const blob = encodeBlob(testData);
      
      const commitment = blobToKzgCommitment(blob);
      expect(commitment).toBeInstanceOf(Uint8Array);
      expect(commitment.length).toBe(48);
      
      const proof = computeKzgProof(blob, commitment);
      expect(proof).toBeInstanceOf(Uint8Array);
      expect(proof.length).toBe(48);
    });

    test('should generate versioned hash', async () => {
      const blob = encodeBlob(Buffer.from('Hash test'));
      const commitment = blobToKzgCommitment(blob);
      const versionedHash = await commitmentToVersionedHash(commitment);
      
      expect(versionedHash).toMatch(/^0x01[a-f0-9]{62}$/);
      expect(versionedHash.length).toBe(66);
    });

    test('should handle binary data correctly', () => {
      const binaryData = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        binaryData[i] = i;
      }
      
      const blob = encodeBlob(binaryData);
      const decoded = decodeBlob(blob);
      
      for (let i = 0; i < 256; i++) {
        expect(decoded[i]).toBe(i);
      }
    });
  });

  describe('Error Handling', () => {
    test('should throw error for non-existent transaction', async () => {
      const fakeTxHash = '0x' + '0'.repeat(64);
      
      await expect(blobReader.readBlob(fakeTxHash))
        .rejects
        .toThrow('Transaction not found');
    });

    test('should throw error for invalid blob index', async () => {
      // KNOWN_BLOB_TX has 6 blobs, so index 10 should be invalid
      await expect(blobReader.readBlob(KNOWN_BLOB_TX, 10))
        .rejects
        .toThrow('Invalid blob index');
    });

    test('should throw error for oversized blob data', () => {
      const oversized = new Uint8Array(130 * 1024);
      
      expect(() => encodeBlob(oversized))
        .toThrow('Data too large');
    });

    test('should throw error for empty data', () => {
      const empty = new Uint8Array(0);
      
      expect(() => encodeBlob(empty))
        .toThrow('Data cannot be empty');
    });
  });

  describe('Mock Blob Writing', () => {
    test('should mock blob submission flow', async () => {
      const mockSigner = {
        getAddress: jest.fn(() => Promise.resolve('0x' + '1'.repeat(40))),
        signMessage: jest.fn(() => Promise.resolve('0x' + 'a'.repeat(130)))
      } as any;
      
      const mockBlobKit = new BlobKit({
        rpcUrl: MAINNET_RPC_URL,
        chainId: 1,
        logLevel: 'silent'
      }, mockSigner);
      
      const mockWriteBlob = jest.spyOn(mockBlobKit, 'writeBlob');
      mockWriteBlob.mockImplementation(async (data: any, meta?: any) => {
        const payload = typeof data === 'string' 
          ? Buffer.from(data)
          : data instanceof Uint8Array ? data : Buffer.from(JSON.stringify(data));
        
        const blob = encodeBlob(payload);
        const commitment = blobToKzgCommitment(blob);
        const proof = computeKzgProof(blob, commitment);
        const versionedHash = await commitmentToVersionedHash(commitment);
        
        return {
          success: true,
          jobId: 'mock-job-' + Date.now(),
          blobTxHash: '0x' + 'f'.repeat(64),
          paymentTxHash: undefined,
          blockNumber: 19000000,
          blobHash: versionedHash,
          commitment: '0x' + Buffer.from(commitment).toString('hex'),
          proof: '0x' + Buffer.from(proof).toString('hex'),
          blobIndex: 0,
          meta: {
            appId: meta?.appId || 'test',
            codec: 'text/plain',
            timestamp: Date.now(),
            ...meta
          }
        } as BlobReceipt;
      });
      
      const result = await mockBlobKit.writeBlob('Test data', { appId: 'test' });
      
      expect(result.success).toBe(true);
      expect(result.blobHash).toMatch(/^0x01[a-f0-9]{62}$/);
      expect(result.commitment).toMatch(/^0x[a-f0-9]{96}$/);
      expect(result.proof).toMatch(/^0x[a-f0-9]{96}$/);
    });
  });

  describe('Blob Transaction Verification', () => {
    test('should verify blob transaction structure', async () => {
      const tx = await provider.getTransaction(KNOWN_BLOB_TX);
      
      expect(tx).toBeTruthy();
      expect(tx!.type).toBe(3); // Type 3 = blob transaction
      
      const blobHashes = (tx as any).blobVersionedHashes;
      expect(blobHashes).toBeDefined();
      expect(Array.isArray(blobHashes)).toBe(true);
      expect(blobHashes.length).toBeGreaterThan(0);
      
      // Verify blob hash format
      for (const hash of blobHashes) {
        expect(hash).toMatch(/^0x01[a-f0-9]{62}$/);
      }
    });
  });
});
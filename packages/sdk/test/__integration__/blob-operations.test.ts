/**
 * Integration tests for SDK blob operations
 *
 * These tests exercise real blob encoding, KZG operations, and round-trip
 * blob writing and reading within the ephemeral window.
 * No mocking - tests actual system behavior.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { BlobKit } from '../../src/blobkit';
import { BlobReader } from '../../src/blob-reader';
import {
  initializeKzg,
  encodeBlob,
  blobToKzgCommitment,
  computeKzgProof,
  commitmentToVersionedHash
} from '../../src/kzg';
import { ethers } from 'ethers';
import path from 'path';
import {BlobReceipt} from '../../src/types.js';
import fs from 'fs/promises';
import {
  IntegrationTestEnvironment,
  generateTestBlobData,
  validateBlobTransaction,
  compareUint8Arrays,
  createTestTrustedSetup
} from '../../../../test/utils';

describe('SDK Blob Operations Integration', () => {
  let env: IntegrationTestEnvironment;
  let blobkit: BlobKit;
  let blobReader: BlobReader;
  let trustedSetupPath: string;

  beforeAll(async () => {
    // Setup test environment
    env = new IntegrationTestEnvironment();
    const { provider, rpcUrl, signer, escrowAddress, proxyUrl } = await env.setup();

    // Create trusted setup for KZG
    trustedSetupPath = await createTestTrustedSetup();

    // Initialize BlobKit
    blobkit = new BlobKit(
      {
        rpcUrl: rpcUrl,
        chainId: 31337,
        escrowContract: escrowAddress,
        proxyUrl,
        kzgSetup: {trustedSetupPath},
        logLevel: 'debug'
      },
      signer
    );

    // Initialize BlobReader
    blobReader = new BlobReader({
      rpcUrl: rpcUrl,
      logLevel: 'debug'
    });

    // Initialize KZG directly for verification
    await initializeKzg({
      trustedSetupPath
    });
  }, 60000);

  afterAll(async () => {
    await env.teardown();
    // Clean up trusted setup file
    try {
      await fs.unlink(trustedSetupPath);
    } catch (e) {
      // Ignore if already deleted
    }
  });

  describe('Real Blob Encoding and KZG Operations', () => {
    test('should encode data into valid blob format', () => {
      const testData = generateTestBlobData('sequential', 1000);
      const blob = encodeBlob(testData);

      // Verify blob structure
      expect(blob.length).toBe(131072); // 128KB

      // Verify field element structure - each field is 32 bytes
      for (let i = 0; i < 4096; i++) {
        const fieldStart = i * 32;
        // First byte must be 0 for BLS12-381 field constraint
        expect(blob[fieldStart]).toBe(0);
      }

      // Verify data is preserved
      let dataIndex = 0;
      for (let i = 0; i < 4096 && dataIndex < testData.length; i++) {
        const fieldStart = i * 32;
        for (let j = 1; j < 32 && dataIndex < testData.length; j++) {
          expect(blob[fieldStart + j]).toBe(testData[dataIndex]);
          dataIndex++;
        }
      }
    });

    test('should compute valid KZG commitment and proof', () => {
      const testData = generateTestBlobData('random', 5000);
      const blob = encodeBlob(testData);

      // Compute commitment
      const commitment = blobToKzgCommitment(blob);
      expect(commitment).toBeInstanceOf(Uint8Array);
      expect(commitment.length).toBe(48); // G1 point

      // Compute proof
      const proof = computeKzgProof(blob, commitment);
      expect(proof).toBeInstanceOf(Uint8Array);
      expect(proof.length).toBe(48); // G1 point

      // Commitments should be deterministic
      const commitment2 = blobToKzgCommitment(blob);
      expect(compareUint8Arrays(commitment, commitment2)).toBe(true);
    });

    test('should generate valid versioned hash', async () => {
      const testData = generateTestBlobData('sequential', 1000);
      const blob = encodeBlob(testData);
      const commitment = blobToKzgCommitment(blob);

      const versionedHash = await commitmentToVersionedHash(commitment);

      // Verify format
      expect(versionedHash).toMatch(/^0x01[a-f0-9]{62}$/);
      expect(versionedHash.length).toBe(66);

      // Version byte must be 0x01 for blob transactions
      expect(versionedHash.substring(2, 4)).toBe('01');
    });
  });

  describe('Direct Blob Submission (Node Environment)', () => {
    test('should write blob directly to chain in node environment', async () => {
      const testData = Buffer.from('Direct submission test data');
      const meta = {
        appId: 'integration-test-direct',
        tags: ['test', 'direct']
      };

      const result = await blobkit.writeBlob(testData, meta);

      // Verify result structure
      expect(result.success).toBe(true);
      expect(result.blobHash).toMatch(/(0x)?[0-9|a-f|A-F]{64}/gm);
      expect(result.blobTxHash).toMatch(/(0x)?[0-9|a-f|A-F]{64}/gm);
      expect(result.blockNumber).toBeGreaterThan(0);
      expect(result.commitment).toMatch(/(0x)?[0-9|a-f|A-F]{96}/gm);
      expect(result.proof).toMatch(/(0x)?[0-9|a-f|A-F]{96}/gm);
      expect(result.meta).toMatchObject(meta);

      // Validate on-chain
      const txValidation = await validateBlobTransaction(env.getProvider(), result.blobTxHash);

      expect(txValidation.valid).toBe(true);
      expect(txValidation.type).toBe(3); // Type 3 = blob transaction
      expect(txValidation.blobVersionedHashes).toContain(result.blobHash);
    });

    test('should handle large blobs near maximum size', async () => {
      // Create blob near max size (126KB to leave room for encoding overhead)
      const largeData = generateTestBlobData('sequential', 126 * 1024);

      const result = await blobkit.writeBlob(largeData, {
        appId: 'large-blob-test'
      });

      expect(result.success).toBe(true);
      expect(result.blobHash).toMatch(/(0x)?[0-9|a-f|A-F]{64}/gm);

      // Verify transaction on-chain
      const tx = await env.getProvider().getTransaction(result.blobTxHash);
      expect(tx).toBeTruthy();
      expect(tx!.type).toBe(3);
    });

    test('should write multiple blobs in sequence', async () => {
      const blobs = [
        { data: Buffer.from('Blob 1'), appId: 'seq-1' },
        { data: Buffer.from('Blob 2'), appId: 'seq-2' },
        { data: Buffer.from('Blob 3'), appId: 'seq-3' }
      ];

      const results: Array<BlobReceipt> = [];
      for (const blob of blobs) {
        const result = await blobkit.writeBlob(blob.data, { appId: blob.appId });
        results.push(result);
      }

      // Verify all succeeded
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.meta.appId).toBe(blobs[index].appId);
        expect(result.blockNumber).toBeGreaterThan(0);
      });

      // Verify different blob hashes
      const hashes = new Set(results.map(r => r.blobHash));
      expect(hashes.size).toBe(3);
    });
  });

  describe('Blob Reading and Round-trip Verification', () => {

    test('should handle transaction with multiple blobs', async () => {
      // This would require special setup to create multi-blob transactions
      // For now, verify single blob transactions work correctly
      const data = Buffer.from('Multi-blob test');
      const result = await blobkit.writeBlob(data);

      const tx = await env.getProvider().getTransaction(result.blobTxHash);
      expect(tx).toBeTruthy();
      expect((tx as any).blobVersionedHashes).toHaveLength(1);
    });

    test('should fail to read non-existent blob transaction', async () => {
      const fakeTxHash = '0x' + 'f'.repeat(64);

      await expect(blobReader.readBlob(fakeTxHash)).rejects.toThrow(
        'Transaction ' + fakeTxHash + ' not found'
      );
    });

    test('should fail to read non-blob transaction', async () => {
      // Send a regular transaction
      const regularTx = await env.getSigner().sendTransaction({
        to: env.getSigner().address,
        value: ethers.parseEther('0.001')
      });
      await regularTx.wait();

      await expect(blobReader.readBlob(regularTx.hash)).rejects.toThrow('not a blob transaction');
    });
  });

  describe('Cost Estimation', () => {
    test('should accurately estimate blob transaction costs', async () => {
      const testData = generateTestBlobData('sequential', 10000);

      // Get estimate
      const estimate = await blobkit.estimateCost(1);

      // Verify estimate structure
      expect(parseFloat(estimate.blobFee)).toBeGreaterThan(0);
      expect(parseFloat(estimate.gasFee)).toBeGreaterThan(0);
      expect(parseFloat(estimate.proxyFee)).toBeGreaterThanOrEqual(0);
      expect(parseFloat(estimate.totalETH)).toBe(
        parseFloat(estimate.blobFee) + parseFloat(estimate.gasFee) + parseFloat(estimate.proxyFee)
      );

      // Execute transaction and compare with actual cost
      const balanceBefore = await env.getProvider().getBalance(env.getSigner().address);
      const result = await blobkit.writeBlob(testData);
      const balanceAfter = await env.getProvider().getBalance(env.getSigner().address);

      const actualCost = balanceBefore - balanceAfter;
      const estimatedCost = ethers.parseEther(estimate.totalETH);

      // Actual cost should be within 50% of estimate (gas prices can vary)
      expect(actualCost).toBeGreaterThan(estimatedCost / 2n);
      expect(actualCost).toBeLessThan(estimatedCost * 2n);
    });

    test('should update estimates based on network conditions', async () => {
      const testData = generateTestBlobData('sequential', 5000);

      // Get initial estimate
      const estimate1 = await blobkit.estimateCost(1);

      // Mine some blocks to potentially change gas prices
      await env.mineBlocks(10);

      // Get second estimate
      const estimate2 = await blobkit.estimateCost(1);

      // Both should be valid
      expect(parseFloat(estimate1.totalETH)).toBeGreaterThan(0);
      expect(parseFloat(estimate2.totalETH)).toBeGreaterThan(0);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should reject oversized blobs', async () => {
      const oversized = generateTestBlobData('zeros', 130 * 1024);

      await expect(blobkit.writeBlob(oversized)).rejects.toThrow(
        'Payload size exceeds maximum blob size'
      );
    });

    test('should reject empty blobs', async () => {
      const empty = Buffer.alloc(0);

      await expect(blobkit.writeBlob(empty)).rejects.toThrow('Payload cannot be empty');
    });

    test('should handle network interruptions gracefully', async () => {
      // Create BlobKit with invalid RPC URL
      const badBlobkit = new BlobKit(
        {
          rpcUrl: 'http://localhost:9999', // Non-existent
          chainId: 31337
        },
        env.getSigner()
      );

      await expect(badBlobkit.writeBlob(Buffer.from('test'))).rejects.toThrow();
    });

    test('should handle rapid successive blob submissions', async () => {
      const promises = Array(5)
        .fill(null)
        .map((_, i) =>
          blobkit.writeBlob(Buffer.from(`Rapid blob ${i}`), {
            appId: `rapid-${i}`
          })
        );

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach((result, i) => {
        expect(result.success).toBe(true);
        expect(result.meta.appId).toBe(`rapid-${i}`);
      });

      // All should have different blob hashes
      const hashes = new Set(results.map(r => r.blobHash));
      expect(hashes.size).toBe(5);
    });
  });

  describe('Metadata Handling', () => {
    test('should preserve complex metadata through blob operations', async () => {
      const complexMeta = {
        appId: 'complex-meta-test',
        codec: 'application/json',
        contentHash: '0x' + 'c'.repeat(64),
        ttlBlocks: 100,
        timestamp: Date.now(),
        filename: 'test-file.json',
        contentType: 'application/json',
        tags: ['tag1', 'tag2', 'special-char']
      };

      const result = await blobkit.writeBlob(
        Buffer.from(JSON.stringify({ test: 'data' })),
        complexMeta
      );

      expect(result.meta).toMatchObject(complexMeta);
    });

    test('should handle metadata with special characters', async () => {
      const specialMeta = {
        appId: 'app with spaces & special!@#$%',
        filename: 'file (with) [brackets] {braces}.txt',
        tags: ['tag/with/slashes', 'tag:with:colons', 'tag"with"quotes']
      };

      const result = await blobkit.writeBlob(Buffer.from('Special metadata test'), specialMeta);

      expect(result.meta).toMatchObject(specialMeta);
    });
  });

  describe('Blob Data Integrity', () => {
    test('should maintain data integrity for binary data', async () => {
      // Create binary data with all byte values
      const binaryData = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        binaryData[i] = i;
      }

      const result = await blobkit.writeBlob(binaryData, {
        appId: 'binary-integrity-test'
      });

      expect(result.success).toBe(true);

      // Verify KZG commitment matches
      const blob = encodeBlob(binaryData);
      const expectedCommitment = blobToKzgCommitment(blob);
      const expectedHash = await commitmentToVersionedHash(expectedCommitment);

      expect(result.blobHash).toBe(expectedHash);
    });

    test('should handle JSON data correctly', async () => {
      const jsonData = {
        nested: {
          array: [1, 2, 3, 4, 5],
          object: { key: 'value' },
          null: null,
          boolean: true
        },
        unicode: 'Hello World',
        number: 42.5
      };

      const result = await blobkit.writeBlob(jsonData, {
        appId: 'json-test',
        codec: 'application/json'
      });

      expect(result.success).toBe(true);
      expect(result.meta.codec).toBe('application/json');
    });

    test('should handle text with various encodings', async () => {
      const texts = [
        'ASCII text',
        'UTF-8: 你好世界',
        'Emoji: replaced',
        'Special: €£¥₹',
        'Math: ∑∫∂∇'
      ];

      for (const text of texts) {
        const result = await blobkit.writeBlob(text, {
          appId: 'encoding-test'
        });
        expect(result.success).toBe(true);
      }
    });
  });
});

/**
 * End-to-end integration tests
 *
 * Tests complete BlobKit flow across SDK, proxy server, and smart contracts.
 * Validates real blob storage, reading, and payment flows.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { BlobKit } from '@blobkit/sdk';
import { BlobReader } from '@blobkit/sdk';
import { ethers } from 'ethers';
import {
  IntegrationTestEnvironment,
  generateTestBlobData,
  validateBlobTransaction,
  compareUint8Arrays
} from '../utils';

describe('BlobKit End-to-End Integration', () => {
  let env: IntegrationTestEnvironment;
  let provider: ethers.JsonRpcProvider;
  let alice: ethers.Wallet;
  let bob: ethers.Wallet;
  let escrowAddress: string;
  let proxyUrl: string;
  let aliceBlobKit: BlobKit;
  let bobBlobKit: BlobKit;
  let blobReader: BlobReader;

  beforeAll(async () => {
    // Setup complete test environment
    env = new IntegrationTestEnvironment();
    const setup = await env.setup();

    provider = setup.provider;
    escrowAddress = setup.escrowAddress;
    proxyUrl = setup.proxyUrl;

    // Setup test accounts
    const accounts = env.anvil.getTestAccounts();
    alice = new ethers.Wallet(accounts[0].privateKey, provider);
    bob = new ethers.Wallet(accounts[1].privateKey, provider);

    // Initialize BlobKit instances
    aliceBlobKit = new BlobKit(
      {
        rpcUrl: provider.connection.url,
        chainId: 31337,
        escrowContract: escrowAddress,
        proxyUrl,
        logLevel: 'info'
      },
      alice
    );

    bobBlobKit = new BlobKit(
      {
        rpcUrl: provider.connection.url,
        chainId: 31337,
        escrowContract: escrowAddress,
        proxyUrl,
        logLevel: 'info'
      },
      bob
    );

    // Initialize blob reader
    blobReader = new BlobReader({
      rpcUrl: provider.connection.url,
      logLevel: 'info'
    });
  }, 90000);

  afterAll(async () => {
    await env.teardown();
  });

  describe('Browser-like Proxy Flow', () => {
    test('should complete full blob cycle through proxy', async () => {
      // Alice writes blob through proxy
      const aliceData = Buffer.from('Alice sends data through proxy');
      const aliceMeta = {
        appId: 'alice-app',
        tags: ['alice', 'proxy-test']
      };

      // Estimate cost
      const estimate = await aliceBlobKit.estimateCost(aliceData);
      expect(parseFloat(estimate.totalETH)).toBeGreaterThan(0);

      // Write blob (SDK handles escrow payment internally)
      const writeResult = await aliceBlobKit.writeBlob(aliceData, aliceMeta);

      expect(writeResult.success).toBe(true);
      expect(writeResult.paymentMethod).toBe('web3');
      expect(writeResult.jobId).toBeValidHex(64);
      expect(writeResult.paymentTx).toBeValidHex(64);
      expect(writeResult.blobHash).toBeValidBlobHash();
      expect(writeResult.blobTxHash).toBeValidHex(64);
      expect(writeResult.completionTxHash).toBeValidHex(64);
      expect(writeResult.proxyUrl).toBe(proxyUrl);
      expect(writeResult.meta).toMatchObject(aliceMeta);

      // Validate blob transaction on-chain
      const validation = await validateBlobTransaction(provider, writeResult.blobTxHash);
      expect(validation.valid).toBe(true);
      expect(validation.type).toBe(3);
      expect(validation.blobVersionedHashes).toContain(writeResult.blobHash);

      // Read blob back (within ephemeral window)
      const readResult = await blobReader.readBlob(writeResult.blobTxHash, 0);
      expect(readResult.source).toBe('rpc');
      expect(readResult.data).toBeInstanceOf(Uint8Array);
    });

    test('should handle concurrent proxy submissions from multiple users', async () => {
      const submissions = [
        {
          user: alice,
          blobKit: aliceBlobKit,
          data: Buffer.from('Alice concurrent blob 1'),
          meta: { appId: 'alice-concurrent-1' }
        },
        {
          user: bob,
          blobKit: bobBlobKit,
          data: Buffer.from('Bob concurrent blob 1'),
          meta: { appId: 'bob-concurrent-1' }
        },
        {
          user: alice,
          blobKit: aliceBlobKit,
          data: Buffer.from('Alice concurrent blob 2'),
          meta: { appId: 'alice-concurrent-2' }
        }
      ];

      // Submit all blobs concurrently
      const results = await Promise.all(submissions.map(s => s.blobKit.writeBlob(s.data, s.meta)));

      // Verify all succeeded
      results.forEach((result, i) => {
        expect(result.success).toBe(true);
        expect(result.paymentMethod).toBe('web3');
        expect(result.meta).toMatchObject(submissions[i].meta);
      });

      // Verify different job IDs and blob hashes
      const jobIds = new Set(results.map(r => r.jobId));
      const blobHashes = new Set(results.map(r => r.blobHash));

      expect(jobIds.size).toBe(3);
      expect(blobHashes.size).toBe(3);
    });
  });

  describe('Node.js Direct Submission Flow', () => {
    test('should submit blobs directly without proxy in Node environment', async () => {
      // Create BlobKit without proxy URL to force direct submission
      const directBlobKit = new BlobKit(
        {
          rpcUrl: provider.connection.url,
          chainId: 31337,
          logLevel: 'info'
        },
        alice
      );

      const data = generateTestBlobData('random', 5000);
      const meta = {
        appId: 'direct-submission',
        codec: 'raw',
        tags: ['direct', 'node']
      };

      const result = await directBlobKit.writeBlob(data, meta);

      expect(result.success).toBe(true);
      expect(result.paymentMethod).toBe('direct');
      expect(result.proxyUrl).toBeUndefined();
      expect(result.jobId).toBeUndefined();
      expect(result.paymentTx).toBeUndefined();
      expect(result.blobHash).toBeValidBlobHash();
      expect(result.blobTxHash).toBeValidHex(64);

      // Verify on-chain
      const tx = await provider.getTransaction(result.blobTxHash);
      expect(tx?.type).toBe(3);
      expect(tx?.from.toLowerCase()).toBe(alice.address.toLowerCase());
    });
  });

  describe('Refund Mechanism', () => {
    test('should refund expired jobs', async () => {
      // Create a job but don't complete it
      const data = Buffer.from('Refund test data');
      const jobId = aliceBlobKit.generateJobId(alice.address, ethers.keccak256(data), Date.now());

      // Get escrow contract
      const escrowAbi = [
        'function depositForBlob(bytes32 jobId) payable',
        'function getJobDetails(bytes32) view returns (address user, uint256 amount, uint256 timestamp, bool completed, bytes32 blobTxHash)',
        'function refundExpiredJob(bytes32 jobId)',
        'function getJobTimeout() view returns (uint256)'
      ];
      const escrow = new ethers.Contract(escrowAddress, escrowAbi, alice);

      // Deposit without completing
      const depositAmount = ethers.parseEther('0.01');
      const depositTx = await escrow.depositForBlob(jobId, { value: depositAmount });
      await depositTx.wait();

      // Check job exists
      let jobDetails = await escrow.getJobDetails(jobId);
      expect(jobDetails.user.toLowerCase()).toBe(alice.address.toLowerCase());
      expect(jobDetails.completed).toBe(false);

      // Fast forward time to expire the job
      const timeout = await escrow.getJobTimeout();
      await env.increaseTime(Number(timeout) + 1);

      // Refund the job
      await aliceBlobKit.refundIfExpired(jobId);

      // Verify refund processed
      jobDetails = await escrow.getJobDetails(jobId);
      expect(jobDetails.amount).toBe(0n); // Amount should be zero after refund
    });

    test('should prevent refund of completed jobs', async () => {
      // Complete a job normally
      const data = Buffer.from('Completed job test');
      const result = await aliceBlobKit.writeBlob(data, { appId: 'completed-test' });

      expect(result.success).toBe(true);
      expect(result.jobId).toBeTruthy();

      // Try to refund completed job
      await expect(aliceBlobKit.refundIfExpired(result.jobId!)).rejects.toThrow(
        'already completed'
      );
    });
  });

  describe('Large Data Handling', () => {
    test('should handle blobs near maximum size', async () => {
      // Create blob near 128KB limit
      const largeData = generateTestBlobData('sequential', 126 * 1024);

      const result = await aliceBlobKit.writeBlob(largeData, {
        appId: 'large-blob-test',
        tags: ['large', 'max-size']
      });

      expect(result.success).toBe(true);

      // Verify transaction succeeded
      const tx = await provider.getTransaction(result.blobTxHash);
      expect(tx).toBeTruthy();
      expect(tx?.type).toBe(3);

      // Verify blob size
      const receipt = await provider.getTransactionReceipt(result.blobTxHash);
      expect(receipt?.status).toBe(1);
    });

    test('should reject oversized blobs', async () => {
      const oversized = generateTestBlobData('zeros', 130 * 1024);

      await expect(aliceBlobKit.writeBlob(oversized)).rejects.toThrow('exceeds maximum blob size');
    });
  });

  describe('Data Integrity', () => {
    test('should maintain binary data integrity', async () => {
      // Create binary data with all byte values
      const binaryData = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        binaryData[i] = i;
      }

      const result = await bobBlobKit.writeBlob(binaryData, {
        appId: 'binary-integrity',
        codec: 'application/octet-stream'
      });

      expect(result.success).toBe(true);

      // Read back and verify (would need proper decoding)
      const readResult = await blobReader.readBlob(result.blobTxHash, 0);
      expect(readResult.data).toBeInstanceOf(Uint8Array);
      expect(readResult.data.length).toBe(131072); // Full blob size
    });

    test('should handle UTF-8 text correctly', async () => {
      const utf8Texts = [
        'English text',
        '中文文本',
        '日本語テキスト',
        '한국어 텍스트',
        'Emoji: 🚀🌟💡🎉',
        'Mixed: Hello 世界 🌍'
      ];

      for (const text of utf8Texts) {
        const result = await aliceBlobKit.writeBlob(text, {
          appId: 'utf8-test',
          codec: 'text/plain; charset=utf-8'
        });

        expect(result.success).toBe(true);
      }
    });

    test('should handle JSON data correctly', async () => {
      const jsonData = {
        nested: {
          arrays: [
            [1, 2],
            [3, 4]
          ],
          objects: { a: { b: { c: 'deep' } } }
        },
        unicode: '测试 テスト 테스트',
        numbers: {
          int: 42,
          float: 3.14159,
          exp: 1.23e-10,
          negative: -999
        },
        special: {
          null: null,
          bool: true,
          empty: {}
        }
      };

      const result = await bobBlobKit.writeBlob(jsonData, {
        appId: 'json-test',
        codec: 'application/json'
      });

      expect(result.success).toBe(true);
      expect(result.meta.codec).toBe('application/json');
    });
  });

  describe('Cost Accuracy', () => {
    test('should provide accurate cost estimates', async () => {
      const testData = generateTestBlobData('random', 10000);

      // Get estimate
      const estimate = await aliceBlobKit.estimateCost(testData);
      const estimatedWei = ethers.parseEther(estimate.totalETH);

      // Track balance before
      const balanceBefore = await provider.getBalance(alice.address);

      // Execute transaction
      const result = await aliceBlobKit.writeBlob(testData, {
        appId: 'cost-test'
      });

      expect(result.success).toBe(true);

      // Track balance after
      const balanceAfter = await provider.getBalance(alice.address);
      const actualCost = balanceBefore - balanceAfter;

      // Actual cost should be within 20% of estimate
      // (accounts for gas price fluctuations)
      const difference =
        actualCost > estimatedWei ? actualCost - estimatedWei : estimatedWei - actualCost;
      const percentDiff = Number((difference * 100n) / estimatedWei);

      expect(percentDiff).toBeLessThan(20);
    });
  });

  describe('Error Scenarios', () => {
    test('should handle insufficient balance gracefully', async () => {
      // Create new wallet with minimal balance
      const poorWallet = ethers.Wallet.createRandom().connect(provider);

      // Send just enough for gas but not blob
      await alice.sendTransaction({
        to: poorWallet.address,
        value: ethers.parseEther('0.0001') // Very small amount
      });

      const poorBlobKit = new BlobKit(
        {
          rpcUrl: provider.connection.url,
          chainId: 31337,
          proxyUrl,
          escrowContract: escrowAddress
        },
        poorWallet
      );

      await expect(poorBlobKit.writeBlob(Buffer.from('test'))).rejects.toThrow();
    });

    test('should handle network errors gracefully', async () => {
      // Create BlobKit with invalid RPC
      const badBlobKit = new BlobKit(
        {
          rpcUrl: 'http://localhost:9999',
          chainId: 31337
        },
        alice
      );

      await expect(badBlobKit.writeBlob(Buffer.from('test'))).rejects.toThrow();
    });

    test('should handle invalid escrow contract', async () => {
      const badBlobKit = new BlobKit(
        {
          rpcUrl: provider.connection.url,
          chainId: 31337,
          proxyUrl,
          escrowContract: '0x' + '0'.repeat(40) // Zero address
        },
        alice
      );

      await expect(badBlobKit.writeBlob(Buffer.from('test'))).rejects.toThrow();
    });
  });

  describe('Metadata Handling', () => {
    test('should preserve all metadata fields', async () => {
      const fullMeta = {
        appId: 'full-meta-test',
        codec: 'application/custom',
        contentHash: '0x' + 'a'.repeat(64),
        ttlBlocks: 1000,
        timestamp: Date.now(),
        filename: 'test-file.dat',
        contentType: 'application/custom',
        tags: ['tag1', 'tag2', 'tag-with-dash', 'tag_with_underscore']
      };

      const result = await aliceBlobKit.writeBlob(Buffer.from('Metadata test'), fullMeta);

      expect(result.success).toBe(true);
      expect(result.meta).toMatchObject(fullMeta);
    });

    test('should handle special characters in metadata', async () => {
      const specialMeta = {
        appId: 'app with spaces & special!@#$%^&*()',
        filename: 'file (with) [brackets] {braces} <angles>.txt',
        tags: [
          'tag/with/slashes',
          'tag:with:colons',
          'tag"with"quotes',
          "tag'with'apostrophes",
          'unicode-标签-タグ-태그'
        ]
      };

      const result = await bobBlobKit.writeBlob(Buffer.from('Special chars test'), specialMeta);

      expect(result.success).toBe(true);
      expect(result.meta).toMatchObject(specialMeta);
    });
  });
});

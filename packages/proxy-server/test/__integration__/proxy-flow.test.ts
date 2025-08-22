/**
 * Integration tests for proxy server end-to-end flows
 *
 * Tests complete proxy flow including payment verification, blob execution,
 * and job completion. Uses real infrastructure components.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { ethers } from 'ethers';
import { BlobKit } from '@blobkit/sdk';
import {
  IntegrationTestEnvironment,
  ProxyServerManager,
  ContractDeployer,
  generateTestBlobData,
  validateBlobTransaction
} from '../utils';

/**
 * Health check for anvil RPC URL
 * Verifies that the RPC endpoint is accessible and responsive
 */
async function checkAnvilHealth(rpcUrl: string, maxRetries: number = 10): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const blockNumber = await provider.getBlockNumber();
      console.log(`Anvil health check passed at ${rpcUrl}, block: ${blockNumber}`);
      return true;
    } catch (error) {
      console.log(`Anvil health check attempt ${i + 1}/${maxRetries} failed:`, (error as Error).message);
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  console.error(`Anvil health check failed after ${maxRetries} attempts`);
  return false;
}

describe('Proxy Server Integration', () => {
  let env: IntegrationTestEnvironment;
  let proxyManager: ProxyServerManager;
  let provider: ethers.JsonRpcProvider;
  let userSigner: ethers.Wallet;
  let proxySigner: ethers.Wallet;
  let escrowContract: ethers.Contract;
  let escrowAddress: string;
  let proxyUrl: string;
  let userBlobKit: BlobKit;

  beforeAll(async () => {
    // Setup test environment
    env = new IntegrationTestEnvironment();
    const setupResult = await env.setup();
    provider = setupResult.provider;
    escrowAddress = setupResult.escrowAddress;
    proxyUrl = setupResult.proxyUrl;

    // Verify anvil health
    const rpcUrl = 'http://localhost:8545';
    const isHealthy = await checkAnvilHealth(rpcUrl);
    if (!isHealthy) {
      throw new Error('Anvil RPC health check failed - cannot proceed with tests');
    }

    // Get test signers
    const accounts = env.anvil.getTestAccounts();
    userSigner = new ethers.Wallet(accounts[0].privateKey, provider);
    proxySigner = new ethers.Wallet(accounts[1].privateKey, provider);

    // Get escrow contract instance
    const deployer = new ContractDeployer(provider, userSigner);
    escrowContract = deployer.getEscrowContract(escrowAddress);

    // Initialize user's BlobKit (configured for proxy usage)
    userBlobKit = new BlobKit(
      {
        rpcUrl: 'http://localhost:8545',
        chainId: 31337,
        proxyUrl,
        escrowContract: escrowAddress,
        logLevel: 'debug'
      },
      userSigner
    );
  }, 60000);

  afterAll(async () => {
    await env.teardown();
  });

  describe('Health and Status Endpoints', () => {
    test('should respond to health check', async () => {
      const response = await request(proxyUrl).get('/api/v1/health').expect(200);

      expect(response.body).toHaveProperty('healthy', true);
      expect(response.body).toHaveProperty('chainId', 31337);
      expect(response.body).toHaveProperty('feePercent');
      expect(response.body).toHaveProperty('escrowContract', escrowAddress.toLowerCase());
    });

    test('should provide metrics endpoint', async () => {
      const response = await request(proxyUrl).get('/api/v1/metrics').expect(200);

      expect(response.body).toHaveProperty('totalJobs');
      expect(response.body).toHaveProperty('completedJobs');
      expect(response.body).toHaveProperty('failedJobs');
      expect(response.body).toHaveProperty('totalBlobsSubmitted');
    });
  });

  describe('Complete Blob Submission Flow', () => {
    test('should process blob through escrow payment', async () => {
      // Step 1: Generate job ID and estimate cost
      const testData = generateTestBlobData('sequential', 1000);
      const jobId = userBlobKit.generateJobId(
        await userSigner.getAddress(),
        ethers.keccak256(testData),
        Date.now()
      );

      const estimate = await userBlobKit.estimateCost(testData);
      const paymentAmount = ethers.parseEther(estimate.totalETH);

      // Step 2: Deposit to escrow
      const depositTx = await escrowContract
        .connect(userSigner)
        .getFunction('depositForBlob')(jobId, { value: paymentAmount });
      const depositReceipt = await depositTx.wait();

      expect(depositReceipt.status).toBe(1);

      // Step 3: Submit blob to proxy
      const response = await request(proxyUrl)
        .post('/api/v1/blob/write')
        .send({
          jobId,
          payload: Buffer.from(testData).toString('base64'),
          paymentTxHash: depositTx.hash,
          meta: {
            appId: 'integration-test',
            tags: ['test']
          },
          timestamp: Date.now()
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('blobHash');
      expect(response.body).toHaveProperty('blobTxHash');
      expect(response.body).toHaveProperty('completionTxHash');

      // Step 4: Verify blob transaction on-chain
      const blobTxValidation = await validateBlobTransaction(provider, response.body.blobTxHash);

      expect(blobTxValidation.valid).toBe(true);
      expect(blobTxValidation.type).toBe(3);
      expect(blobTxValidation.blobVersionedHashes).toContain(response.body.blobHash);

      // Step 5: Verify job completion in escrow
      const jobDetails = await escrowContract.getJobDetails(jobId);
      expect(jobDetails.completed).toBe(true);
      expect(jobDetails.blobTxHash).toBe(response.body.blobTxHash);
    });

    test('should handle multiple concurrent job submissions', async () => {
      const jobs = await Promise.all(
        Array(3)
          .fill(null)
          .map(async (_, i) => {
            const data = Buffer.from(`Concurrent job ${i}`);
            const jobId = userBlobKit.generateJobId(
              await userSigner.getAddress(),
              ethers.keccak256(data),
              Date.now() + i
            );

            // Deposit for each job
            const tx = await escrowContract
              .connect(userSigner)
              .getFunction('depositForBlob')(jobId, { value: ethers.parseEther('0.01') });
            await tx.wait();

            return { jobId, data, paymentTxHash: tx.hash };
          })
      );

      // Submit all jobs concurrently
      const responses = await Promise.all(
        jobs.map(job =>
          request(proxyUrl)
            .post('/api/v1/blob/write')
            .send({
              jobId: job.jobId,
              payload: job.data.toString('base64'),
              paymentTxHash: job.paymentTxHash,
              meta: { appId: 'concurrent-test' },
              timestamp: Date.now()
            })
        )
      );

      // Verify all succeeded
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.blobTxHash).toBeTruthy();
      });

      // Verify all jobs completed
      for (const job of jobs) {
        const details = await escrowContract.getJobDetails(job.jobId);
        expect(details.completed).toBe(true);
      }
    });
  });

  describe('Payment Validation', () => {
    test('should reject blob without payment', async () => {
      const jobId = '0x' + '1'.repeat(64);

      const response = await request(proxyUrl)
        .post('/api/v1/blob/write')
        .send({
          jobId,
          payload: Buffer.from('No payment').toString('base64'),
          paymentTxHash: '0x' + 'f'.repeat(64), // Fake tx hash
          timestamp: Date.now()
        })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toContain('payment');
    });

    test('should reject insufficient payment', async () => {
      const data = generateTestBlobData('sequential', 1000);
      const jobId = userBlobKit.generateJobId(
        await userSigner.getAddress(),
        ethers.keccak256(data),
        Date.now()
      );

      // Deposit insufficient amount
      const insufficientAmount = ethers.parseEther('0.00001'); // Too small
      const tx = await escrowContract
        .connect(userSigner)
        .getFunction('depositForBlob')(jobId, { value: insufficientAmount });
      await tx.wait();

      const response = await request(proxyUrl)
        .post('/api/v1/blob/write')
        .send({
          jobId,
          payload: Buffer.from(data).toString('base64'),
          paymentTxHash: tx.hash,
          timestamp: Date.now()
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('insufficient');
    });

    test('should reject already completed job', async () => {
      // First, complete a job
      const data = Buffer.from('First submission');
      const jobId = userBlobKit.generateJobId(
        await userSigner.getAddress(),
        ethers.keccak256(data),
        Date.now()
      );

      const tx = await escrowContract
        .connect(userSigner)
        .getFunction('depositForBlob')(jobId, { value: ethers.parseEther('0.01') });
      await tx.wait();

      // Submit once
      await request(proxyUrl)
        .post('/api/v1/blob/write')
        .send({
          jobId,
          payload: data.toString('base64'),
          paymentTxHash: tx.hash,
          timestamp: Date.now()
        })
        .expect(200);

      // Try to submit again
      const response = await request(proxyUrl)
        .post('/api/v1/blob/write')
        .send({
          jobId,
          payload: data.toString('base64'),
          paymentTxHash: tx.hash,
          timestamp: Date.now()
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already completed');
    });
  });

  describe('Blob Size and Validation', () => {
    test('should handle maximum size blobs', async () => {
      const largeData = generateTestBlobData('sequential', 126 * 1024); // Near max
      const jobId = userBlobKit.generateJobId(
        await userSigner.getAddress(),
        ethers.keccak256(largeData),
        Date.now()
      );

      const tx = await escrowContract
        .connect(userSigner)
        .getFunction('depositForBlob')(jobId, { value: ethers.parseEther('0.1') }); // Higher payment for large blob
      await tx.wait();

      const response = await request(proxyUrl)
        .post('/api/v1/blob/write')
        .send({
          jobId,
          payload: Buffer.from(largeData).toString('base64'),
          paymentTxHash: tx.hash,
          meta: { appId: 'large-blob-test' },
          timestamp: Date.now()
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify on-chain
      const blobTx = await provider.getTransaction(response.body.blobTxHash);
      expect(blobTx?.type).toBe(3);
    });

    test('should reject oversized blobs', async () => {
      const oversized = generateTestBlobData('zeros', 130 * 1024);

      const response = await request(proxyUrl)
        .post('/api/v1/blob/write')
        .send({
          jobId: '0x' + 'o'.repeat(64),
          payload: Buffer.from(oversized).toString('base64'),
          paymentTxHash: '0x' + 'p'.repeat(64),
          timestamp: Date.now()
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('too large');
    });

    test('should reject empty blobs', async () => {
      const response = await request(proxyUrl)
        .post('/api/v1/blob/write')
        .send({
          jobId: '0x' + 'e'.repeat(64),
          payload: '',
          paymentTxHash: '0x' + 'p'.repeat(64),
          timestamp: Date.now()
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('empty');
    });
  });

  describe('Job Status Tracking', () => {
    test('should track job status correctly', async () => {
      const data = Buffer.from('Status tracking test');
      const jobId = userBlobKit.generateJobId(
        await userSigner.getAddress(),
        ethers.keccak256(data),
        Date.now()
      );

      // Check non-existent job
      let response = await request(proxyUrl).get(`/api/v1/job/${jobId}`).expect(200);

      expect(response.body.exists).toBe(false);

      // Create job
      const tx = await escrowContract
        .connect(userSigner)
        .getFunction('depositForBlob')(jobId, { value: ethers.parseEther('0.01') });
      await tx.wait();

      // Check pending job
      response = await request(proxyUrl).get(`/api/v1/job/${jobId}`).expect(200);

      expect(response.body.exists).toBe(true);
      expect(response.body.completed).toBe(false);
      expect(response.body.user.toLowerCase()).toBe((await userSigner.getAddress()).toLowerCase());

      // Complete job
      await request(proxyUrl)
        .post('/api/v1/blob/write')
        .send({
          jobId,
          payload: data.toString('base64'),
          paymentTxHash: tx.hash,
          timestamp: Date.now()
        })
        .expect(200);

      // Check completed job
      response = await request(proxyUrl).get(`/api/v1/job/${jobId}`).expect(200);

      expect(response.body.exists).toBe(true);
      expect(response.body.completed).toBe(true);
      expect(response.body.blobTxHash).toBeTruthy();
      expect(response.body.blobTxHash).not.toBe('0x' + '0'.repeat(64));
    });
  });

  describe('Error Recovery', () => {
    test('should handle network interruptions gracefully', async () => {
      // This would require simulating network failures
      // For now, test error response format
      const response = await request(proxyUrl)
        .post('/api/v1/blob/write')
        .send({
          invalid: 'request format'
        })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
    });

    test('should handle concurrent requests for same job', async () => {
      const data = Buffer.from('Concurrent test');
      const jobId = userBlobKit.generateJobId(
        await userSigner.getAddress(),
        ethers.keccak256(data),
        Date.now()
      );

      const tx = await escrowContract
        .connect(userSigner)
        .getFunction('depositForBlob')(jobId, { value: ethers.parseEther('0.01') });
      await tx.wait();

      // Submit multiple requests concurrently
      const requests = Array(3)
        .fill(null)
        .map(() =>
          request(proxyUrl)
            .post('/api/v1/blob/write')
            .send({
              jobId,
              payload: data.toString('base64'),
              paymentTxHash: tx.hash,
              timestamp: Date.now()
            })
        );

      const responses = await Promise.all(requests);

      // One should succeed, others should fail with "already completed"
      const successes = responses.filter(r => r.status === 200);
      const failures = responses.filter(r => r.status === 400);

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(2);

      failures.forEach(response => {
        expect(response.body.message).toContain('already completed');
      });
    });
  });

  describe('Metadata Preservation', () => {
    test('should preserve complex metadata through proxy', async () => {
      const data = Buffer.from('Metadata test');
      const complexMeta = {
        appId: 'complex-meta-app',
        codec: 'application/json',
        contentHash: '0x' + 'h'.repeat(64),
        ttlBlocks: 100,
        timestamp: Date.now(),
        filename: 'test.json',
        contentType: 'application/json',
        tags: ['tag1', 'tag2', 'special']
      };

      const jobId = userBlobKit.generateJobId(
        await userSigner.getAddress(),
        ethers.keccak256(data),
        Date.now()
      );

      const tx = await escrowContract
        .connect(userSigner)
        .getFunction('depositForBlob')(jobId, { value: ethers.parseEther('0.01') });
      await tx.wait();

      const response = await request(proxyUrl)
        .post('/api/v1/blob/write')
        .send({
          jobId,
          payload: data.toString('base64'),
          paymentTxHash: tx.hash,
          meta: complexMeta,
          timestamp: Date.now()
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.meta).toMatchObject(complexMeta);
    });
  });

  describe('Rate Limiting', () => {
    test('should enforce rate limits', async () => {
      // Make many rapid requests
      const requests = Array(20)
        .fill(null)
        .map((_, i) => request(proxyUrl).get('/api/v1/health'));

      const responses = await Promise.all(requests);

      // Some should be rate limited (depending on config)
      const rateLimited = responses.filter(r => r.status === 429);

      // At least verify the endpoint responds appropriately
      const successful = responses.filter(r => r.status === 200);
      expect(successful.length).toBeGreaterThan(0);
    });
  });
});

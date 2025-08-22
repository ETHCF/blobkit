/**
 * Test utilities for proxy server tests
 *
 * Provides mock factories, test fixtures, and helper functions
 * for both unit and integration tests.
 */

import { ethers } from 'ethers';
import type { Request, Response, NextFunction } from 'express';
import type { ProxyConfig, BlobWriteRequest, JobDetails } from '../src/types';

/**
 * Creates a mock Express request object
 */
export function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    query: {},
    params: {},
    headers: {},
    get: jest.fn((header: string) => ''),
    header: jest.fn((header: string) => ''),
    ip: '127.0.0.1',
    ips: ['127.0.0.1'],
    method: 'POST',
    url: '/api/v1/blob/write',
    path: '/api/v1/blob/write',
    originalUrl: '/api/v1/blob/write',
    ...overrides
  } as unknown as Request;
}

/**
 * Creates a mock Express response object
 */
export function createMockResponse(): Response {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
    locals: {}
  } as unknown as Response;

  return res;
}

/**
 * Creates a mock Express next function
 */
export function createMockNext(): NextFunction {
  return jest.fn() as unknown as NextFunction;
}

/**
 * Creates a valid proxy configuration for testing
 */
export function createTestProxyConfig(overrides: Partial<ProxyConfig> = {}): ProxyConfig {
  return {
    port: 3001,
    rpcUrl: 'http://localhost:8545',
    chainId: 31337,
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    escrowContract: '0x' + '5'.repeat(40),
    requestSigningSecret: 'test-secret-minimum-32-characters-long',
    kzgTrustedSetupPath: '/tmp/test-trusted-setup.txt',
    logLevel: 'silent',
    proxyFeePercent: 0,
    maxBlobSize: 131072,
    jobTimeoutSeconds: 300,
    rateLimitPerMinute: 10,
    rateLimitPerHour: 100,
    corsOrigin: '*',
    metricsEnabled: false,
    metricsPort: 9090,
    redisUrl: undefined,
    ...overrides
  };
}

/**
 * Creates a mock blob write request
 */
export function createMockBlobWriteRequest(
  overrides: Partial<BlobWriteRequest> = {}
): BlobWriteRequest {
  return {
    jobId: '0x' + 'a'.repeat(64),
    payload: Buffer.from('test payload').toString('base64'),
    meta: {
      appId: 'test-app',
      tags: ['test']
    },
    paymentTxHash: '0x' + 'b'.repeat(64),
    signature: '0x' + 'c'.repeat(130),
    timestamp: Date.now(),
    ...overrides
  };
}

/**
 * Creates mock job details from escrow contract
 */
export function createMockJobDetails(overrides: Partial<JobDetails> = {}): JobDetails {
  return {
    user: '0x' + '1'.repeat(40),
    amount: BigInt('1000000000000000000'), // 1 ETH
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
    completed: false,
    blobTxHash: '0x' + '0'.repeat(64),
    ...overrides
  };
}

/**
 * Creates a mock BlobKit SDK instance for proxy server tests
 */
export function createMockBlobKitSDK() {
  return {
    writeBlob: jest.fn().mockResolvedValue({
      success: true,
      blobHash: '0x01' + 'd'.repeat(62),
      blobTxHash: '0x' + 'e'.repeat(64),
      blockNumber: 12345,
      commitment: '0x' + 'f'.repeat(96),
      proof: '0x' + '1'.repeat(96),
      meta: { appId: 'test' }
    }),
    estimateCost: jest.fn().mockResolvedValue({
      blobFee: '0.0005',
      gasFee: '0.0003',
      proxyFee: '0.0000',
      totalETH: '0.0008'
    }),
    readBlob: jest.fn().mockResolvedValue({
      data: new Uint8Array([1, 2, 3]),
      blobTxHash: '0x' + 'e'.repeat(64),
      blobIndex: 0,
      source: 'rpc'
    })
  };
}

/**
 * Creates a mock payment verifier service
 */
export function createMockPaymentVerifier() {
  return {
    verifyPayment: jest.fn().mockResolvedValue({
      valid: true,
      amount: BigInt('1000000000000000000'),
      user: '0x' + '1'.repeat(40),
      timestamp: Date.now()
    }),
    getJobDetails: jest
      .fn()
      .mockImplementation((jobId: string) => Promise.resolve(createMockJobDetails())),
    completeJob: jest.fn().mockResolvedValue({
      hash: '0x' + '2'.repeat(64),
      success: true
    })
  };
}

/**
 * Creates a mock blob executor service
 */
export function createMockBlobExecutor() {
  return {
    executeBlob: jest.fn().mockResolvedValue({
      success: true,
      blobHash: '0x01' + '3'.repeat(62),
      blobTxHash: '0x' + '4'.repeat(64),
      blockNumber: 12346,
      commitment: '0x' + '5'.repeat(96),
      proof: '0x' + '6'.repeat(96)
    }),
    estimateCost: jest.fn().mockResolvedValue({
      blobFee: '0.0005',
      gasFee: '0.0003',
      totalETH: '0.0008'
    })
  };
}

/**
 * Creates a mock Redis client for testing
 */
export function createMockRedisClient() {
  const store = new Map<string, string>();

  return {
    get: jest.fn().mockImplementation((key: string) => Promise.resolve(store.get(key) || null)),
    set: jest.fn().mockImplementation((key: string, value: string, options?: any) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    del: jest.fn().mockImplementation((key: string) => {
      const deleted = store.delete(key);
      return Promise.resolve(deleted ? 1 : 0);
    }),
    exists: jest.fn().mockImplementation((key: string) => Promise.resolve(store.has(key) ? 1 : 0)),
    expire: jest.fn().mockResolvedValue(1),
    ttl: jest.fn().mockResolvedValue(300),
    quit: jest.fn().mockResolvedValue(undefined),
    connect: jest.fn().mockResolvedValue(undefined),
    isOpen: true,
    _store: store // Expose for testing
  };
}

/**
 * Creates a mock job queue for testing
 */
export function createMockJobQueue() {
  const jobs: any[] = [];

  return {
    add: jest.fn().mockImplementation((job: any) => {
      jobs.push(job);
      return Promise.resolve({ id: jobs.length, ...job });
    }),
    process: jest.fn(),
    getJob: jest.fn().mockImplementation((id: number) => Promise.resolve(jobs[id - 1] || null)),
    getJobs: jest.fn().mockResolvedValue(jobs),
    close: jest.fn().mockResolvedValue(undefined),
    _jobs: jobs // Expose for testing
  };
}

/**
 * Creates a mock circuit breaker for testing
 */
export function createMockCircuitBreaker() {
  return {
    execute: jest.fn().mockImplementation((fn: Function) => fn()),
    getState: jest.fn().mockReturnValue('CLOSED'),
    getStats: jest.fn().mockReturnValue({
      failures: 0,
      successes: 100,
      state: 'CLOSED'
    }),
    reset: jest.fn()
  };
}

/**
 * Creates test server configuration with all services mocked
 */
export function createTestServerSetup() {
  const config = createTestProxyConfig();
  const blobKit = createMockBlobKitSDK();
  const paymentVerifier = createMockPaymentVerifier();
  const blobExecutor = createMockBlobExecutor();
  const redis = createMockRedisClient();
  const jobQueue = createMockJobQueue();
  const circuitBreaker = createMockCircuitBreaker();

  return {
    config,
    services: {
      blobKit,
      paymentVerifier,
      blobExecutor,
      redis,
      jobQueue,
      circuitBreaker
    }
  };
}

/**
 * Waits for Express server to be ready
 */
export async function waitForServer(port: number, timeout: number = 10000): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(`http://localhost:${port}/api/v1/health`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  throw new Error(`Server did not start on port ${port} within ${timeout}ms`);
}

/**
 * Validates signature for request verification
 */
export function generateRequestSignature(
  payload: string,
  timestamp: number,
  secret: string
): string {
  const message = `${payload}:${timestamp}`;
  const messageHash = ethers.keccak256(ethers.toUtf8Bytes(message));
  const secretHash = ethers.keccak256(ethers.toUtf8Bytes(secret));
  const combined = ethers.keccak256(ethers.concat([messageHash, secretHash]));
  return combined;
}

/**
 * Creates a valid signed request for testing
 */
export function createSignedRequest(
  payload: any,
  secret: string
): { body: any; headers: Record<string, string> } {
  const timestamp = Date.now();
  const payloadStr = JSON.stringify(payload);
  const signature = generateRequestSignature(payloadStr, timestamp, secret);

  return {
    body: payload,
    headers: {
      'x-signature': signature,
      'x-timestamp': timestamp.toString(),
      'content-type': 'application/json'
    }
  };
}

// Re-export test environment utilities
export {
  IntegrationTestEnvironment,
  ProxyServerManager,
  ContractDeployer,
  generateTestBlobData,
  validateBlobTransaction
} from './test-environment';

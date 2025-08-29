import { createHash } from 'crypto';

// Types
export type Hex = `0x${string}`;
export type Bytes48 = Hex;
export type Bytes96 = Hex;

export interface BlobSidecar {
  index: string;
  blob: Hex;
  kzg_commitment: Bytes48;
  kzg_proof: Bytes48;
}

export interface BeaconBlockResponse {
  data: {
    message: {
      slot: string;
      body: {
        blob_kzg_commitments?: Bytes48[];
      };
    };
  };
  execution_optimistic?: boolean;
  finalized?: boolean;
}

export interface BlobSidecarsResponse {
  data: BlobSidecar[] | null;
  execution_optimistic?: boolean;
  finalized?: boolean;
}

// Constants
export const BLOB_SIZE = 131072; // 128 KiB
export const FIELD_ELEMENTS_PER_BLOB = 4096;
export const BYTES_PER_FIELD_ELEMENT = 32;

// Test fixtures
export const TEST_COMMITMENT: Bytes48 = '0xb5bc96b70df0dfcc2c38f50d4ca3ff4e8f457d7a0c6a6a1e69c0b84c5e6857f37f3d4e6b0098765432109876543210ab';
export const TEST_PROOF: Bytes48 = '0xa1b2c3d4e5f6789012345678901234567890123456789012345678901234567890123456789012345678901234567890';

// Helper functions
export function toVersionedHash(commitment: Bytes48): Hex {
  // Versioned hash = 0x01 || sha256(commitment)[1:]
  const commitmentBytes = Buffer.from(commitment.slice(2), 'hex');
  const hash = createHash('sha256').update(commitmentBytes).digest();
  hash[0] = 0x01;
  return ('0x' + hash.toString('hex')) as Hex;
}

export function createTestBlob(seed: number = 0): Uint8Array {
  const blob = new Uint8Array(BLOB_SIZE);
  // Fill with deterministic data based on seed
  for (let i = 0; i < BLOB_SIZE; i++) {
    blob[i] = (seed + i) % 256;
  }
  return blob;
}

export function blobToHex(blob: Uint8Array): Hex {
  return ('0x' + Buffer.from(blob).toString('hex')) as Hex;
}

export function hexToBytes(hex: Hex): Uint8Array {
  return Buffer.from(hex.slice(2), 'hex');
}

export function createTestSidecar(index: number, seed: number = 0): BlobSidecar {
  const blob = createTestBlob(seed);
  return {
    index: index.toString(),
    blob: blobToHex(blob),
    kzg_commitment: TEST_COMMITMENT,
    kzg_proof: TEST_PROOF
  };
}

export function createTestCommitment(index: number): Bytes48 {
  // Create unique commitment for each index
  const base = TEST_COMMITMENT.slice(2);
  const modified = base.slice(0, -2) + index.toString(16).padStart(2, '0');
  return ('0x' + modified) as Bytes48;
}

// Mock KZG library
export class MockKZG {
  private shouldFailBatch: boolean = false;
  private failingIndices: Set<number> = new Set();

  setShouldFailBatch(value: boolean) {
    this.shouldFailBatch = value;
  }

  setFailingIndices(indices: number[]) {
    this.failingIndices = new Set(indices);
  }

  async verifyBlobKzgProofBatch(
    blobs: Uint8Array[],
    commitments: Bytes48[],
    proofs: Bytes48[]
  ): Promise<boolean> {
    if (this.shouldFailBatch) {
      return false;
    }
    return blobs.length === commitments.length && commitments.length === proofs.length;
  }

  async verifyBlobKzgProof(
    blob: Uint8Array,
    commitment: Bytes48,
    proof: Bytes48,
    index?: number
  ): Promise<boolean> {
    if (index !== undefined && this.failingIndices.has(index)) {
      return false;
    }
    return blob.length === BLOB_SIZE;
  }

  blobToKzgCommitment(blob: Uint8Array): Bytes48 {
    // Return test commitment
    return TEST_COMMITMENT;
  }

  computeBlobKzgProof(blob: Uint8Array, commitment: Bytes48): Bytes48 {
    // Return test proof
    return TEST_PROOF;
  }
}

// Mock fetch for Beacon API
export function createMockBeaconFetch() {
  const responses = new Map<string, any>();
  
  const mockFetch = jest.fn(async (url: string, options?: any) => {
    const response = responses.get(url);
    if (!response) {
      return {
        ok: false,
        status: 404,
        json: async () => ({ message: 'Not found' })
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => response
    };
  });

  return {
    fetch: mockFetch,
    setResponse: (url: string, response: any) => {
      responses.set(url, response);
    },
    clearResponses: () => {
      responses.clear();
    }
  };
}

// Mock EL provider
export class MockELProvider {
  private responses = new Map<string, any>();

  setResponse(method: string, params: any[], response: any) {
    const key = `${method}:${JSON.stringify(params)}`;
    this.responses.set(key, response);
  }

  async send(method: string, params: any[]): Promise<any> {
    const key = `${method}:${JSON.stringify(params)}`;
    const response = this.responses.get(key);
    if (!response) {
      throw new Error(`No mock response for ${method} with params ${JSON.stringify(params)}`);
    }
    return response;
  }

  async getTransaction(hash: string): Promise<any> {
    return this.send('eth_getTransactionByHash', [hash]);
  }

  async getTransactionReceipt(hash: string): Promise<any> {
    return this.send('eth_getTransactionReceipt', [hash]);
  }

  async getBlock(blockId: string | number): Promise<any> {
    return this.send('eth_getBlockByNumber', [blockId, false]);
  }
}

// Test transaction with blobs
export function createTestTransaction(txHash: string, blobHashes: Hex[]) {
  return {
    hash: txHash,
    blockNumber: 1000000,
    blockHash: '0xblock123',
    blobVersionedHashes: blobHashes,
    type: 3 // Type 3 = blob transaction
  };
}

// Test block
export function createTestBlock(blockNumber: number, slot: number) {
  return {
    number: blockNumber,
    hash: '0xblock' + blockNumber,
    timestamp: Math.floor(Date.now() / 1000),
    slot
  };
}
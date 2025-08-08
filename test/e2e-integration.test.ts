// Minimal integration smoke test (skips fast if Anvil is not running)
import { JsonRpcProvider } from 'ethers';

async function isRpcReachable(url: string, timeoutMs: number = 2000): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Any response means the port is listening; method doesn't matter
    await fetch(url, { method: 'GET', signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

describe('Integration smoke test', () => {
  const rpcUrl = process.env.BLOBKIT_RPC_URL || 'http://localhost:8545';

  it('connects to Anvil and gets a block number', async () => {
    if (!(await isRpcReachable(rpcUrl))) {
      // Skip quickly when Anvil is not running locally
      return;
    }

    const provider = new JsonRpcProvider(rpcUrl);
    const blockNumber = await provider.getBlockNumber();
    expect(typeof blockNumber).toBe('number');
    expect(blockNumber).toBeGreaterThanOrEqual(0);
  });
});


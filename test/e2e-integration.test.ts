// Minimal integration smoke test
import { JsonRpcProvider } from 'ethers';

describe('Integration smoke test', () => {
  const rpcUrl = process.env.BLOBKIT_RPC_URL || 'http://localhost:8545';

  it('connects to Anvil and gets a block number', async () => {
    const provider = new JsonRpcProvider(rpcUrl);
    const blockNumber = await provider.getBlockNumber();
    expect(typeof blockNumber).toBe('number');
    expect(blockNumber).toBeGreaterThanOrEqual(0);
  });
});


import { ethers } from 'ethers';
import { signBlobTransaction } from '../../src/sign-blob-transaction.js';
import type { Signer } from '../../src/types.js';

const unsignedTx = '0x03c0';

describe('EIP-7594 blob transaction signing', () => {
  test('a standard ethers Wallet signs the raw transaction digest', async () => {
    const wallet = new ethers.Wallet(`0x${'11'.repeat(32)}`);
    const signature = await signBlobTransaction(wallet, unsignedTx);

    expect(ethers.recoverAddress(ethers.keccak256(unsignedTx), signature)).toBe(wallet.address);
  });

  test('a custom raw transaction signer is still supported', async () => {
    const wallet = new ethers.Wallet(`0x${'22'.repeat(32)}`);
    const signature = wallet.signingKey.sign(ethers.keccak256(unsignedTx));
    const customSigner = {
      signRawTransaction: jest.fn(async () => signature),
    } as unknown as Signer;

    expect(await signBlobTransaction(customSigner, unsignedTx)).toBe(signature);
    expect(customSigner.signRawTransaction).toHaveBeenCalledWith(unsignedTx);
  });

  test('unsupported signers fail with an actionable error', async () => {
    await expect(signBlobTransaction({} as Signer, unsignedTx)).rejects.toThrow(
      'requires an ethers BaseWallet or a signer with signRawTransaction'
    );
  });
});

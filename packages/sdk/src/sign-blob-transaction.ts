import { ethers, type Signature } from 'ethers';
import type { Signer } from './types.js';

/** Sign the digest of an unsigned EIP-7594 blob transaction. */
export async function signBlobTransaction(signer: Signer, unsignedTx: string): Promise<Signature> {
  if (typeof signer.signRawTransaction === 'function') {
    return signer.signRawTransaction(unsignedTx);
  }

  if (signer instanceof ethers.BaseWallet) {
    return signer.signingKey.sign(ethers.keccak256(unsignedTx));
  }

  throw new Error(
    'EIP-7594 direct submission requires an ethers BaseWallet or a signer with signRawTransaction(rawTx)'
  );
}

/**
 * Wrapper to make SecureSigner compatible with ethers.Signer
 */
import { ethers } from 'ethers';
import type { SecureSigner } from './secure-signer.js';

// Type guard for EnvSigner
interface EnvSignerType {
  signer: ethers.Wallet;
}

function isEnvSigner(signer: SecureSigner): signer is SecureSigner & EnvSignerType {
  return 'signer' in signer && signer.signer instanceof ethers.Wallet;
}

export function wrapAsEthersSigner(
  secureSigner: SecureSigner,
  provider?: ethers.Provider
): ethers.Signer {
  if (isEnvSigner(secureSigner)) {
    // EnvSigner - return the wrapped ethers.Wallet
    return secureSigner.signer;
  }

  // For AWS KMS and other signers, create a VoidSigner
  // This is a read-only signer that can't send transactions directly
  // but that's okay since we use it for signing only
  const voidSigner = new ethers.VoidSigner(
    '', // Address will be set later
    provider
  );

  // Override the getAddress method
  Object.defineProperty(voidSigner, 'getAddress', {
    value: async () => secureSigner.getAddress(),
    writable: false,
    configurable: false
  });

  // Override the signMessage method
  Object.defineProperty(voidSigner, 'signMessage', {
    value: async (message: string | Uint8Array) => secureSigner.signMessage(message),
    writable: false,
    configurable: false
  });

  // Override the signTransaction method
  Object.defineProperty(voidSigner, 'signTransaction', {
    value: async (tx: ethers.TransactionRequest) => secureSigner.signTransaction(tx),
    writable: false,
    configurable: false
  });

  return voidSigner;
}

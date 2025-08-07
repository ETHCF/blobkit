/**
 * Global type declarations for BlobKit SDK
 */

type EthereumRequestMethod =
  | 'eth_requestAccounts'
  | 'eth_accounts'
  | 'eth_chainId'
  | 'eth_sendTransaction'
  | 'eth_signTypedData_v4'
  | 'personal_sign'
  | 'eth_getBalance'
  | 'eth_blockNumber'
  | 'eth_getTransactionReceipt'
  | 'net_version';

type EthereumRequestParams = {
  eth_requestAccounts: [];
  eth_accounts: [];
  eth_chainId: [];
  eth_sendTransaction: [
    {
      from: string;
      to?: string;
      value?: string;
      data?: string;
      gas?: string;
      gasPrice?: string;
      maxFeePerGas?: string;
      maxPriorityFeePerGas?: string;
    }
  ];
  eth_signTypedData_v4: [string, string];
  personal_sign: [string, string];
  eth_getBalance: [string, string];
  eth_blockNumber: [];
  eth_getTransactionReceipt: [string];
  net_version: [];
};

type EthereumRequestResult = {
  eth_requestAccounts: string[];
  eth_accounts: string[];
  eth_chainId: string;
  eth_sendTransaction: string;
  eth_signTypedData_v4: string;
  personal_sign: string;
  eth_getBalance: string;
  eth_blockNumber: string;
  eth_getTransactionReceipt: {
    blockNumber: string;
    transactionHash: string;
    status: string;
  } | null;
  net_version: string;
};

interface EthereumProvider {
  isMetaMask?: boolean;
  request<T extends EthereumRequestMethod>(args: {
    method: T;
    params?: EthereumRequestParams[T];
  }): Promise<EthereumRequestResult[T]>;
  on(event: 'accountsChanged', handler: (accounts: string[]) => void): void;
  on(event: 'chainChanged', handler: (chainId: string) => void): void;
  on(event: 'disconnect', handler: (error: { code: number; message: string }) => void): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
  removeListener(event: string, handler: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export {};

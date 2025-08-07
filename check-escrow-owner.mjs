#!/usr/bin/env node

import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const MAINNET_RPC = process.env.MAINNET_RPC_URL;
const ESCROW_ADDRESS = '0xB4CFE544d8aE6015B844dF84D3c5Dcf5bA3e2495';

async function checkOwnership() {
  const provider = new ethers.JsonRpcProvider(MAINNET_RPC);
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!MAINNET_RPC) {
    console.error('MAINNET_RPC_URL not set');
    process.exit(1);
  }
  const wallet = new ethers.Wallet(privateKey, provider);
  
  const escrowABI = [
    'function owner() view returns (address)',
    'function authorizedProxies(address) view returns (bool)',
    'function setProxyAuthorization(address proxy, bool authorized)',
    'function setProxyFee(uint256 percent)',
    'function proxyFees(address) view returns (uint256)'
  ];
  
  const escrow = new ethers.Contract(ESCROW_ADDRESS, escrowABI, provider);
  
  const owner = await escrow.owner();
  const myAddress = wallet.address;
  
  console.log('Contract owner:', owner);
  console.log('My address:', myAddress);
  console.log('Am I owner?', owner.toLowerCase() === myAddress.toLowerCase());
  
  // Check if I'm already authorized as proxy
  const isAuthorized = await escrow.authorizedProxies(myAddress);
  const fee = await escrow.proxyFees(myAddress);
  
  console.log('Already authorized?', isAuthorized);
  console.log('Current fee:', fee.toString() + '%');
  
  if (owner.toLowerCase() === myAddress.toLowerCase() && !isAuthorized) {
    console.log('\nAttempting to authorize self as proxy...');
    const escrowWithSigner = escrow.connect(wallet);
    
    try {
      // First authorize the proxy
      const tx1 = await escrowWithSigner.setProxyAuthorization(myAddress, true);
      console.log('Authorization TX:', tx1.hash);
      const receipt1 = await tx1.wait();
      console.log('✅ Authorized in block', receipt1.blockNumber);
      
      // Then set the fee (proxy must call this themselves)
      // Note: This might fail since we need to be authorized first
      const tx2 = await escrowWithSigner.setProxyFee(2);
      console.log('Fee TX:', tx2.hash);
      const receipt2 = await tx2.wait();
      console.log('✅ Fee set in block', receipt2.blockNumber);
    } catch (error) {
      console.error('Failed:', error.message);
      
      // Try to decode the error
      if (error.data) {
        console.log('Error data:', error.data);
      }
    }
  }
}

checkOwnership().catch(console.error);
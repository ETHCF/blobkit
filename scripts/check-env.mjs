#!/usr/bin/env node
import fs from 'fs';

const REQUIRED = {
  root: [],
  sdk: ['BLOBKIT_RPC_URL', 'BLOBKIT_CHAIN_ID'],
  proxy: ['RPC_URL', 'CHAIN_ID', 'ESCROW_CONTRACT', 'REQUEST_SIGNING_SECRET']
};

const pkg = process.argv[2] || 'root';
const vars = REQUIRED[pkg] || [];
const missing = vars.filter(name => !process.env[name] || String(process.env[name]).trim() === '');

if (missing.length) {
  console.warn(`[check-env] Missing env vars for ${pkg}: ${missing.join(', ')}`);
  process.exitCode = 0; // warn only
} else {
  console.log(`[check-env] All required env vars present for ${pkg}`);
}

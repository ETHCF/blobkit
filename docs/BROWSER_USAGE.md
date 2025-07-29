# BlobKit Browser Usage Guide

This guide explains how to use BlobKit in browser environments.

## Key Changes for Browser Compatibility

1. **No File System Access**: File paths are not supported in browsers. Use `Uint8Array` data instead.
2. **Dynamic Imports**: Node.js modules are loaded dynamically only in Node.js environments.
3. **Environment Detection**: Proper checks prevent browser crashes from Node.js-specific code.

## Installation

```bash
npm install blobkit ethers
```

## Bundling

BlobKit uses conditional exports for browser compatibility. Most modern bundlers will automatically use the browser-specific versions.

### Webpack Configuration

```javascript
module.exports = {
  resolve: {
    fallback: {
      "fs": false,
      "fs/promises": false,
      "path": false
    }
  }
};
```

### Vite Configuration

```javascript
export default {
  resolve: {
    alias: {
      fs: false,
      'fs/promises': false,
      path: false
    }
  }
};
```

## Basic Usage

### 1. Initialize BlobKit

```javascript
import { BlobKit, initialize } from 'blobkit';

// Automatic initialization - downloads official trusted setup
await initialize();

// Or for development/testing
import { initializeForDevelopment } from 'blobkit';
await initializeForDevelopment();

// Or for custom trusted setup URLs
import { initializeForBrowser } from 'blobkit';
await initializeForBrowser({
  g1Url: 'https://your-cdn.com/g1.txt',
  g2Url: 'https://your-cdn.com/g2.txt',
  format: 'text', // or 'binary'
  timeout: 30000, // optional, defaults to 30s
  // Optional: provide SHA-256 hashes for verification
  g1Hash: 'expected_g1_hash_here',
  g2Hash: 'expected_g2_hash_here'
});
```

### 2. Connect Wallet (MetaMask Example)

```javascript
import { ethers } from 'ethers';

// Check if MetaMask is installed
if (typeof window.ethereum === 'undefined') {
  throw new Error('MetaMask not installed');
}

// Request account access
const accounts = await window.ethereum.request({ 
  method: 'eth_requestAccounts' 
});

// Create provider and signer
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

// Create BlobKit instance with signer
const blobkit = new BlobKit({
  rpcUrl: 'https://mainnet.infura.io/v3/YOUR_API_KEY',
  chainId: 1
}, signer);
```

### 3. Write Data

```javascript
// Write blob data
const data = 'Hello from the browser!';
const receipt = await blobkit.writeBlob(data);

console.log('Transaction hash:', receipt.transactionHash);
console.log('Block number:', receipt.blockNumber);
console.log('Versioned hashes:', receipt.versionedHashes);
```

## Security Considerations

1. **HTTPS Only**: Trusted setup files must be served over HTTPS.
2. **Hash Verification**: Always provide SHA-256 hashes for trusted setup files in production.
3. **Content Security**: Ensure your CDN has proper CORS headers and security policies.

## Trusted Setup Files

The trusted setup files can be obtained from the [Ethereum KZG Ceremony](https://github.com/ethereum/kzg-ceremony-sequencer).

### Hosting Requirements

1. Serve files over HTTPS
2. Set appropriate CORS headers:
   ```
   Access-Control-Allow-Origin: *
   Access-Control-Allow-Methods: GET
   ```
3. Use CDN for better performance
4. Compress files with gzip/brotli

### File Formats

- **Text format**: Human-readable hex strings (larger size)
- **Binary format**: Raw bytes (smaller size, more efficient)

## Error Handling

```javascript
try {
  await initializeForBrowser({
    g1Url: 'https://cdn.example.com/g1.txt',
    g2Url: 'https://cdn.example.com/g2.txt'
  });
} catch (error) {
  if (error.code === 'BROWSER_FILE_ERROR') {
    console.error('File paths not supported in browser');
  } else if (error.code === 'INSECURE_URL') {
    console.error('HTTPS required for trusted setup files');
  } else if (error.code === 'FETCH_TIMEOUT') {
    console.error('Download timeout - check your connection');
  } else {
    console.error('Initialization failed:', error);
  }
}
```

## Bundle Size Optimization

To minimize bundle size:

1. Use tree-shaking to import only needed functions
2. Load ethers dynamically if not used elsewhere
3. Consider using the binary format for trusted setup (smaller download)

## Example Projects

See the `examples/browser-usage.html` file for a complete working example.

## Troubleshooting

### "File paths not supported in browser environment"
- You're trying to use file paths instead of URLs or Uint8Array data
- Solution: Use `initializeForBrowser()` with URLs or pass Uint8Array data

### "Cannot find module 'fs'"
- Your bundler is trying to include Node.js modules
- Solution: Configure your bundler to exclude Node.js built-ins

### "Failed to fetch trusted setup"
- Network error or CORS issue
- Solution: Check URL accessibility and CORS headers

### Bundle includes Node.js code
- The bundler isn't using the browser field mappings
- Solution: Ensure your bundler supports the "browser" field in package.json
# BlobKit v2 TODO

## Integration Testing

### End-to-End Verification
Once KZG issue is resolved:

1. **Run integration demo successfully**
   ```bash
   export BLOBKIT_KZG_TRUSTED_SETUP_PATH=/path/to/trusted_setup.txt
   npm run dev:setup
   ```

2. **Test browser SDK import**
   ```javascript
   import { BlobKit } from '@blobkit/sdk';
   // Should not fail with native module error
   ```

3. **Verify complete flow**
   - Contract deployment
   - Proxy server startup
   - Blob submission from browser
   - Payment verification
   - Job completion

## Performance & Load Testing

### Proxy Server
- Load test with concurrent blob submissions
- Memory usage under sustained load
- Error handling under failure conditions

### Contract Gas Optimization
- Review gas costs for deposit/complete/refund operations
- Optimize event emission patterns if needed

## Security Audit Preparation

### Code Review
- Review all `as any` type assertions for safety
- Validate input sanitization in proxy endpoints
- Confirm replay protection in contract

### Environment Security
- Ensure no private keys in environment examples
- Validate trusted setup file integrity checks
- Review CORS and rate limiting configurations

## Documentation Updates

### Post-KZG Fix
- Update installation instructions if peerDependency approach used
- Add browser compatibility notes
- Update integration examples with working imports

### Architecture Documentation
- Verify all Mermaid diagrams reflect actual implementation
- Update function signatures if any changed during development
- Confirm all environment variables documented

## Deployment Preparation

### Package Publishing
- Verify all package.json exports are correct
- Test npm publish dry-run for each package
- Confirm no internal modules leak in published packages

### CI/CD Pipeline
- Add KZG bundling test to CI
- Verify builds work in clean environment
- Add integration test step to GitHub Actions

## Known Type Issues (Non-blocking)

### SDK Type Compatibility
- Custom Signer interface vs ethers.js Signer - consider alignment
- Provider type casting in blobkit.ts line 441 - review if needed
- Browser.ts line 40 JsonRpcSigner compatibility - monitor for issues

These type warnings don't break functionality but should be cleaned up.

## Performance Monitoring

### Metrics to Implement
- Blob processing time
- Contract interaction latency
- Proxy server response times
- KZG operation performance

## Next Steps Summary

1. **Fix KZG bundling** (critical - blocks everything)
2. **Verify end-to-end integration** works after fix
3. **Load test proxy server** under realistic conditions
4. **Security review** of type assertions and input validation
5. **Update documentation** for any KZG-related changes
6. **Prepare for security audit**

The codebase architecture is solid. All business logic is implemented. This is purely a build/bundling issue preventing deployment.

## Complete Production Readiness Checklist

### 1. Performance Testing
```bash
# Load test proxy server
npm install -g autocannon
npm run dev:proxy # in background
autocannon -c 10 -d 30 http://localhost:3001/health
```

Expected: >1000 req/sec, <100ms latency

### 2. Security Review Items

**Type Safety Audit:**
```bash
# Check for remaining any types
grep -r "as any" packages/*/src/
grep -r ": any" packages/*/src/
```

**Input Validation:**
- Verify all proxy endpoints validate request bodies
- Check blob size limits are enforced
- Confirm rate limiting works

**Environment Security:**
```bash
# Ensure no secrets in code
grep -r "private" packages/ | grep -v ".d.ts"
grep -r "secret" packages/ | grep -v ".d.ts"
grep -r "mnemonic" packages/ | grep -v ".d.ts"
```

### 3. Browser Compatibility Testing

After KZG fix, test browser SDK:

**Create test HTML:**
```html
<!DOCTYPE html>
<html>
<head>
    <title>BlobKit Browser Test</title>
</head>
<body>
    <script type="module">
        import { BlobKit } from './packages/sdk/dist/browser.esm.js';
        console.log('BlobKit loaded:', BlobKit);
        
        // Test basic instantiation
        const blobkit = new BlobKit({
            rpcUrl: 'http://localhost:8545',
            chainId: 31337,
            logLevel: 'debug'
        });
        
        console.log('BlobKit instance created successfully');
    </script>
</body>
</html>
```

### 4. Package Publishing Preparation

**Test publishability:**
```bash
cd packages/sdk && npm pack
cd ../proxy-server && npm pack  
cd ../contracts && npm pack
```

**Verify exports work:**
```bash
# Test each built package
node -e "console.log(Object.keys(require('./packages/sdk/dist/index.js')))"
```

### 7. Documentation Verification

**Update installation docs if peerDependency approach used:**
```markdown
## Installation

```bash
npm install @blobkit/sdk c-kzg ethers
```

Note: c-kzg is required for KZG operations but must be installed separately due to native module bundling constraints.
```

**Test all code examples in docs:**
```bash
# Extract and test all code blocks from README files
# (Manual verification needed)
```

### 5. CI/CD Pipeline Updates

**Add KZG test to GitHub Actions:**
```yaml
# .github/workflows/ci.yml
- name: Test SDK Import
  run: |
    export BLOBKIT_KZG_TRUSTED_SETUP_PATH=$PWD/trusted_setup.txt
    node -e "import('./packages/sdk/dist/index.js').then(() => console.log('✓ SDK import successful')).catch(err => { console.error('✗ SDK import failed:', err.message); process.exit(1); })"
```

### 6. Production Environment Setup

**Environment Variables Needed:**
```bash
# Required for KZG operations
export BLOBKIT_KZG_TRUSTED_SETUP_PATH="/path/to/trusted_setup.txt"

# Network configuration
export BLOBKIT_RPC_URL="https://mainnet.infura.io/v3/YOUR_KEY"
export BLOBKIT_CHAIN_ID="1"
export BLOBKIT_ESCROW_1="0x..." # Mainnet contract address

# Proxy configuration
export BLOBKIT_PROXY_URL="https://your-proxy.com"

# Security
export BLOBKIT_LOG_LEVEL="info"
```

**Deployment Checklist:**
- [ ] Trusted setup file available and secure
- [ ] Contract deployed and verified on target network
- [ ] Proxy server configured with proper CORS/rate limiting
- [ ] Load balancer configured for proxy server
- [ ] Monitoring and alerting setup
- [ ] Error tracking (Sentry, etc.)

### 7. Final Verification Script

```bash
#!/bin/bash
set -e

echo "BlobKit Production Readiness Check"

# 1. Build check
echo "Building all packages..."
npm run build
echo "✓ Build successful"

# 2. KZG check
echo "Testing KZG initialization..."
export BLOBKIT_KZG_TRUSTED_SETUP_PATH="$(pwd)/trusted_setup.txt"
node -e "
import('./packages/sdk/dist/index.js').then(sdk => {
  console.log('✓ SDK import successful');
  console.log('Available exports:', Object.keys(sdk));
}).catch(err => {
  console.error('✗ SDK import failed:', err.message);
  process.exit(1);
})"

# 3. Integration check
echo "Running integration test..."
npm run demo
echo "✓ Integration test passed"

# 4. Type check
echo "Checking for type issues..."
npm run build 2>&1 | grep -i "error" && echo "✗ Type errors found" || echo "✓ No type errors"

echo "Production readiness check complete"
```

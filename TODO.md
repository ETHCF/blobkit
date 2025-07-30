# BlobKit v2 TODO

## Critical Production Blocker

### KZG Native Module Bundling Issue
**Status:** Blocks all production deployment  
**Error:** `Could not dynamically require "/Users/zak/blobkit/build/kzg.node"`

The `c-kzg` native module cannot be bundled by Rollup. SDK imports fail in browser environments.

**Fix Options:**
1. **Externalize c-kzg in rollup.config.js** (recommended)
   ```javascript
   // packages/sdk/rollup.config.js
   export default {
     external: ['c-kzg', 'ethers'],
     // ...
   }
   ```
   Update package.json to mark c-kzg as peerDependency.

2. **Runtime dynamic import with fallback**
   ```typescript
   // packages/sdk/src/kzg.ts
   let kzg;
   try {
     kzg = await import('c-kzg');
   } catch (error) {
     throw new BlobKitError(BlobKitErrorCode.KZG_ERROR, 'c-kzg not available');
   }
   ```

3. **Browser WASM alternative**
   Use different KZG implementation for browser vs Node.js.

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

## Contact

For questions about this implementation: zcole@linux.com
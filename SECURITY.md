# Security Policy

## Supported Versions

We actively support and provide security updates for the following versions:

| Version | Supported |
| ------- | --------- |
| 0.3.x   | Yes       |
| 0.2.x   | Yes       |
| 0.1.x   | No        |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report security vulnerabilities by emailing the maintainers directly. Include as much information as possible:

- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact assessment
- Suggested fix (if you have one)

You should receive a response within 48 hours. If the issue is confirmed, we will:

1. Work on a fix immediately
2. Coordinate disclosure timing with you
3. Credit you in the security advisory (if desired)
4. Release a security update as soon as possible

## Security Measures

### Input Validation

BlobKit implements comprehensive input validation:

- **Environment Variables**: All environment variables are validated for format and security
- **Private Keys**: Validated for correct 64-character hex format
- **RPC URLs**: Validated for proper HTTP/HTTPS format
- **Blob Hashes**: Validated for correct versioned hash format
- **Transaction Hashes**: Validated for correct 64-character hex format
- **Numeric Inputs**: Range validation for chain IDs, compression levels, and block numbers

### Cryptographic Security

- **Audited Libraries**: Uses `@noble/curves` and `@noble/hashes` for cryptographic operations
- **KZG Implementation**: Follows EIP-4844 specification exactly
- **Trusted Setup**: Supports official Ethereum KZG ceremony parameters
- **Development Warning**: Clear warnings about mock setup usage

### Data Handling

- **No Sensitive Data Logging**: Private keys and sensitive information are never logged
- **Secure Error Handling**: Error messages don't expose sensitive internal details
- **Memory Safety**: Uses TypeScript strict mode and validates all data types
- **Buffer Operations**: Uses safe buffer operations to prevent overflows

### Network Security

- **HTTPS Validation**: Ensures RPC and archive URLs use secure protocols
- **No Hardcoded Credentials**: All credentials must be provided via environment variables
- **Secure Defaults**: Conservative default settings for all configurable options

## Security Best Practices for Users

### Environment Variables

```bash
# DO: Use environment variables for sensitive data
RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
PRIVATE_KEY=0x1234567890abcdef...

# DON'T: Hardcode sensitive information in code
const privateKey = "0x1234567890abcdef..."; // Never do this
```

### Private Key Management

- **Never commit private keys to version control**
- **Use hardware wallets for high-value operations**
- **Rotate keys regularly for production systems**
- **Use different keys for different environments**
- **Consider key management services for production**

### RPC Security

- **Use reputable RPC providers**
- **Implement rate limiting in your applications**
- **Monitor RPC usage for anomalies**
- **Use API keys with appropriate scoping**

### Production Deployment

- **Always use production KZG trusted setup**
- **Validate all inputs at application boundaries**
- **Implement proper logging without sensitive data**
- **Use HTTPS for all network communications**
- **Regularly update dependencies**

### Archive Services

- **Verify archive service integrity**
- **Implement fallback mechanisms**
- **Monitor archive service availability**
- **Consider running your own archive service for critical applications**

## Vulnerability Disclosure Timeline

We follow responsible disclosure practices:

1. **Day 0**: Vulnerability reported
2. **Day 1-2**: Initial response and acknowledgment
3. **Day 3-7**: Vulnerability assessment and reproduction
4. **Day 8-14**: Fix development and testing
5. **Day 15-21**: Security release preparation
6. **Day 22**: Public disclosure and release

This timeline may be adjusted based on the severity and complexity of the vulnerability.

## Security Considerations for Developers

### Blob Data

- Blob data is ephemeral (auto-deleted after ~18 days)
- Blob data is publicly readable by anyone
- Never store sensitive information in blobs
- Consider encryption for private data

### Transaction Costs

- Blob transactions have gas costs
- Implement proper fee estimation
- Monitor for unusual cost spikes
- Consider fee limits in production

### Network Considerations

- Blob availability depends on network conditions
- Implement retry logic for failed reads
- Consider fallback mechanisms
- Monitor network health

## Dependency Security

We regularly audit and update dependencies:

- **Automated Security Scanning**: Dependencies are scanned for known vulnerabilities
- **Regular Updates**: Security updates are applied promptly
- **Minimal Dependencies**: We keep dependencies minimal to reduce attack surface
- **Vetted Libraries**: Only use well-maintained, audited libraries for cryptographic operations

## Security Testing

Our security testing includes:

- **Static Code Analysis**: Automated scanning for security patterns
- **Dependency Auditing**: Regular npm audit runs
- **Input Fuzzing**: Testing with malformed and edge-case inputs
- **Cryptographic Testing**: Verification against known test vectors
- **Integration Testing**: End-to-end security validation

## Contact

For security-related questions or concerns, please contact Zak Cole directly at zcole@linux.com rather than opening public issues.

Thank you for helping keep BlobKit secure.

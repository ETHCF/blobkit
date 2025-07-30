# Changelog

All notable changes to the BlobKit SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2024-07-30

### Added

- Production-grade KZG implementation using c-kzg library
- Comprehensive TypeScript types with strict mode support
- Environment detection for Node.js, browser, and serverless environments
- Codec system for data encoding/decoding (JSON, Raw, Text)
- MetaMask integration for browser environments
- Cost estimation and payment flow management
- Runtime environment variable validation
- Structured error handling with actionable error codes
- Dual CJS/ESM builds with proper TypeScript declarations

### Features

- **BlobKit Class**: Main SDK class with automatic environment detection
- **Payment Methods**: Support for Web3 payments (browser) and direct transactions (Node.js)
- **KZG Operations**: Real cryptographic commitments and proofs using c-kzg
- **Error Handling**: Comprehensive error codes and meaningful error messages
- **Configuration**: Flexible configuration with environment variable support
- **Logging**: Configurable logging levels (debug, info, silent)

### Security

- All cryptographic operations use audited libraries
- Input validation for all public APIs
- Proper error sanitization to prevent information leakage
- Environment-specific security considerations

### Documentation

- Complete API reference with TypeScript types
- Browser and Node.js usage examples
- Integration guides for different environments
- Error handling documentation

## [1.0.0] - 2024-07-29

### Added

- Initial release of BlobKit SDK
- Basic blob storage functionality
- Ethereum EIP-4844 blob transaction support 
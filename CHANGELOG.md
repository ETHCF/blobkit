# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2025-01-25

### Added
- Comprehensive input validation for all API parameters
- Runtime type guards (isValidBlobHash, isValidTxHash, isValidHexString)
- Enhanced error handling with structured error codes
- JSDoc documentation for all public APIs
- Performance optimizations with zero-copy operations
- Environment variable validation with helpful error messages
- Support for compression level configuration
- Comprehensive security validations

### Changed
- Improved blob encoding/decoding performance with pre-allocated buffers
- Enhanced BlobKitError class with better prototype chain handling
- Updated type definitions with inline documentation
- Optimized memory usage in blob operations

### Fixed
- Fixed environment variable parsing with proper validation
- Improved error messages for debugging
- Enhanced TypeScript strict mode compliance

## [0.2.0] - 2025-01-25

### Added
- Built-in environment variable support with createFromEnv()
- createReadOnlyFromEnv() for read-only operations
- Automatic validation of environment variables
- Support for DEFAULT_CODEC and COMPRESSION_LEVEL env vars

### Changed
- Simplified API with environment variable helpers
- Updated README with security best practices
- Enhanced package exports configuration

## [0.1.1] - 2025-01-25

### Added
- dotenv dependency for environment variable examples
- Security improvements in documentation

### Changed
- Updated README with proper .env usage patterns
- Improved installation and setup instructions

## [0.1.0] - 2025-01-25

### Added
- Initial release of BlobKit SDK
- Complete EIP-4844 blob transaction support
- KZG commitment implementation with trusted setup
- Blob encoding/decoding with compression
- Transaction construction and submission
- Blob verification and integrity checks
- Extensible codec system (JSON, raw binary)
- TypeScript support with comprehensive type definitions
- Comprehensive test suite with 91 tests
- Apache 2.0 license

### Security
- Input validation for all user-provided data
- Cryptographic operations using audited libraries
- No sensitive data exposure in error messages 
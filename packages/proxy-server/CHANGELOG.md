# Changelog

All notable changes to the BlobKit Proxy Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2024-07-30

### Added

- Express.js proxy server with production-ready middleware stack
- Payment verification against escrow smart contracts
- Blob execution using integrated BlobKit SDK
- OpenAPI 3.1 specification with Swagger UI documentation
- Rate limiting to prevent abuse
- Request validation with express-validator
- Structured logging with Winston
- CLI interface for server operations
- Health check endpoint with system status
- Error handling with standardized JSON responses

### Features

- **API Endpoints**: 
  - `/api/v1/health` - Health check and system status
  - `/api/v1/blob/write` - Blob storage with payment verification
- **Middleware**: Security headers, CORS, rate limiting, request logging
- **Services**: Payment verification and blob execution services
- **CLI Commands**: Server start, health check, configuration display
- **Deployment**: Docker support with environment-based configuration

### Security

- IP-based rate limiting
- Request size validation
- Input sanitization and validation
- Secure error responses (no information leakage)
- CORS and security headers

### Documentation

- Complete API documentation with OpenAPI 3.1
- Deployment guides for various platforms
- Configuration reference
- Troubleshooting guides

## [0.0.0] - 2024-07-29

### Added

- Initial project structure
- Basic Express.js setup 
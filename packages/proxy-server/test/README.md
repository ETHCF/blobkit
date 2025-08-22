# Proxy Server Test Suite

This directory contains minimal tests for the BlobKit proxy server. The proxy server functionality is primarily tested through integration tests at the system level.

## Test Structure

The proxy server tests have been minimized to focus on integration testing at the repository root level, as unit tests with fully mocked services provide limited value for a proxy service.

## Testing Strategy

The proxy server is tested through:

1. Full system integration tests that exercise the complete flow
2. Contract tests that verify escrow payment and job completion
3. Manual testing during deployment

## Future Testing

When infrastructure dependencies are available, tests should cover:

- Redis job queue persistence and recovery
- Circuit breaker behavior under load
- Rate limiting enforcement
- Signature verification with real contracts
- Blob transaction submission to test networks

# Changelog

All notable changes to the BlobKit Smart Contracts will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2024-07-30

### Added

- **BlobKitEscrow Contract**: Production-ready escrow system for blob storage payments
- **Foundry Integration**: Complete development and testing framework
- **Comprehensive Test Suite**: Unit tests, fuzz tests, and integration tests
- **Deployment Scripts**: Automated deployment with configuration support
- **TypeScript Integration**: ABI exports and utility functions for JavaScript integration

### Contract Features

- **Payment Management**: Secure escrow for blob storage payments
- **Proxy Authorization**: Role-based access control for authorized proxies
- **Fee Management**: Configurable proxy fees with owner controls
- **Job Lifecycle**: Creation, completion, and expiration handling
- **Replay Protection**: Prevents duplicate job completion
- **Emergency Controls**: Pause/unpause functionality and emergency withdrawals

### Security Features

- **OpenZeppelin Integration**: Inherits from audited contracts (Ownable, ReentrancyGuard, Pausable)
- **Custom Errors**: Gas-efficient error handling
- **Input Validation**: Comprehensive validation on all public functions
- **Access Control**: Multi-role permission system
- **Overflow Protection**: Built-in with Solidity 0.8.20

### Functions

- `depositForBlob(bytes32 jobId)` - Deposit payment for blob storage
- `completeJob(bytes32 jobId, bytes32 blobTxHash, bytes calldata proof)` - Mark job as completed
- `refundExpiredJob(bytes32 jobId)` - Refund expired jobs
- `setProxyAuthorization(address proxy, bool authorized)` - Manage proxy permissions
- `setProxyFee(uint256 feePercent)` - Set proxy fee percentage
- `setJobTimeout(uint256 timeout)` - Configure job expiration timeout

### Events

- `JobCreated(bytes32 indexed jobId, address indexed user, uint256 amount)`
- `JobCompleted(bytes32 indexed jobId, bytes32 blobTxHash, uint256 proxyFee)`
- `JobRefunded(bytes32 indexed jobId, string reason)`
- `ProxyAuthorizationChanged(address indexed proxy, bool authorized)`
- `ProxyFeeUpdated(address indexed proxy, uint256 oldFee, uint256 newFee)`
- `JobTimeoutUpdated(uint256 oldTimeout, uint256 newTimeout)`

### Testing

- 100% function coverage with Foundry tests
- Fuzz testing for robustness
- Integration tests with multiple scenarios
- Gas optimization verification

### Documentation

- Complete NatSpec documentation
- Integration guides for Ethers.js and Viem
- Deployment instructions for multiple networks
- Security considerations and audit preparation

## [0.0.0] - 2024-07-29

### Added

- Initial contract structure
- Basic escrow functionality 
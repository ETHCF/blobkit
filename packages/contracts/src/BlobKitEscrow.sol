// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title BlobKitEscrow
 * @notice Escrow contract for BlobKit blob storage payments
 * @dev Handles trustless payments for blob transaction execution
 *
 * Features:
 * - Job payment management with automatic refunds
 * - Proxy authorization and fee collection
 * - Configurable timeouts and replay protection
 * - Emergency pause functionality
 *
 * @author Zak Cole (zcole@linux.com)
 */
contract BlobKitEscrow is Ownable, ReentrancyGuard, Pausable {
    /*//////////////////////////////////////////////////////////////
                                CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Maximum proxy fee percentage (10%)
    uint256 public constant MAX_PROXY_FEE_PERCENT = 10;

    /// @notice Default job timeout (5 minutes)
    uint256 public constant DEFAULT_JOB_TIMEOUT = 5 minutes;

    /*//////////////////////////////////////////////////////////////
                                STORAGE
    //////////////////////////////////////////////////////////////*/

    /// @notice Job timeout duration in seconds
    uint256 public jobTimeout;

    /// @notice Mapping from proxy address to fee percentage
    mapping(address => uint256) public proxyFees;

    /// @notice Mapping from proxy address to authorization status
    mapping(address => bool) public authorizedProxies;

    /// @notice Job data structure
    struct Job {
        address user; // User who paid for the job
        uint256 amount; // Amount paid in wei
        bool completed; // Whether job has been completed
        uint256 timestamp; // When the job was created
        bytes32 blobTxHash; // Transaction hash of blob (set when completed)
    }

    /// @notice Mapping from job ID to job data
    mapping(bytes32 => Job) public jobs;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a new job is created with payment
    event JobCreated(bytes32 indexed jobId, address indexed user, uint256 amount);

    /// @notice Emitted when a job is completed by a proxy
    event JobCompleted(bytes32 indexed jobId, bytes32 blobTxHash, uint256 proxyFee);

    /// @notice Emitted when a job is refunded
    event JobRefunded(bytes32 indexed jobId, string reason);

    /// @notice Emitted when job timeout is updated
    event JobTimeoutUpdated(uint256 oldTimeout, uint256 newTimeout);

    /// @notice Emitted when a proxy is authorized or deauthorized
    event ProxyAuthorizationChanged(address indexed proxy, bool authorized);

    /// @notice Emitted when a proxy fee is updated
    event ProxyFeeUpdated(address indexed proxy, uint256 oldFee, uint256 newFee);

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error JobAlreadyExists();
    error JobNotFound();
    error JobAlreadyCompleted();
    error JobExpired();
    error JobNotExpired();
    error UnauthorizedProxy();
    error InvalidProxyFee();
    error InvalidJobTimeout();
    error InvalidProof();
    error TransferFailed();
    error ZeroAmount();

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Initialize the escrow contract
     * @param _owner Address of the contract owner
     */
    constructor(address _owner) {
        _transferOwnership(_owner);
        jobTimeout = DEFAULT_JOB_TIMEOUT;
    }

    /*//////////////////////////////////////////////////////////////
                            EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Deposit payment for a blob job
     * @param jobId Unique identifier for the job
     * @dev Creates a new job with payment. Job ID must be unique.
     */
    function depositForBlob(bytes32 jobId) external payable nonReentrant whenNotPaused {
        if (msg.value == 0) revert ZeroAmount();
        if (jobs[jobId].user != address(0)) revert JobAlreadyExists();

        jobs[jobId] = Job({
            user: msg.sender,
            amount: msg.value,
            completed: false,
            timestamp: block.timestamp,
            blobTxHash: bytes32(0)
        });

        emit JobCreated(jobId, msg.sender, msg.value);
    }

    /**
     * @notice Complete a job and claim payment (proxy only)
     * @param jobId Job identifier
     * @param blobTxHash Transaction hash of the blob
     * @param proof Cryptographic proof of job completion
     * @dev Only authorized proxies can complete jobs. Includes replay protection.
     */
    function completeJob(bytes32 jobId, bytes32 blobTxHash, bytes calldata proof) external nonReentrant whenNotPaused {
        if (!authorizedProxies[msg.sender]) revert UnauthorizedProxy();

        Job storage job = jobs[jobId];
        if (job.user == address(0)) revert JobNotFound();
        if (job.completed) revert JobAlreadyCompleted();

        // Check if job is still valid (not expired)
        if (block.timestamp > job.timestamp + jobTimeout) {
            revert JobExpired();
        }

        // Verify proof (simple signature verification)
        if (!_verifyProof(jobId, blobTxHash, proof, msg.sender)) {
            revert InvalidProof();
        }

        // Mark job as completed (replay protection)
        job.completed = true;
        job.blobTxHash = blobTxHash;

        // Calculate proxy fee
        uint256 proxyFeePercent = proxyFees[msg.sender];
        uint256 proxyFee = (job.amount * proxyFeePercent) / 100;

        // Transfer entire amount to proxy (proxy covers blob costs)
        (bool success,) = payable(msg.sender).call{value: job.amount}("");
        if (!success) revert TransferFailed();

        emit JobCompleted(jobId, blobTxHash, proxyFee);
    }

    /**
     * @notice Refund an expired job
     * @param jobId Job identifier
     * @dev Anyone can trigger refunds for expired jobs
     */
    function refundExpiredJob(bytes32 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        if (job.user == address(0)) revert JobNotFound();
        if (job.completed) revert JobAlreadyCompleted();

        // Check if job has expired
        if (block.timestamp <= job.timestamp + jobTimeout) {
            revert JobNotExpired();
        }

        // Mark job as completed to prevent double refunds
        job.completed = true;

        // Refund full amount to user
        (bool success,) = payable(job.user).call{value: job.amount}("");
        if (!success) revert TransferFailed();

        emit JobRefunded(jobId, "Job expired");
    }

    /**
     * @notice Set proxy fee percentage (proxy only)
     * @param percent Fee percentage (0-10)
     * @dev Only authorized proxies can set their own fees
     */
    function setProxyFee(uint256 percent) external {
        if (!authorizedProxies[msg.sender]) revert UnauthorizedProxy();
        if (percent > MAX_PROXY_FEE_PERCENT) revert InvalidProxyFee();

        uint256 oldFee = proxyFees[msg.sender];
        proxyFees[msg.sender] = percent;

        emit ProxyFeeUpdated(msg.sender, oldFee, percent);
    }

    /*//////////////////////////////////////////////////////////////
                            OWNER FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Set job timeout duration (owner only)
     * @param _timeout New timeout in seconds
     * @dev Minimum timeout is 1 minute, maximum is 24 hours
     */
    function setJobTimeout(uint256 _timeout) external onlyOwner {
        if (_timeout < 1 minutes || _timeout > 24 hours) {
            revert InvalidJobTimeout();
        }

        uint256 oldTimeout = jobTimeout;
        jobTimeout = _timeout;

        emit JobTimeoutUpdated(oldTimeout, _timeout);
    }

    /**
     * @notice Authorize or deauthorize a proxy (owner only)
     * @param proxy Proxy address
     * @param authorized Authorization status
     */
    function setProxyAuthorization(address proxy, bool authorized) external onlyOwner {
        authorizedProxies[proxy] = authorized;
        emit ProxyAuthorizationChanged(proxy, authorized);
    }

    /**
     * @notice Pause the contract (owner only)
     * @dev Prevents new deposits and job completions
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the contract (owner only)
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Emergency withdrawal (owner only)
     * @dev Only usable when contract is paused
     */
    function emergencyWithdraw() external onlyOwner whenPaused {
        uint256 balance = address(this).balance;
        (bool success,) = payable(owner()).call{value: balance}("");
        if (!success) revert TransferFailed();
    }

    /*//////////////////////////////////////////////////////////////
                             VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Get job timeout duration
     * @return Current job timeout in seconds
     */
    function getJobTimeout() external view returns (uint256) {
        return jobTimeout;
    }

    /**
     * @notice Check if a job exists and get its details
     * @param jobId Job identifier
     * @return job Job details
     */
    function getJob(bytes32 jobId) external view returns (Job memory job) {
        return jobs[jobId];
    }

    /**
     * @notice Check if a job is expired
     * @param jobId Job identifier
     * @return True if job is expired
     */
    function isJobExpired(bytes32 jobId) external view returns (bool) {
        Job memory job = jobs[jobId];
        if (job.user == address(0) || job.completed) return false;
        return block.timestamp > job.timestamp + jobTimeout;
    }

    /**
     * @notice Get proxy fee for a specific proxy
     * @param proxy Proxy address
     * @return Fee percentage
     */
    function getProxyFee(address proxy) external view returns (uint256) {
        return proxyFees[proxy];
    }

    /**
     * @notice Check if a proxy is authorized
     * @param proxy Proxy address
     * @return True if proxy is authorized
     */
    function isProxyAuthorized(address proxy) external view returns (bool) {
        return authorizedProxies[proxy];
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Verify job completion proof
     * @param jobId Job identifier
     * @param blobTxHash Blob transaction hash
     * @param proof Signature proof
     * @param signer Expected signer address
     * @return True if proof is valid
     * @dev Verifies signature includes proxy address to prevent cross-proxy claims
     */
    function _verifyProof(bytes32 jobId, bytes32 blobTxHash, bytes calldata proof, address signer)
        internal
        pure
        returns (bool)
    {
        if (proof.length != 65) return false;

        // Create message hash that includes the proxy address
        bytes32 messageHash = keccak256(abi.encodePacked(jobId, blobTxHash, signer));
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));

        // Extract signature components
        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := calldataload(proof.offset)
            s := calldataload(add(proof.offset, 0x20))
            v := byte(0, calldataload(add(proof.offset, 0x40)))
        }

        // Recover signer address
        address recoveredSigner = ecrecover(ethSignedMessageHash, v, r, s);
        return recoveredSigner == signer;
    }
}

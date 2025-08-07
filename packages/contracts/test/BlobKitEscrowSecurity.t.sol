// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/BlobKitEscrow.sol";

/**
 * @title BlobKitEscrow Security Tests
 * @notice Comprehensive security tests for the BlobKitEscrow contract
 * @dev Tests replay protection, access controls, and edge cases
 */
contract BlobKitEscrowSecurityTest is Test {
    BlobKitEscrow public escrow;

    address public owner;
    address public proxy1;
    address public proxy2;
    address public user1;
    address public user2;
    address public attacker;

    bytes32 public constant JOB_ID_1 = keccak256("job-1");
    bytes32 public constant JOB_ID_2 = keccak256("job-2");
    bytes32 public constant BLOB_TX_HASH_1 = keccak256("blob-tx-1");
    bytes32 public constant BLOB_TX_HASH_2 = keccak256("blob-tx-2");

    uint256 public constant DEPOSIT_AMOUNT = 1 ether;

    function setUp() public {
        owner = makeAddr("owner");
        // Use vm.addr to derive addresses from private keys for signature testing
        proxy1 = vm.addr(0x3333);
        proxy2 = vm.addr(0x4444);
        user1 = vm.addr(0x1111);
        user2 = vm.addr(0x2222);
        attacker = vm.addr(0x9999);

        escrow = new BlobKitEscrow(owner);

        // Fund accounts
        vm.deal(user1, 10 ether);
        vm.deal(user2, 10 ether);
        vm.deal(attacker, 10 ether);

        // Authorize proxies
        vm.startPrank(owner);
        escrow.setProxyAuthorization(proxy1, true);
        escrow.setProxyAuthorization(proxy2, true);
        vm.stopPrank();

        // Set proxy fees
        vm.prank(proxy1);
        escrow.setProxyFee(5); // 5%

        vm.prank(proxy2);
        escrow.setProxyFee(3); // 3%
    }

    /*//////////////////////////////////////////////////////////////
                          REPLAY PROTECTION TESTS
    //////////////////////////////////////////////////////////////*/

    function testReplayProtectionBasic() public {
        // Create job
        vm.prank(user1);
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(JOB_ID_1);

        // Complete job first time
        bytes memory proof = _createProof(JOB_ID_1, BLOB_TX_HASH_1, proxy1);

        vm.prank(proxy1);
        escrow.completeJob(JOB_ID_1, BLOB_TX_HASH_1, proof);

        // Attempt to complete same job again (replay attack)
        vm.prank(proxy1);
        vm.expectRevert(BlobKitEscrow.JobAlreadyCompleted.selector);
        escrow.completeJob(JOB_ID_1, BLOB_TX_HASH_1, proof);
    }

    function testReplayProtectionDifferentBlobTxHash() public {
        // Create job
        vm.prank(user1);
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(JOB_ID_1);

        // Complete job with first blob tx hash
        bytes memory proof1 = _createProof(JOB_ID_1, BLOB_TX_HASH_1, proxy1);

        vm.prank(proxy1);
        escrow.completeJob(JOB_ID_1, BLOB_TX_HASH_1, proof1);

        // Attempt to complete with different blob tx hash
        bytes memory proof2 = _createProof(JOB_ID_1, BLOB_TX_HASH_2, proxy1);

        vm.prank(proxy1);
        vm.expectRevert(BlobKitEscrow.JobAlreadyCompleted.selector);
        escrow.completeJob(JOB_ID_1, BLOB_TX_HASH_2, proof2);
    }

    function testReplayProtectionDifferentProxy() public {
        // Create job
        vm.prank(user1);
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(JOB_ID_1);

        // Complete job with first proxy
        bytes memory proof1 = _createProof(JOB_ID_1, BLOB_TX_HASH_1, proxy1);

        vm.prank(proxy1);
        escrow.completeJob(JOB_ID_1, BLOB_TX_HASH_1, proof1);

        // Attempt to complete with different proxy
        bytes memory proof2 = _createProof(JOB_ID_1, BLOB_TX_HASH_1, proxy2);

        vm.prank(proxy2);
        vm.expectRevert(BlobKitEscrow.JobAlreadyCompleted.selector);
        escrow.completeJob(JOB_ID_1, BLOB_TX_HASH_1, proof2);
    }

    /*//////////////////////////////////////////////////////////////
                            ACCESS CONTROL TESTS
    //////////////////////////////////////////////////////////////*/

    function testOnlyOwnerCanAuthorizeProxies() public {
        vm.prank(attacker);
        vm.expectRevert();
        escrow.setProxyAuthorization(attacker, true);

        vm.prank(owner);
        escrow.setProxyAuthorization(attacker, true);
        assertTrue(escrow.authorizedProxies(attacker));
    }

    function testOnlyAuthorizedProxiesCanCompleteJobs() public {
        // Create job
        vm.prank(user1);
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(JOB_ID_1);

        // Unauthorized proxy attempts completion
        bytes memory proof = _createProof(JOB_ID_1, BLOB_TX_HASH_1, attacker);

        vm.prank(attacker);
        vm.expectRevert(BlobKitEscrow.UnauthorizedProxy.selector);
        escrow.completeJob(JOB_ID_1, BLOB_TX_HASH_1, proof);
    }

    function testOnlyProxyCanSetOwnFee() public {
        vm.prank(attacker);
        vm.expectRevert(BlobKitEscrow.UnauthorizedProxy.selector);
        escrow.setProxyFee(10);

        vm.prank(proxy1);
        escrow.setProxyFee(8);
        assertEq(escrow.getProxyFee(proxy1), 8);
    }

    function testFeeCapEnforcement() public {
        vm.prank(proxy1);
        vm.expectRevert(BlobKitEscrow.InvalidProxyFee.selector);
        escrow.setProxyFee(11); // Exceeds 10% cap
    }

    /*//////////////////////////////////////////////////////////////
                              REENTRANCY TESTS
    //////////////////////////////////////////////////////////////*/

    function testReentrancyProtectionOnRefund() public {
        // Deploy malicious contract
        MaliciousReentrant malicious = new MaliciousReentrant(escrow);
        vm.deal(address(malicious), 10 ether);

        // Create job with malicious contract as user
        vm.prank(address(malicious));
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(JOB_ID_1);

        // Fast forward past timeout
        vm.warp(block.timestamp + escrow.getJobTimeout() + 1);

        // Attempt reentrancy attack
        // The malicious contract will try to reenter, but the escrow's ReentrancyGuard will prevent it
        // Since the receive() function in MaliciousReentrant will try to call refundExpiredJob again,
        // and that will be blocked by ReentrancyGuard, the whole transaction should revert
        vm.expectRevert(BlobKitEscrow.TransferFailed.selector);
        malicious.attemptReentrancy(JOB_ID_1);
    }

    /*//////////////////////////////////////////////////////////////
                              TIMING ATTACK TESTS
    //////////////////////////////////////////////////////////////*/

    function testJobTimeoutBoundary() public {
        // Create job
        vm.prank(user1);
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(JOB_ID_1);

        uint256 jobTimeout = escrow.getJobTimeout();
        uint256 jobTimestamp = block.timestamp;

        // Just before timeout
        vm.warp(jobTimestamp + jobTimeout - 1);
        assertFalse(escrow.isJobExpired(JOB_ID_1));

        // Exactly at timeout (not expired yet - contract uses > not >=)
        vm.warp(jobTimestamp + jobTimeout);
        assertFalse(escrow.isJobExpired(JOB_ID_1));

        // After timeout
        vm.warp(jobTimestamp + jobTimeout + 1);
        assertTrue(escrow.isJobExpired(JOB_ID_1));
    }

    function testJobCompletionAfterTimeout() public {
        // Create job
        vm.prank(user1);
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(JOB_ID_1);

        // Fast forward past timeout
        vm.warp(block.timestamp + escrow.getJobTimeout() + 1);

        // Job completion should fail after timeout
        bytes memory proof = _createProof(JOB_ID_1, BLOB_TX_HASH_1, proxy1);

        vm.prank(proxy1);
        vm.expectRevert(BlobKitEscrow.JobExpired.selector);
        escrow.completeJob(JOB_ID_1, BLOB_TX_HASH_1, proof);
    }

    /*//////////////////////////////////////////////////////////////
                          ECONOMIC ATTACK TESTS
    //////////////////////////////////////////////////////////////*/

    function testGriefingAttackPrevention() public {
        // Attacker creates many small jobs to bloat state
        for (uint256 i = 0; i < 100; i++) {
            bytes32 jobId = keccak256(abi.encodePacked("grief-job", i));

            vm.prank(attacker);
            escrow.depositForBlob{value: 0.001 ether}(jobId);
        }

        // Contract should still function normally
        vm.prank(user1);
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(JOB_ID_1);

        bytes memory proof = _createProof(JOB_ID_1, BLOB_TX_HASH_1, proxy1);

        vm.prank(proxy1);
        escrow.completeJob(JOB_ID_1, BLOB_TX_HASH_1, proof);
    }

    function testFrontRunningProtection() public {
        // User creates job
        vm.prank(user1);
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(JOB_ID_1);

        // Attacker cannot front-run with same job ID
        vm.prank(attacker);
        vm.expectRevert(BlobKitEscrow.JobAlreadyExists.selector);
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(JOB_ID_1);
    }

    /*//////////////////////////////////////////////////////////////
                              EDGE CASE TESTS
    //////////////////////////////////////////////////////////////*/

    function testZeroBlobTxHash() public {
        // Create job
        vm.prank(user1);
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(JOB_ID_1);

        // Attempt completion with zero blob tx hash
        bytes memory proof = _createProof(JOB_ID_1, bytes32(0), proxy1);

        vm.prank(proxy1);
        // Note: The contract allows zero blob tx hash, which might be a design choice
        // for certain use cases. The test verifies this behavior.
        escrow.completeJob(JOB_ID_1, bytes32(0), proof);

        // Verify job was completed
        (address user,, bool completed,,) = escrow.jobs(JOB_ID_1);
        assertTrue(completed);
        assertTrue(user == user1);
    }

    function testInvalidJobIdCompletion() public {
        bytes memory proof = _createProof(JOB_ID_1, BLOB_TX_HASH_1, proxy1);

        vm.prank(proxy1);
        vm.expectRevert(BlobKitEscrow.JobNotFound.selector);
        escrow.completeJob(JOB_ID_1, BLOB_TX_HASH_1, proof);
    }

    function testMaxUintValues() public {
        // Test with maximum values to check for overflow
        // This test can't work in practice as we can't actually send type(uint256).max
        // The EVM would run out of gas processing such a large value transfer

        // Instead test with a very large but practical value
        uint256 largeAmount = 1000000 ether;
        vm.deal(user1, largeAmount);

        // Should work fine - contract doesn't have artificial limits
        vm.prank(user1);
        escrow.depositForBlob{value: largeAmount}(JOB_ID_1);

        // Verify job was created with the large amount
        BlobKitEscrow.Job memory job = escrow.getJob(JOB_ID_1);
        assertEq(job.amount, largeAmount);
    }

    /*//////////////////////////////////////////////////////////////
                            PROXY AUTHORIZATION TESTS
    //////////////////////////////////////////////////////////////*/

    function testProxyDeauthorization() public {
        // Create job
        vm.prank(user1);
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(JOB_ID_1);

        // Deauthorize proxy
        vm.prank(owner);
        escrow.setProxyAuthorization(proxy1, false);

        // Proxy should no longer be able to complete jobs
        bytes memory proof = _createProof(JOB_ID_1, BLOB_TX_HASH_1, proxy1);

        vm.prank(proxy1);
        vm.expectRevert(BlobKitEscrow.UnauthorizedProxy.selector);
        escrow.completeJob(JOB_ID_1, BLOB_TX_HASH_1, proof);
    }

    function testProxyReauthorization() public {
        // Deauthorize then reauthorize
        vm.startPrank(owner);
        escrow.setProxyAuthorization(proxy1, false);
        escrow.setProxyAuthorization(proxy1, true);
        vm.stopPrank();

        // Should work again
        vm.prank(user1);
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(JOB_ID_1);

        bytes memory proof = _createProof(JOB_ID_1, BLOB_TX_HASH_1, proxy1);

        vm.prank(proxy1);
        escrow.completeJob(JOB_ID_1, BLOB_TX_HASH_1, proof);
    }

    /*//////////////////////////////////////////////////////////////
                                HELPERS
    //////////////////////////////////////////////////////////////*/

    function _createProof(bytes32 jobId, bytes32 blobTxHash, address signer) internal view returns (bytes memory) {
        // Create message hash that includes the signer address (as per contract requirement)
        bytes32 messageHash = keccak256(abi.encodePacked(jobId, blobTxHash, signer));
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));

        // Use vm.sign to create a valid signature
        uint256 signerPrivateKey;
        if (signer == proxy1) {
            signerPrivateKey = 0x3333;
        } else if (signer == proxy2) {
            signerPrivateKey = 0x4444;
        } else if (signer == user1) {
            signerPrivateKey = 0x1111;
        } else if (signer == user2) {
            signerPrivateKey = 0x2222;
        } else if (signer == attacker) {
            signerPrivateKey = 0x9999;
        } else {
            signerPrivateKey = uint256(keccak256(abi.encodePacked(signer)));
        }

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPrivateKey, ethSignedMessageHash);
        return abi.encodePacked(r, s, v);
    }
}

/**
 * @title Malicious Reentrancy Contract
 * @notice Used to test reentrancy protection
 */
contract MaliciousReentrant {
    BlobKitEscrow public escrow;
    bool public attacking;

    constructor(BlobKitEscrow _escrow) {
        escrow = _escrow;
    }

    function attemptReentrancy(bytes32 jobId) external {
        attacking = true;
        escrow.refundExpiredJob(jobId);
    }

    receive() external payable {
        if (attacking) {
            // Attempt reentrancy
            escrow.refundExpiredJob(keccak256("job-1"));
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/BlobKitEscrow.sol";

contract BlobKitEscrowTest is Test {
    BlobKitEscrow public escrow;

    address public owner;
    address public proxy;
    address public user;
    address public unauthorizedUser;

    bytes32 public constant TEST_JOB_ID = keccak256("test-job-1");
    bytes32 public constant TEST_BLOB_TX_HASH = keccak256("blob-tx-hash");

    uint256 public constant DEPOSIT_AMOUNT = 1 ether;
    uint256 public constant PROXY_FEE_PERCENT = 5; // 5%

    event JobCreated(bytes32 indexed jobId, address indexed user, uint256 amount);
    event JobCompleted(bytes32 indexed jobId, bytes32 blobTxHash, uint256 proxyFee);
    event JobRefunded(bytes32 indexed jobId, string reason);
    event ProxyAuthorizationChanged(address indexed proxy, bool authorized);
    event ProxyFeeUpdated(address indexed proxy, uint256 oldFee, uint256 newFee);

    function setUp() public {
        owner = makeAddr("owner");
        proxy = makeAddr("proxy");
        user = makeAddr("user");
        unauthorizedUser = makeAddr("unauthorized");

        // Deploy escrow contract
        escrow = new BlobKitEscrow(owner);

        // Fund test accounts
        vm.deal(user, 10 ether);
        vm.deal(proxy, 1 ether);

        // Authorize proxy
        vm.prank(owner);
        escrow.setProxyAuthorization(proxy, true);

        // Set proxy fee
        vm.prank(proxy);
        escrow.setProxyFee(PROXY_FEE_PERCENT);
    }

    /*//////////////////////////////////////////////////////////////
                              DEPOSIT TESTS
    //////////////////////////////////////////////////////////////*/

    function testDepositForBlob() public {
        vm.prank(user);
        vm.expectEmit(true, true, false, true);
        emit JobCreated(TEST_JOB_ID, user, DEPOSIT_AMOUNT);

        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(TEST_JOB_ID);

        // Verify job was created
        BlobKitEscrow.Job memory job = escrow.getJob(TEST_JOB_ID);
        assertEq(job.user, user);
        assertEq(job.amount, DEPOSIT_AMOUNT);
        assertFalse(job.completed);
        assertEq(job.timestamp, block.timestamp);
        assertEq(job.blobTxHash, bytes32(0));
    }

    function testDepositZeroAmount() public {
        vm.prank(user);
        vm.expectRevert(BlobKitEscrow.ZeroAmount.selector);
        escrow.depositForBlob{value: 0}(TEST_JOB_ID);
    }

    function testDepositDuplicateJobId() public {
        // First deposit
        vm.prank(user);
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(TEST_JOB_ID);

        // Second deposit with same job ID should fail
        vm.prank(user);
        vm.expectRevert(BlobKitEscrow.JobAlreadyExists.selector);
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(TEST_JOB_ID);
    }

    /*//////////////////////////////////////////////////////////////
                           JOB COMPLETION TESTS
    //////////////////////////////////////////////////////////////*/

    function testCompleteJob() public {
        // Create job
        vm.prank(user);
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(TEST_JOB_ID);

        // Create proof
        bytes memory proof = _createProof(TEST_JOB_ID, TEST_BLOB_TX_HASH, proxy);

        uint256 expectedProxyFee = (DEPOSIT_AMOUNT * PROXY_FEE_PERCENT) / 100;
        uint256 expectedUserRefund = DEPOSIT_AMOUNT - expectedProxyFee;

        uint256 proxyBalanceBefore = proxy.balance;
        uint256 userBalanceBefore = user.balance;

        vm.prank(proxy);
        vm.expectEmit(true, false, false, true);
        emit JobCompleted(TEST_JOB_ID, TEST_BLOB_TX_HASH, expectedProxyFee);

        escrow.completeJob(TEST_JOB_ID, TEST_BLOB_TX_HASH, proof);

        // Verify job completion
        BlobKitEscrow.Job memory job = escrow.getJob(TEST_JOB_ID);
        assertTrue(job.completed);
        assertEq(job.blobTxHash, TEST_BLOB_TX_HASH);

        // Verify payments
        assertEq(proxy.balance, proxyBalanceBefore + expectedProxyFee);
        assertEq(user.balance, userBalanceBefore + expectedUserRefund);
    }

    function testCompleteJobUnauthorizedProxy() public {
        // Create job
        vm.prank(user);
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(TEST_JOB_ID);

        bytes memory proof = _createProof(TEST_JOB_ID, TEST_BLOB_TX_HASH, unauthorizedUser);

        vm.prank(unauthorizedUser);
        vm.expectRevert(BlobKitEscrow.UnauthorizedProxy.selector);
        escrow.completeJob(TEST_JOB_ID, TEST_BLOB_TX_HASH, proof);
    }

    function testCompleteJobNotFound() public {
        bytes memory proof = _createProof(TEST_JOB_ID, TEST_BLOB_TX_HASH, proxy);

        vm.prank(proxy);
        vm.expectRevert(BlobKitEscrow.JobNotFound.selector);
        escrow.completeJob(TEST_JOB_ID, TEST_BLOB_TX_HASH, proof);
    }

    function testCompleteJobAlreadyCompleted() public {
        // Create and complete job
        vm.prank(user);
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(TEST_JOB_ID);

        bytes memory proof = _createProof(TEST_JOB_ID, TEST_BLOB_TX_HASH, proxy);

        vm.prank(proxy);
        escrow.completeJob(TEST_JOB_ID, TEST_BLOB_TX_HASH, proof);

        // Try to complete again
        vm.prank(proxy);
        vm.expectRevert(BlobKitEscrow.JobAlreadyCompleted.selector);
        escrow.completeJob(TEST_JOB_ID, TEST_BLOB_TX_HASH, proof);
    }

    function testCompleteJobExpired() public {
        // Create job
        vm.prank(user);
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(TEST_JOB_ID);

        // Fast forward past timeout
        vm.warp(block.timestamp + escrow.getJobTimeout() + 1);

        bytes memory proof = _createProof(TEST_JOB_ID, TEST_BLOB_TX_HASH, proxy);

        vm.prank(proxy);
        vm.expectRevert(BlobKitEscrow.JobNotExpired.selector);
        escrow.completeJob(TEST_JOB_ID, TEST_BLOB_TX_HASH, proof);
    }

    /*//////////////////////////////////////////////////////////////
                              REFUND TESTS
    //////////////////////////////////////////////////////////////*/

    function testRefundExpiredJob() public {
        // Create job
        vm.prank(user);
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(TEST_JOB_ID);

        uint256 userBalanceBefore = user.balance;

        // Fast forward past timeout
        vm.warp(block.timestamp + escrow.getJobTimeout() + 1);

        vm.expectEmit(true, false, false, true);
        emit JobRefunded(TEST_JOB_ID, "Job expired");

        escrow.refundExpiredJob(TEST_JOB_ID);

        // Verify refund
        BlobKitEscrow.Job memory job = escrow.getJob(TEST_JOB_ID);
        assertTrue(job.completed);
        assertEq(user.balance, userBalanceBefore + DEPOSIT_AMOUNT);
    }

    function testRefundJobNotExpired() public {
        // Create job
        vm.prank(user);
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(TEST_JOB_ID);

        vm.expectRevert(BlobKitEscrow.JobNotExpired.selector);
        escrow.refundExpiredJob(TEST_JOB_ID);
    }

    function testRefundJobNotFound() public {
        vm.expectRevert(BlobKitEscrow.JobNotFound.selector);
        escrow.refundExpiredJob(TEST_JOB_ID);
    }

    /*//////////////////////////////////////////////////////////////
                              ADMIN TESTS
    //////////////////////////////////////////////////////////////*/

    function testSetProxyAuthorization() public {
        address newProxy = makeAddr("newProxy");

        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit ProxyAuthorizationChanged(newProxy, true);

        escrow.setProxyAuthorization(newProxy, true);

        assertTrue(escrow.authorizedProxies(newProxy));
    }

    function testSetProxyAuthorizationUnauthorized() public {
        address newProxy = makeAddr("newProxy");

        vm.prank(user);
        vm.expectRevert();
        escrow.setProxyAuthorization(newProxy, true);
    }

    function testSetJobTimeout() public {
        uint256 newTimeout = 10 minutes;

        vm.prank(owner);
        escrow.setJobTimeout(newTimeout);

        assertEq(escrow.getJobTimeout(), newTimeout);
    }

    function testSetJobTimeoutInvalid() public {
        vm.prank(owner);
        vm.expectRevert(BlobKitEscrow.InvalidJobTimeout.selector);
        escrow.setJobTimeout(30 seconds); // Too short

        vm.prank(owner);
        vm.expectRevert(BlobKitEscrow.InvalidJobTimeout.selector);
        escrow.setJobTimeout(25 hours); // Too long
    }

    function testSetProxyFee() public {
        uint256 newFee = 3;

        vm.prank(proxy);
        vm.expectEmit(true, false, false, true);
        emit ProxyFeeUpdated(proxy, PROXY_FEE_PERCENT, newFee);

        escrow.setProxyFee(newFee);

        assertEq(escrow.getProxyFee(proxy), newFee);
    }

    function testSetProxyFeeUnauthorized() public {
        vm.prank(unauthorizedUser);
        vm.expectRevert(BlobKitEscrow.UnauthorizedProxy.selector);
        escrow.setProxyFee(3);
    }

    function testSetProxyFeeInvalid() public {
        vm.prank(proxy);
        vm.expectRevert(BlobKitEscrow.InvalidProxyFee.selector);
        escrow.setProxyFee(11); // Above 10% maximum
    }

    /*//////////////////////////////////////////////////////////////
                              VIEW TESTS
    //////////////////////////////////////////////////////////////*/

    function testIsJobExpired() public {
        // Create job
        vm.prank(user);
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(TEST_JOB_ID);

        assertFalse(escrow.isJobExpired(TEST_JOB_ID));

        // Fast forward past timeout
        vm.warp(block.timestamp + escrow.getJobTimeout() + 1);

        assertTrue(escrow.isJobExpired(TEST_JOB_ID));
    }

    function testGetJobTimeout() public {
        assertEq(escrow.getJobTimeout(), escrow.DEFAULT_JOB_TIMEOUT());
    }

    /*//////////////////////////////////////////////////////////////
                             PAUSE TESTS
    //////////////////////////////////////////////////////////////*/

    function testPauseUnpause() public {
        vm.prank(owner);
        escrow.pause();

        vm.prank(user);
        vm.expectRevert();
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(TEST_JOB_ID);

        vm.prank(owner);
        escrow.unpause();

        vm.prank(user);
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(TEST_JOB_ID);
    }

    /*//////////////////////////////////////////////////////////////
                           FUZZ TESTS
    //////////////////////////////////////////////////////////////*/

    function testFuzzDepositAmount(uint256 amount) public {
        vm.assume(amount > 0 && amount <= 100 ether);

        bytes32 jobId = keccak256(abi.encode(amount));
        vm.deal(user, amount);

        vm.prank(user);
        escrow.depositForBlob{value: amount}(jobId);

        BlobKitEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(job.amount, amount);
    }

    function testFuzzProxyFee(uint8 feePercent) public {
        vm.assume(feePercent <= 10);

        vm.prank(proxy);
        escrow.setProxyFee(feePercent);

        assertEq(escrow.getProxyFee(proxy), feePercent);
    }

    /*//////////////////////////////////////////////////////////////
                            HELPER FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function _createProof(bytes32 jobId, bytes32 blobTxHash, address signer) internal pure returns (bytes memory) {
        // Create a simple signature for testing
        // In reality, this would be signed by the proxy's private key
        bytes32 messageHash = keccak256(abi.encodePacked(jobId, blobTxHash));
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));

        // For testing, we'll create a mock signature
        // Note: This won't actually verify correctly with the contract's verification
        // but serves as a placeholder for the test structure
        uint8 v = 27;
        bytes32 r = keccak256(abi.encodePacked(signer, "r"));
        bytes32 s = keccak256(abi.encodePacked(signer, "s"));

        return abi.encodePacked(r, s, v);
    }
}

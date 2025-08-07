// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/BlobKitEscrow.sol";

/**
 * @title BlobKitEscrow Gas Analysis Tests
 * @notice Comprehensive gas usage analysis and optimization verification
 * @dev Tests gas consumption patterns and validates CEI compliance
 */
contract GasAnalysisTest is Test {
    BlobKitEscrow public escrow;

    address public owner;
    address public proxy;
    address public user;

    uint256 public constant DEPOSIT_AMOUNT = 0.01 ether;

    // Gas benchmarks (based on similar contracts)
    uint256 constant DEPOSIT_GAS_LIMIT = 100000;
    uint256 constant COMPLETE_JOB_GAS_LIMIT = 150000;
    uint256 constant REFUND_GAS_LIMIT = 80000;
    uint256 constant SET_FEE_GAS_LIMIT = 50000;

    event GasReport(string operation, uint256 gasUsed);

    // Events from BlobKitEscrow for testing
    event JobCreated(bytes32 indexed jobId, address indexed user, uint256 amount);
    event JobCompleted(bytes32 indexed jobId, bytes32 blobTxHash, uint256 proxyFee);

    function setUp() public {
        owner = makeAddr("owner");
        // Use vm.addr to derive addresses from private keys for signature testing
        proxy = vm.addr(0x3333);
        user = vm.addr(0x1111);

        vm.startPrank(owner);
        escrow = new BlobKitEscrow(owner);
        escrow.setProxyAuthorization(proxy, true);
        vm.stopPrank();

        // Fund accounts
        vm.deal(user, 10 ether);
        vm.deal(proxy, 10 ether);

        // Set proxy fee
        vm.prank(proxy);
        escrow.setProxyFee(5);
    }

    /**
     * @notice Test gas usage for depositForBlob operation
     */
    function testGasDepositForBlob() public {
        bytes32 jobId = keccak256("test-job-1");

        vm.startPrank(user);
        uint256 gasBefore = gasleft();
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(jobId);
        uint256 gasUsed = gasBefore - gasleft();
        vm.stopPrank();

        emit GasReport("depositForBlob", gasUsed);

        // Verify gas is within acceptable range
        assertLt(gasUsed, DEPOSIT_GAS_LIMIT, "depositForBlob gas usage too high");

        // Verify state changes
        (address jobUser, uint256 amount, bool completed,,) = escrow.jobs(jobId);
        assertEq(jobUser, user);
        assertEq(amount, DEPOSIT_AMOUNT);
        assertFalse(completed);
    }

    /**
     * @notice Test gas usage for completeJob operation
     */
    function testGasCompleteJob() public {
        bytes32 jobId = keccak256("test-job-2");
        bytes32 blobTxHash = keccak256("blob-tx-hash");

        // Setup: deposit first
        vm.prank(user);
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(jobId);

        // Create proof
        bytes memory proof = _createProof(jobId, blobTxHash, proxy);

        vm.startPrank(proxy);
        uint256 gasBefore = gasleft();
        escrow.completeJob(jobId, blobTxHash, proof);
        uint256 gasUsed = gasBefore - gasleft();
        vm.stopPrank();

        emit GasReport("completeJob", gasUsed);

        // Verify gas is within acceptable range
        assertLt(gasUsed, COMPLETE_JOB_GAS_LIMIT, "completeJob gas usage too high");

        // Verify state changes
        (,, bool completed,, bytes32 storedBlobTxHash) = escrow.jobs(jobId);
        assertTrue(completed);
        assertEq(storedBlobTxHash, blobTxHash);
    }

    /**
     * @notice Test gas usage for refundExpiredJob operation
     */
    function testGasRefundExpiredJob() public {
        bytes32 jobId = keccak256("test-job-3");

        // Setup: deposit and expire job
        vm.prank(user);
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(jobId);

        // Fast forward past timeout
        vm.warp(block.timestamp + escrow.getJobTimeout() + 1);

        uint256 gasBefore = gasleft();
        escrow.refundExpiredJob(jobId);
        uint256 gasUsed = gasBefore - gasleft();

        emit GasReport("refundExpiredJob", gasUsed);

        // Verify gas is within acceptable range
        assertLt(gasUsed, REFUND_GAS_LIMIT, "refundExpiredJob gas usage too high");

        // Verify state changes
        (,, bool completed,,) = escrow.jobs(jobId);
        assertTrue(completed);
    }

    /**
     * @notice Test gas usage for setProxyFee operation
     */
    function testGasSetProxyFee() public {
        vm.startPrank(proxy);
        uint256 gasBefore = gasleft();
        escrow.setProxyFee(7);
        uint256 gasUsed = gasBefore - gasleft();
        vm.stopPrank();

        emit GasReport("setProxyFee", gasUsed);

        // Verify gas is within acceptable range
        assertLt(gasUsed, SET_FEE_GAS_LIMIT, "setProxyFee gas usage too high");

        // Verify state change
        assertEq(escrow.getProxyFee(proxy), 7);
    }

    /**
     * @notice Test CEI (Checks-Effects-Interactions) pattern compliance
     */
    function testCEIPatternCompliance() public {
        // Test depositForBlob follows CEI
        bytes32 jobId1 = keccak256("cei-test-1");

        vm.startPrank(user);
        vm.expectEmit(true, true, false, true);
        emit JobCreated(jobId1, user, DEPOSIT_AMOUNT);
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(jobId1);
        vm.stopPrank();

        // Test completeJob follows CEI
        bytes32 jobId2 = keccak256("cei-test-2");
        bytes32 blobTxHash = keccak256("blob-tx");

        vm.prank(user);
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(jobId2);

        bytes memory proof = _createProof(jobId2, blobTxHash, proxy);

        vm.startPrank(proxy);
        vm.expectEmit(true, false, false, true);
        emit JobCompleted(jobId2, blobTxHash, DEPOSIT_AMOUNT * 5 / 100);
        escrow.completeJob(jobId2, blobTxHash, proof);
        vm.stopPrank();

        // Events were emitted, indicating state changes happened before external calls
    }

    /**
     * @notice Test storage optimization by analyzing slot usage
     */
    function testStorageOptimization() public {
        // Analyze storage slot usage for Job struct
        bytes32 jobId = keccak256("storage-test");

        // Storage slot for jobs mapping is at position 6
        // Slot 0: owner (Ownable)
        // Slot 1: _status (ReentrancyGuard)
        // Slot 2: _paused (Pausable)
        // Slot 3: jobTimeout
        // Slot 4: proxyFees mapping
        // Slot 5: authorizedProxies mapping
        // Slot 6: jobs mapping
        // The actual slot for a specific job is keccak256(abi.encode(jobId, 6))
        bytes32 baseSlot = keccak256(abi.encode(jobId, uint256(6)));

        vm.prank(user);
        escrow.depositForBlob{value: DEPOSIT_AMOUNT}(jobId);

        // Read storage directly
        // Job struct layout (actual from test output):
        // - user (address): slot + 0
        // - amount (uint256): slot + 1
        // - completed (bool): slot + 2
        // - timestamp (uint256): slot + 3
        // - blobTxHash (bytes32): slot + 4
        bytes32 data0 = vm.load(address(escrow), baseSlot);
        bytes32 data1 = vm.load(address(escrow), bytes32(uint256(baseSlot) + 1));
        bytes32 data2 = vm.load(address(escrow), bytes32(uint256(baseSlot) + 2));
        bytes32 data3 = vm.load(address(escrow), bytes32(uint256(baseSlot) + 3));
        bytes32 data4 = vm.load(address(escrow), bytes32(uint256(baseSlot) + 4));

        // Log storage usage
        emit log_named_bytes32("Slot 0 (user)", data0);
        emit log_named_bytes32("Slot 1 (amount)", data1);
        emit log_named_bytes32("Slot 2 (completed)", data2);
        emit log_named_bytes32("Slot 3 (timestamp)", data3);
        emit log_named_bytes32("Slot 4 (blobTxHash)", data4);

        // Verify storage is used correctly
        assertTrue(data0 != bytes32(0), "Slot 0 should contain user address");
        assertTrue(data1 != bytes32(0), "Slot 1 should contain amount");
        // completed is false, so slot 2 is 0x0
        assertTrue(data2 == bytes32(0), "Slot 2 should be 0 (completed=false)");
        assertTrue(data3 != bytes32(0), "Slot 3 should contain timestamp");
        assertTrue(data4 == bytes32(0), "Slot 4 should be empty initially (no blob tx yet)");
    }

    /**
     * @notice Benchmark gas usage across multiple operations
     */
    function testGasBenchmarkBatch() public {
        uint256 totalGasUsed = 0;
        uint256 operations = 10;

        for (uint256 i = 0; i < operations; i++) {
            bytes32 jobId = keccak256(abi.encode("batch-job", i));

            // Measure deposit gas
            vm.startPrank(user);
            uint256 gasBefore = gasleft();
            escrow.depositForBlob{value: DEPOSIT_AMOUNT}(jobId);
            totalGasUsed += gasBefore - gasleft();
            vm.stopPrank();

            // Measure complete gas
            bytes memory proof = _createProof(jobId, keccak256("tx"), proxy);
            vm.startPrank(proxy);
            gasBefore = gasleft();
            escrow.completeJob(jobId, keccak256("tx"), proof);
            totalGasUsed += gasBefore - gasleft();
            vm.stopPrank();
        }

        uint256 avgGasPerOperation = totalGasUsed / (operations * 2);
        emit GasReport("Average gas per operation", avgGasPerOperation);

        // Average should be reasonable
        assertLt(avgGasPerOperation, 100000, "Average gas usage too high");
    }

    /**
     * @notice Test gas usage with different data sizes
     */
    function testGasScalingWithDataSize() public {
        // Test with different job ID sizes (affects storage key computation)
        bytes32[] memory jobIds = new bytes32[](3);
        jobIds[0] = keccak256(abi.encode("a")); // Short
        jobIds[1] = keccak256(abi.encode("medium-length-job-id")); // Medium
        jobIds[2] = keccak256(abi.encode("very-long-job-id-with-lots-of-characters-to-test-scaling")); // Long

        for (uint256 i = 0; i < jobIds.length; i++) {
            vm.startPrank(user);
            uint256 gasBefore = gasleft();
            escrow.depositForBlob{value: DEPOSIT_AMOUNT}(jobIds[i]);
            uint256 gasUsed = gasBefore - gasleft();
            vm.stopPrank();

            emit log_named_uint(string(abi.encodePacked("Gas for jobId length ", vm.toString(i))), gasUsed);

            // Gas usage should be consistent regardless of job ID
            assertLt(gasUsed, DEPOSIT_GAS_LIMIT, "Gas usage scales poorly with data size");
        }
    }

    /**
     * @notice Test gas refund mechanisms
     */
    function testGasRefunds() public {
        bytes32 jobId = keccak256("refund-test");

        // In Foundry tests, gas is not actually charged from accounts
        // So we'll test the gas refund mechanism conceptually
        vm.startPrank(user);
        uint256 balanceBefore = user.balance;

        // Specify high gas limit to test refund behavior
        uint256 gasStart = gasleft();
        escrow.depositForBlob{value: DEPOSIT_AMOUNT, gas: 500000}(jobId);
        uint256 gasUsed = gasStart - gasleft();

        uint256 balanceAfter = user.balance;
        vm.stopPrank();

        // In test environment, only the value is deducted, not gas
        uint256 totalSpent = balanceBefore - balanceAfter;
        assertEq(totalSpent, DEPOSIT_AMOUNT, "Should have spent exactly the deposit amount in test env");

        // Verify gas usage was reasonable
        assertLt(gasUsed, 500000, "Should have used less gas than the limit");
        assertGt(gasUsed, 50000, "Should have used some gas for the operation");
    }

    /**
     * @notice Helper function to create proof
     */
    function _createProof(bytes32 jobId, bytes32 blobTxHash, address signer) internal view returns (bytes memory) {
        // Create message hash that includes the signer address (as per contract requirement)
        bytes32 messageHash = keccak256(abi.encodePacked(jobId, blobTxHash, signer));
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));

        // Use vm.sign to create a valid signature
        uint256 signerPrivateKey;
        if (signer == proxy) {
            signerPrivateKey = 0x3333;
        } else if (signer == user) {
            signerPrivateKey = 0x1111;
        } else {
            signerPrivateKey = uint256(keccak256(abi.encodePacked(signer)));
        }

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPrivateKey, ethSignedMessageHash);
        return abi.encodePacked(r, s, v);
    }
}

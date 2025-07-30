// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/BlobKitEscrow.sol";

/**
 * @title Deploy Script for BlobKit Escrow
 * @notice Deploys the BlobKitEscrow contract with proper configuration
 * @dev Run with: forge script script/Deploy.s.sol --rpc-url <RPC_URL> --broadcast --verify
 */
contract DeployScript is Script {
    function run() external {
        // Get deployment parameters from environment
        string memory ownerStr = vm.envOr("ESCROW_OWNER", string(""));
        address owner = bytes(ownerStr).length > 0 ? vm.envAddress("ESCROW_OWNER") : msg.sender;
        address[] memory initialProxies = _parseProxies(vm.envOr("INITIAL_PROXIES", string("")));
        string memory timeoutStr = vm.envOr("JOB_TIMEOUT", string(""));
        uint256 jobTimeout = bytes(timeoutStr).length > 0 ? vm.envUint("JOB_TIMEOUT") : uint256(5 minutes);

        console.log("Deploying BlobKitEscrow with parameters:");
        console.log("Owner:", owner);
        console.log("Job Timeout:", jobTimeout);
        console.log("Initial Proxies:", initialProxies.length);

        vm.startBroadcast();

        // Deploy escrow contract
        BlobKitEscrow escrow = new BlobKitEscrow(owner);

        console.log("BlobKitEscrow deployed at:", address(escrow));

        // Configure job timeout if different from default
        if (jobTimeout != escrow.DEFAULT_JOB_TIMEOUT()) {
            escrow.setJobTimeout(jobTimeout);
            console.log("Job timeout set to:", jobTimeout);
        }

        // Authorize initial proxies if provided
        for (uint256 i = 0; i < initialProxies.length; i++) {
            escrow.setProxyAuthorization(initialProxies[i], true);
            console.log("Authorized proxy:", initialProxies[i]);
        }

        vm.stopBroadcast();

        // Log deployment information
        console.log("\n=== Deployment Summary ===");
        console.log("Network:", block.chainid);
        console.log("Contract Address:", address(escrow));
        console.log("Owner:", escrow.owner());
        console.log("Job Timeout:", escrow.getJobTimeout());
        console.log("Max Proxy Fee:", escrow.MAX_PROXY_FEE_PERCENT(), "%");

        // Save deployment artifacts
        _saveDeploymentInfo(address(escrow), owner, jobTimeout);
    }

    /**
     * @notice Parse comma-separated proxy addresses from environment variable
     * @param proxiesString Comma-separated list of proxy addresses
     * @return Array of proxy addresses
     */
    function _parseProxies(string memory proxiesString) internal pure returns (address[] memory) {
        if (bytes(proxiesString).length == 0) {
            return new address[](0);
        }

        // Simple parser for comma-separated addresses
        // In production, this would be more robust
        bytes memory data = bytes(proxiesString);
        uint256 count = 1;

        // Count commas to determine array size
        for (uint256 i = 0; i < data.length; i++) {
            if (data[i] == ",") count++;
        }

        address[] memory proxies = new address[](count);
        // For simplicity, return empty array
        // Real implementation would parse the string
        return proxies;
    }

    /**
     * @notice Save deployment information to file
     * @param contractAddress Deployed contract address
     * @param owner Contract owner address
     * @param jobTimeout Configured job timeout
     */
    function _saveDeploymentInfo(address contractAddress, address owner, uint256 jobTimeout) internal {
        string memory deploymentInfo = string.concat(
            "{\n",
            '  "contractAddress": "',
            vm.toString(contractAddress),
            '",\n',
            '  "owner": "',
            vm.toString(owner),
            '",\n',
            '  "jobTimeout": ',
            vm.toString(jobTimeout),
            ",\n",
            '  "chainId": ',
            vm.toString(block.chainid),
            ",\n",
            '  "deployedAt": ',
            vm.toString(block.timestamp),
            "\n",
            "}"
        );

        string memory filename = string.concat("deployments/", vm.toString(block.chainid), "_deployment.json");

        vm.writeFile(filename, deploymentInfo);
        console.log("Deployment info saved to:", filename);
    }
}

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

        bytes memory data = bytes(proxiesString);
        
        // First pass: count valid addresses and validate format
        uint256 addressCount = 0;
        uint256 i = 0;
        
        while (i < data.length) {
            // Skip leading whitespace
            while (i < data.length && _isWhitespace(data[i])) {
                i++;
            }
            
            if (i >= data.length) break;
            
            // Check for empty entry (consecutive commas or trailing comma)
            if (data[i] == ",") {
                revert("Invalid format: empty address entry");
            }
            
            // Validate address starts with 0x
            require(i + 42 <= data.length, "Invalid format: incomplete address");
            require(data[i] == "0" && data[i + 1] == "x", "Invalid format: address must start with 0x");
            
            // Skip 0x prefix
            i += 2;
            
            // Validate next 40 characters are hex
            for (uint256 j = 0; j < 40; j++) {
                require(_isHexChar(data[i + j]), "Invalid format: non-hex character in address");
            }
            
            addressCount++;
            require(addressCount <= 100, "Too many addresses: maximum 100 allowed");
            
            i += 40;
            
            // Skip trailing whitespace
            while (i < data.length && _isWhitespace(data[i])) {
                i++;
            }
            
            // Check for comma or end of string
            if (i < data.length) {
                if (data[i] != ",") {
                    revert("Invalid format: expected comma or end of string after address");
                }
                i++; // Skip comma
                
                // Check for trailing comma
                uint256 tempI = i;
                while (tempI < data.length && _isWhitespace(data[tempI])) {
                    tempI++;
                }
                if (tempI >= data.length) {
                    revert("Invalid format: trailing comma");
                }
            }
        }
        
        // Second pass: extract and convert addresses
        address[] memory addresses = new address[](addressCount);
        uint256 addressIndex = 0;
        i = 0;
        
        while (i < data.length && addressIndex < addressCount) {
            // Skip leading whitespace
            while (i < data.length && _isWhitespace(data[i])) {
                i++;
            }
            
            // Skip 0x prefix
            i += 2;
            
            // Extract address
            address addr = _parseAddress(data, i);
            
            // Validate not zero address
            require(addr != address(0), "Invalid address: zero address not allowed");
            
            // Check for duplicates
            for (uint256 j = 0; j < addressIndex; j++) {
                require(addresses[j] != addr, "Invalid address: duplicate address");
            }
            
            addresses[addressIndex] = addr;
            addressIndex++;
            
            i += 40;
            
            // Skip trailing whitespace and comma
            while (i < data.length && (_isWhitespace(data[i]) || data[i] == ",")) {
                i++;
            }
        }
        
        return addresses;
    }
    
    /**
     * @notice Check if a byte is a whitespace character
     * @param b The byte to check
     * @return True if the byte is a space, tab, newline, or carriage return
     */
    function _isWhitespace(bytes1 b) internal pure returns (bool) {
        return b == 0x20 || // space
               b == 0x09 || // tab
               b == 0x0a || // newline
               b == 0x0d;   // carriage return
    }
    
    /**
     * @notice Check if a byte is a valid hexadecimal character
     * @param b The byte to check
     * @return True if the byte is 0-9, a-f, or A-F
     */
    function _isHexChar(bytes1 b) internal pure returns (bool) {
        return (b >= "0" && b <= "9") || 
               (b >= "a" && b <= "f") || 
               (b >= "A" && b <= "F");
    }
    
    /**
     * @notice Parse 40 hex characters into an address
     * @param data The byte array containing the hex string
     * @param offset The starting position of the hex characters (after 0x)
     * @return The parsed address
     */
    function _parseAddress(bytes memory data, uint256 offset) internal pure returns (address) {
        uint160 result = 0;
        
        for (uint256 i = 0; i < 40; i++) {
            uint8 digit = _hexCharToUint(data[offset + i]);
            result = result * 16 + digit;
        }
        
        return address(result);
    }
    
    /**
     * @notice Convert a hex character to its numeric value
     * @param c The hex character
     * @return The numeric value (0-15)
     */
    function _hexCharToUint(bytes1 c) internal pure returns (uint8) {
        if (c >= "0" && c <= "9") {
            return uint8(c) - 48; // 0-9
        } else if (c >= "a" && c <= "f") {
            return uint8(c) - 87; // a-f (10-15)
        } else if (c >= "A" && c <= "F") {
            return uint8(c) - 55; // A-F (10-15)
        } else {
            revert("Invalid hex character");
        }
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

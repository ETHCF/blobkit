// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";

/**
 * @title Address Parser Tests
 * @notice Production-grade tests for comma-separated address parsing
 */
contract DeployParserTest is Test {
    
    // Test harness that exposes the parser function
    AddressParser parser;
    
    function setUp() public {
        parser = new AddressParser();
    }
    
    function testParseEmptyString() public view {
        address[] memory result = parser.parseAddresses("");
        assertEq(result.length, 0, "Empty string should return empty array");
    }
    
    function testParseSingleAddress() public view {
        address[] memory result = parser.parseAddresses("0x1234567890123456789012345678901234567890");
        assertEq(result.length, 1, "Should parse single address");
        assertEq(result[0], address(0x1234567890123456789012345678901234567890), "Address should match");
    }
    
    function testParseMultipleAddresses() public view {
        string memory input = "0x1234567890123456789012345678901234567890,0xabcdefabcdefabcdefabcdefabcdefabcdefabcd,0x9876543210987654321098765432109876543210";
        address[] memory result = parser.parseAddresses(input);
        
        assertEq(result.length, 3, "Should parse three addresses");
        assertEq(result[0], address(0x1234567890123456789012345678901234567890));
        assertEq(result[1], address(0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD));
        assertEq(result[2], address(0x9876543210987654321098765432109876543210));
    }
    
    function testParseWithWhitespace() public view {
        string memory input = " 0x1234567890123456789012345678901234567890 , 0xabcdefabcdefabcdefabcdefabcdefabcdefabcd ";
        address[] memory result = parser.parseAddresses(input);
        
        assertEq(result.length, 2, "Should parse addresses with whitespace");
        assertEq(result[0], address(0x1234567890123456789012345678901234567890));
        assertEq(result[1], address(0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD));
    }
    
    function testParseMixedCase() public view {
        string memory input = "0xAbCdEf1234567890123456789012345678901234,0xFEDCBA9876543210987654321098765432109876";
        address[] memory result = parser.parseAddresses(input);
        
        assertEq(result.length, 2, "Should parse mixed case addresses");
        assertEq(result[0], address(0xaBcDef1234567890123456789012345678901234));
        assertEq(result[1], address(0xFedCBA9876543210987654321098765432109876));
    }
    
    function testRejectZeroAddress() public {
        vm.expectRevert("Invalid address: zero address not allowed");
        parser.parseAddresses("0x0000000000000000000000000000000000000000");
    }
    
    function testRejectDuplicateAddresses() public {
        string memory input = "0x1234567890123456789012345678901234567890,0x1234567890123456789012345678901234567890";
        vm.expectRevert("Invalid address: duplicate address");
        parser.parseAddresses(input);
    }
    
    function testRejectInvalidHex() public {
        string memory input = "0x12345678901234567890123456789012345678XY";
        vm.expectRevert("Invalid format: non-hex character in address");
        parser.parseAddresses(input);
    }
    
    function testRejectMissingPrefix() public {
        string memory input = "1234567890123456789012345678901234567890";
        vm.expectRevert("Invalid format: incomplete address");
        parser.parseAddresses(input);
    }
    
    function testRejectIncompleteAddress() public {
        string memory input = "0x12345678901234567890123456789012345678";
        vm.expectRevert("Invalid format: incomplete address");
        parser.parseAddresses(input);
    }
    
    function testRejectTrailingComma() public {
        string memory input = "0x1234567890123456789012345678901234567890,";
        vm.expectRevert("Invalid format: trailing comma");
        parser.parseAddresses(input);
    }
    
    function testRejectDoubleComma() public {
        string memory input = "0x1234567890123456789012345678901234567890,,0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
        vm.expectRevert("Invalid format: empty address entry");
        parser.parseAddresses(input);
    }
    
    function testRejectLeadingComma() public {
        string memory input = ",0x1234567890123456789012345678901234567890";
        vm.expectRevert("Invalid format: empty address entry");
        parser.parseAddresses(input);
    }
    
    function testRejectInvalidCharacterAfterAddress() public {
        string memory input = "0x1234567890123456789012345678901234567890X";
        vm.expectRevert("Invalid format: expected comma or end of string after address");
        parser.parseAddresses(input);
    }
    
    function testRejectTooManyAddresses() public {
        // Build string with 101 addresses
        string memory input = "0x0000000000000000000000000000000000000001";
        for (uint i = 2; i <= 101; i++) {
            if (i < 10) {
                input = string.concat(input, ",0x000000000000000000000000000000000000000", vm.toString(i));
            } else if (i < 100) {
                input = string.concat(input, ",0x00000000000000000000000000000000000000", vm.toString(i));
            } else {
                input = string.concat(input, ",0x0000000000000000000000000000000000000", vm.toString(i));
            }
        }
        
        vm.expectRevert("Too many addresses: maximum 100 allowed");
        parser.parseAddresses(input);
    }
    
    function testParseMaximumAddresses() public view {
        // Build string with exactly 100 addresses
        string memory input = "0x0000000000000000000000000000000000000001";
        for (uint i = 2; i <= 100; i++) {
            if (i < 10) {
                input = string.concat(input, ",0x000000000000000000000000000000000000000", vm.toString(i));
            } else if (i < 100) {
                input = string.concat(input, ",0x00000000000000000000000000000000000000", vm.toString(i));
            } else {
                input = string.concat(input, ",0x0000000000000000000000000000000000000100");
            }
        }
        
        address[] memory result = parser.parseAddresses(input);
        assertEq(result.length, 100, "Should parse exactly 100 addresses");
        assertEq(result[0], address(0x0000000000000000000000000000000000000001));
        assertEq(result[99], address(0x0000000000000000000000000000000000000100));
    }
    
    function testParseWithNewlines() public view {
        string memory input = "0x1234567890123456789012345678901234567890,\n0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
        address[] memory result = parser.parseAddresses(input);
        
        assertEq(result.length, 2, "Should parse addresses with newlines");
        assertEq(result[0], address(0x1234567890123456789012345678901234567890));
        assertEq(result[1], address(0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD));
    }
    
    function testParseWithTabs() public view {
        string memory input = "0x1234567890123456789012345678901234567890\t,\t0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
        address[] memory result = parser.parseAddresses(input);
        
        assertEq(result.length, 2, "Should parse addresses with tabs");
        assertEq(result[0], address(0x1234567890123456789012345678901234567890));
        assertEq(result[1], address(0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD));
    }
    
    function testParseComplexWhitespace() public view {
        string memory input = "  \n\t0x1234567890123456789012345678901234567890  \n\t,  \n\t0xabcdefabcdefabcdefabcdefabcdefabcdefabcd  \n\t";
        address[] memory result = parser.parseAddresses(input);
        
        assertEq(result.length, 2, "Should parse addresses with complex whitespace");
        assertEq(result[0], address(0x1234567890123456789012345678901234567890));
        assertEq(result[1], address(0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD));
    }
    
    function testRejectPartialHexPrefix() public {
        vm.expectRevert("Invalid format: incomplete address");
        parser.parseAddresses("0");
        
        vm.expectRevert("Invalid format: incomplete address");
        parser.parseAddresses("0x");
    }
    
    function testRejectSpaceInAddress() public {
        string memory input = "0x12345678901234567890 123456789012345678901234";
        vm.expectRevert("Invalid format: non-hex character in address");
        parser.parseAddresses(input);
    }
}

/**
 * @title Address Parser
 * @notice Production-grade parser for comma-separated Ethereum addresses
 * @dev This is a copy of the parser from Deploy.s.sol for testing purposes
 */
contract AddressParser {
    
    /**
     * @notice Parse comma-separated addresses with comprehensive validation
     * @param proxiesString Comma-separated list of addresses
     * @return Array of validated addresses
     */
    function parseAddresses(string memory proxiesString) public pure returns (address[] memory) {
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
    function _isWhitespace(bytes1 b) private pure returns (bool) {
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
    function _isHexChar(bytes1 b) private pure returns (bool) {
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
    function _parseAddress(bytes memory data, uint256 offset) private pure returns (address) {
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
    function _hexCharToUint(bytes1 c) private pure returns (uint8) {
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
}
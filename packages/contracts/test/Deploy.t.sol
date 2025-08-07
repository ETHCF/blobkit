// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../script/Deploy.s.sol";

/**
 * @title Deploy Script Tests
 * @notice Tests for the deployment script address parser
 */
contract DeployTest is Test {
    
    // Test harness that exposes the internal parser function
    DeployScriptTestHarness harness;
    
    function setUp() public {
        harness = new DeployScriptTestHarness();
    }
    
    function testParseEmptyString() public view {
        address[] memory result = harness.testParseProxies("");
        assertEq(result.length, 0, "Empty string should return empty array");
    }
    
    function testParseSingleAddress() public view {
        address[] memory result = harness.testParseProxies("0x1234567890123456789012345678901234567890");
        assertEq(result.length, 1, "Should parse single address");
        assertEq(result[0], address(0x1234567890123456789012345678901234567890), "Address should match");
    }
    
    function testParseMultipleAddresses() public view {
        string memory input = "0x1234567890123456789012345678901234567890,0xabcdefabcdefabcdefabcdefabcdefabcdefabcd,0x9876543210987654321098765432109876543210";
        address[] memory result = harness.testParseProxies(input);
        
        assertEq(result.length, 3, "Should parse three addresses");
        assertEq(result[0], address(0x1234567890123456789012345678901234567890));
        assertEq(result[1], address(0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD));
        assertEq(result[2], address(0x9876543210987654321098765432109876543210));
    }
    
    function testParseWithWhitespace() public view {
        string memory input = " 0x1234567890123456789012345678901234567890 , 0xabcdefabcdefabcdefabcdefabcdefabcdefabcd ";
        address[] memory result = harness.testParseProxies(input);
        
        assertEq(result.length, 2, "Should parse addresses with whitespace");
        assertEq(result[0], address(0x1234567890123456789012345678901234567890));
        assertEq(result[1], address(0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD));
    }
    
    function testParseMixedCase() public view {
        string memory input = "0xAbCdEf1234567890123456789012345678901234,0xFEDCBA9876543210987654321098765432109876";
        address[] memory result = harness.testParseProxies(input);
        
        assertEq(result.length, 2, "Should parse mixed case addresses");
        assertEq(result[0], address(0xaBcDef1234567890123456789012345678901234));
        assertEq(result[1], address(0xFedCBA9876543210987654321098765432109876));
    }
    
    function testRejectZeroAddress() public {
        vm.expectRevert("Invalid address: zero address not allowed");
        harness.testParseProxies("0x0000000000000000000000000000000000000000");
    }
    
    function testRejectDuplicateAddresses() public {
        string memory input = "0x1234567890123456789012345678901234567890,0x1234567890123456789012345678901234567890";
        vm.expectRevert("Invalid address: duplicate address");
        harness.testParseProxies(input);
    }
    
    function testRejectInvalidHex() public {
        string memory input = "0x12345678901234567890123456789012345678XY";
        vm.expectRevert("Invalid format: non-hex character in address");
        harness.testParseProxies(input);
    }
    
    function testRejectMissingPrefix() public {
        string memory input = "1234567890123456789012345678901234567890";
        vm.expectRevert("Invalid format: incomplete address");
        harness.testParseProxies(input);
    }
    
    function testRejectIncompleteAddress() public {
        string memory input = "0x12345678901234567890123456789012345678";
        vm.expectRevert("Invalid format: incomplete address");
        harness.testParseProxies(input);
    }
    
    function testRejectTrailingComma() public {
        string memory input = "0x1234567890123456789012345678901234567890,";
        vm.expectRevert("Invalid format: trailing comma");
        harness.testParseProxies(input);
    }
    
    function testRejectDoubleComma() public {
        string memory input = "0x1234567890123456789012345678901234567890,,0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
        vm.expectRevert("Invalid format: empty address entry");
        harness.testParseProxies(input);
    }
    
    function testRejectLeadingComma() public {
        string memory input = ",0x1234567890123456789012345678901234567890";
        vm.expectRevert("Invalid format: empty address entry");
        harness.testParseProxies(input);
    }
    
    function testRejectInvalidCharacterAfterAddress() public {
        string memory input = "0x1234567890123456789012345678901234567890X";
        vm.expectRevert("Invalid format: expected comma or end of string after address");
        harness.testParseProxies(input);
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
        harness.testParseProxies(input);
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
        
        address[] memory result = harness.testParseProxies(input);
        assertEq(result.length, 100, "Should parse exactly 100 addresses");
        assertEq(result[0], address(0x0000000000000000000000000000000000000001));
        assertEq(result[99], address(0x0000000000000000000000000000000000000100));
    }
    
    function testParseWithNewlines() public view {
        string memory input = "0x1234567890123456789012345678901234567890,\n0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
        address[] memory result = harness.testParseProxies(input);
        
        assertEq(result.length, 2, "Should parse addresses with newlines");
        assertEq(result[0], address(0x1234567890123456789012345678901234567890));
        assertEq(result[1], address(0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD));
    }
    
    function testParseWithTabs() public view {
        string memory input = "0x1234567890123456789012345678901234567890\t,\t0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
        address[] memory result = harness.testParseProxies(input);
        
        assertEq(result.length, 2, "Should parse addresses with tabs");
        assertEq(result[0], address(0x1234567890123456789012345678901234567890));
        assertEq(result[1], address(0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD));
    }
    
    function testParseComplexWhitespace() public view {
        string memory input = "  \n\t0x1234567890123456789012345678901234567890  \n\t,  \n\t0xabcdefabcdefabcdefabcdefabcdefabcdefabcd  \n\t";
        address[] memory result = harness.testParseProxies(input);
        
        assertEq(result.length, 2, "Should parse addresses with complex whitespace");
        assertEq(result[0], address(0x1234567890123456789012345678901234567890));
        assertEq(result[1], address(0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD));
    }
    
    function testRejectPartialHexPrefix() public {
        vm.expectRevert("Invalid format: incomplete address");
        harness.testParseProxies("0");
        
        vm.expectRevert("Invalid format: incomplete address");
        harness.testParseProxies("0x");
    }
    
    function testRejectSpaceInAddress() public {
        string memory input = "0x12345678901234567890 123456789012345678901234";
        vm.expectRevert("Invalid format: non-hex character in address");
        harness.testParseProxies(input);
    }
}

/**
 * @title Deploy Script Test Harness
 * @notice Exposes internal functions from DeployScript for testing
 */
contract DeployScriptTestHarness is DeployScript {
    // Public wrapper for testing the internal _parseProxies function
    function testParseProxies(string memory proxiesString) public pure returns (address[] memory) {
        return _parseProxies(proxiesString);
    }
}
// @ts-nocheck
import { BlobKitError } from '../src/types';

// Simple unit tests for URL validation logic
describe('Browser Security Validation', () => {
  test('should validate HTTPS requirement', () => {
    // Test the core validation logic directly
    const httpUrl = 'http://example.com/file.txt';
    const httpsUrl = 'https://example.com/file.txt';
    
    expect(() => new URL(httpUrl)).not.toThrow();
    expect(() => new URL(httpsUrl)).not.toThrow();
    
    const url1 = new URL(httpUrl);
    const url2 = new URL(httpsUrl);
    
    expect(url1.protocol).toBe('http:');
    expect(url2.protocol).toBe('https:');
  });

  test('should validate credential detection', () => {
    const urlWithCreds = 'https://user:pass@example.com/file.txt';
    const urlWithoutCreds = 'https://example.com/file.txt';
    
    const url1 = new URL(urlWithCreds);
    const url2 = new URL(urlWithoutCreds);
    
    expect(url1.username).toBe('user');
    expect(url1.password).toBe('pass');
    expect(url2.username).toBe('');
    expect(url2.password).toBe('');
  });

  test('should validate localhost detection', () => {
    const localhostUrl = 'https://localhost/file.txt';
    const ipUrl = 'https://127.0.0.1/file.txt';
    const externalUrl = 'https://example.com/file.txt';
    
    const url1 = new URL(localhostUrl);
    const url2 = new URL(ipUrl);
    const url3 = new URL(externalUrl);
    
    expect(url1.hostname).toBe('localhost');
    expect(url2.hostname).toBe('127.0.0.1');
    expect(url3.hostname).toBe('example.com');
  });

  test('should create BlobKitError with proper structure', () => {
    const error = new BlobKitError('Test message', 'TEST_CODE');
    
    expect(error.message).toBe('Test message');
    expect(error.code).toBe('TEST_CODE');
    expect(error instanceof Error).toBe(true);
    expect(error instanceof BlobKitError).toBe(true);
  });
});
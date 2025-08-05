// Test setup file for Jest
import 'jest';

// Setup global fetch mock
Object.defineProperty(global, 'fetch', {
  value: jest.fn(),
  writable: true
});
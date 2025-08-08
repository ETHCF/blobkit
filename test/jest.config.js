/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: [],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@blobkit/sdk$': '<rootDir>/../packages/sdk/src/index.ts'
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: false,
        tsconfig: {
          module: 'commonjs',
          target: 'es2022',
          lib: ['es2022'],
          moduleResolution: 'node',
          allowSyntheticDefaultImports: true,
          esModuleInterop: true
        }
      }
    ]
  },
  testMatch: ['**/*.test.ts'],
  testTimeout: 120000, // 2 minutes for integration tests
  setupFilesAfterEnv: ['<rootDir>/setup.ts']
};

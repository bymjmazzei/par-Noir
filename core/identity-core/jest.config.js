module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/__tests__/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  moduleDirectories: ['node_modules', 'dist'],
  testTimeout: 60000,
  maxWorkers: 1,
  forceExit: true,
  detectOpenHandles: true,
  // Transform ES modules that Jest can't handle
  transformIgnorePatterns: [
    'node_modules/(?!(@noble/secp256k1|@noble/curves|@noble/hashes|multiformats|ipfs-*|@libp2p/*)/)',
  ],
  // Handle ES module imports
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  // Mock problematic ES modules
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@noble/secp256k1$': '<rootDir>/src/__tests__/mocks/secp256k1.mock.ts',
  },
  // Configure ts-jest for proper TypeScript handling
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      useESM: false,
    }],
  },
};

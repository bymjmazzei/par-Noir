/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Narrow scope so Jest/ts-jest does not traverse the entire API tree (OOM on large codebase).
  roots: ['<rootDir>/src/server/utils', '<rootDir>/src/server/middleware'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        isolatedModules: true,
        tsconfig: { module: 'commonjs', esModuleInterop: true, strict: true },
      },
    ],
  },
};

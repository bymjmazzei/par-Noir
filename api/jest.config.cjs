/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // pnOAuthService registers a periodic cleanup interval; loading it leaves an open handle.
  forceExit: true,
  // Narrow scope so Jest/ts-jest does not traverse the entire API tree (OOM on large codebase).
  roots: ['<rootDir>/src/server/utils', '<rootDir>/src/server/middleware', '<rootDir>/src/server/modules'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
  // `@par-noir/*` workspace packages are linked via `file:` and ship ESM `dist/*.js`.
  // Their realpath is outside node_modules, so they must be transformed to CommonJS here.
  transform: {
    '^.+\\.(ts|js)$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          esModuleInterop: true,
          strict: true,
          allowJs: true,
          isolatedModules: true,
        },
      },
    ],
  },
  // `@noble/*` ship ESM only and are pulled in transitively by the crypto packages.
  transformIgnorePatterns: ['/node_modules/(?!(@par-noir|@noble)/)'],
  setupFiles: ['<rootDir>/jest.setup.cjs'],
};

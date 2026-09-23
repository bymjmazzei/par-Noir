import path from 'path';
import { defineConfig } from 'vitest/config';

const pqcSrc = path.resolve(__dirname, '../../packages/pqc-crypto/src');

export default defineConfig({
  resolve: {
    alias: {
      '@par-noir/pen-protocol': path.resolve(__dirname, '../../packages/pen-protocol/src/index.ts'),
      '@par-noir/pqc-crypto/oauth-unlock-proof': path.resolve(pqcSrc, 'oauthUnlockProof.ts'),
      '@par-noir/pqc-crypto/encoding': path.resolve(pqcSrc, 'encoding.ts'),
      '@par-noir/pqc-crypto/ml-dsa': path.resolve(pqcSrc, 'mlDsa.ts'),
      '@par-noir/pqc-crypto/ml-kem': path.resolve(pqcSrc, 'mlKem.ts'),
      '@par-noir/pqc-crypto/constants': path.resolve(pqcSrc, 'constants.ts'),
      '@par-noir/pqc-crypto': path.resolve(pqcSrc, 'index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.gate.test.ts'],
  },
});

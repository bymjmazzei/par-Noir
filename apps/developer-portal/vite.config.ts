import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pqcSrc = path.resolve(__dirname, '../../packages/pqc-crypto/src');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@par-noir/aggregator-domain': path.resolve(
        __dirname,
        '../../packages/aggregator-domain/src/index.ts'
      ),
      // pqc-crypto dist is CJS; Vite/Rollup cannot resolve named exports from workspace CJS builds
      '@par-noir/pqc-crypto/oauth-unlock-proof': path.resolve(pqcSrc, 'oauthUnlockProof.ts'),
      '@par-noir/pqc-crypto/encoding': path.resolve(pqcSrc, 'encoding.ts'),
      '@par-noir/pqc-crypto/ml-dsa': path.resolve(pqcSrc, 'mlDsa.ts'),
      '@par-noir/pqc-crypto/constants': path.resolve(pqcSrc, 'constants.ts'),
      '@par-noir/pqc-crypto': path.resolve(pqcSrc, 'index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  },
  server: {
    port: 5176
  }
});

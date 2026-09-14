import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const pqcSrc = path.resolve(__dirname, '../../packages/pqc-crypto/src');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
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
    sourcemap: false,
    copyPublicDir: true,
  },
  publicDir: 'public',
  server: {
    port: 5175,
  },
});

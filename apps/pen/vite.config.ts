import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const pqcSrc = path.resolve(__dirname, '../../packages/pqc-crypto/src');
const penSrc = path.resolve(__dirname, '../../packages/pen-protocol/src');

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // pqc-crypto dist is CJS; Vite needs src subpath aliases (order: specific first)
      '@par-noir/pqc-crypto/oauth-unlock-proof': path.resolve(pqcSrc, 'oauthUnlockProof.ts'),
      '@par-noir/pqc-crypto/encoding': path.resolve(pqcSrc, 'encoding.ts'),
      '@par-noir/pqc-crypto/ml-dsa': path.resolve(pqcSrc, 'mlDsa.ts'),
      '@par-noir/pqc-crypto/constants': path.resolve(pqcSrc, 'constants.ts'),
      '@par-noir/pqc-crypto': path.resolve(pqcSrc, 'index.ts'),
      '@par-noir/pen-protocol': path.resolve(penSrc, 'index.ts'),
    },
  },
  build: { outDir: 'dist', sourcemap: false },
  server: { port: 5177 },
});

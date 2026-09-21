import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rendererRoot = path.resolve(__dirname, 'src/renderer');
const oauthUiSrc = path.resolve(__dirname, '../../packages/oauth-ui/src');
const pqcSrc = path.resolve(__dirname, '../../packages/pqc-crypto/src');

export default defineConfig({
  base: './',
  root: rendererRoot,
  plugins: [react()],
  publicDir: path.resolve(__dirname, '../pn-unlock/public'),
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5179,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@par-noir/oauth-ui': oauthUiSrc,
      '@par-noir/pqc-crypto/oauth-unlock-proof': path.resolve(pqcSrc, 'oauthUnlockProof.ts'),
      '@par-noir/pqc-crypto/encoding': path.resolve(pqcSrc, 'encoding.ts'),
      '@par-noir/pqc-crypto/ml-dsa': path.resolve(pqcSrc, 'mlDsa.ts'),
      '@par-noir/pqc-crypto/constants': path.resolve(pqcSrc, 'constants.ts'),
      '@par-noir/pqc-crypto': path.resolve(pqcSrc, 'index.ts'),
      react: path.resolve(__dirname, '../../node_modules/react'),
      'react-dom': path.resolve(__dirname, '../../node_modules/react-dom'),
    },
    dedupe: ['react', 'react-dom'],
  },
});

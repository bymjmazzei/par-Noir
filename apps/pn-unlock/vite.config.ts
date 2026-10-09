import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'path';
import { assertViteApiEndpointForBuild } from '../../scripts/vite-require-api-endpoint.mjs';

const pqcSrc = path.resolve(__dirname, '../../packages/pqc-crypto/src');
const oauthUiSrc = path.resolve(__dirname, '../../packages/oauth-ui/src');

export default defineConfig(({ command, mode }) => {
  assertViteApiEndpointForBuild({ command, mode, root: __dirname });
  return {
  // Absolute base so /oauth/consent does not resolve assets as /oauth/assets/*
  // (Firebase SPA rewrite would serve index.html as JS and the app would never mount).
  base: '/',
  plugins: [
    react(),
    nodePolyfills({ include: ['crypto'] }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@par-noir/oauth-ui': oauthUiSrc,
      '@par-noir/pqc-crypto/oauth-unlock-proof': path.resolve(pqcSrc, 'oauthUnlockProof.ts'),
      '@par-noir/pqc-crypto/encoding': path.resolve(pqcSrc, 'encoding.ts'),
      '@par-noir/pqc-crypto/ml-dsa': path.resolve(pqcSrc, 'mlDsa.ts'),
      '@par-noir/pqc-crypto/constants': path.resolve(pqcSrc, 'constants.ts'),
      '@par-noir/pqc-crypto': path.resolve(pqcSrc, 'index.ts'),
      '@par-noir/identity-crypto/browser': path.resolve(__dirname, '../../packages/identity-crypto/src/browser.ts'),
      '@par-noir/identity-crypto': path.resolve(__dirname, '../../packages/identity-crypto/src/index.ts'),
      '@par-noir/recovery-crypto': path.resolve(__dirname, '../../packages/recovery-crypto/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    copyPublicDir: true,
    commonjsOptions: { transformMixedEsModules: true },
  },
  publicDir: 'public',
  server: {
    port: 5178,
  },
};
});

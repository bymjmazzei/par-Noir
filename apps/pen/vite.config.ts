import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'path';
import { assertViteApiEndpointForBuild } from '../../scripts/vite-require-api-endpoint.mjs';

const pqcSrc = path.resolve(__dirname, '../../packages/pqc-crypto/src');
const penSrc = path.resolve(__dirname, '../../packages/pen-protocol/src');
const aggregatorDomainSrc = path.resolve(__dirname, '../../packages/aggregator-domain/src');
const zkProtocolV2Src = path.resolve(__dirname, '../../packages/zk-protocol-v2/src');

export default defineConfig(({ command, mode }) => {
  assertViteApiEndpointForBuild({ command, mode, root: __dirname });
  // Vitest shares this config; gate tests need real Node fs/__dirname.
  const isVitest = Boolean(process.env.VITEST);
  return {
  base: './',
  plugins: [
    react(),
    // genSTARK / AirScript pull Node builtins (`fs`, `crypto`, …); required for ZK v2 in the browser bundle
    nodePolyfills({
      include: isVitest ? ['crypto'] : ['buffer', 'process', 'crypto', 'stream', 'util', 'path', 'fs'],
    }),
  ],
  define: isVitest
    ? {}
    : {
        global: 'globalThis',
        // genSTARK assembly modules reference __dirname for .wasm paths (wasm: false at runtime).
        __dirname: JSON.stringify('/'),
        __filename: JSON.stringify('/index.js'),
      },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // pqc-crypto dist is CJS; Vite needs src subpath aliases (order: specific first)
      '@par-noir/pqc-crypto/oauth-unlock-proof': path.resolve(pqcSrc, 'oauthUnlockProof.ts'),
      '@par-noir/pqc-crypto/encoding': path.resolve(pqcSrc, 'encoding.ts'),
      '@par-noir/pqc-crypto/ml-dsa': path.resolve(pqcSrc, 'mlDsa.ts'),
      '@par-noir/pqc-crypto/constants': path.resolve(pqcSrc, 'constants.ts'),
      '@par-noir/pqc-crypto': path.resolve(pqcSrc, 'index.ts'),
      '@par-noir/recovery-crypto': path.resolve(__dirname, '../../packages/recovery-crypto/src/index.ts'),
      '@par-noir/pen-protocol': path.resolve(penSrc, 'index.ts'),
      '@par-noir/pen-live': path.resolve(__dirname, '../../packages/pen-live/src/index.ts'),
      '@par-noir/feed-tile': path.resolve(__dirname, '../../packages/feed-tile/src/index.ts'),
      '@par-noir/pen-media': path.resolve(__dirname, '../../packages/pen-media/src/index.ts'),
      '@par-noir/aggregator-domain': path.resolve(aggregatorDomainSrc, 'index.ts'),
      '@par-noir/zk-protocol-v2/envelope': path.resolve(zkProtocolV2Src, 'envelope.ts'),
      '@par-noir/zk-protocol-v2': path.resolve(zkProtocolV2Src, 'index.ts'),
    },
    // Two Yjs copies break instanceof checks between pen-live and y-prosemirror.
    dedupe: ['yjs', 'y-prosemirror', 'y-protocols', 'lib0'],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    commonjsOptions: { transformMixedEsModules: true },
  },
  server: { port: 5177 },
};
});

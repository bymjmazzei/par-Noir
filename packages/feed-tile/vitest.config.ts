import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));
const pqcSrc = path.resolve(here, '../pqc-crypto/src');

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@par-noir/pen-protocol': path.resolve(here, '../pen-protocol/src/index.ts'),
      '@par-noir/pn-provenance': path.resolve(here, '../pn-provenance/src/index.ts'),
      '@par-noir/public-names': path.resolve(here, '../public-names/src/index.ts'),
      '@par-noir/pqc-crypto/oauth-unlock-proof': path.resolve(pqcSrc, 'oauthUnlockProof.ts'),
      '@par-noir/pqc-crypto/encoding': path.resolve(pqcSrc, 'encoding.ts'),
      '@par-noir/pqc-crypto/ml-dsa': path.resolve(pqcSrc, 'mlDsa.ts'),
      '@par-noir/pqc-crypto/constants': path.resolve(pqcSrc, 'constants.ts'),
      '@par-noir/pqc-crypto': path.resolve(pqcSrc, 'index.ts')
    }
  }
});

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Import package sources in tests (avoids dist/cborg exports friction under vitest).
      '@par-noir/pqc-crypto': join(root, '../pqc-crypto/src/index.ts'),
      '@par-noir/recovery-crypto': join(root, '../recovery-crypto/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        // Exact package root only. Subpath imports stay on package exports.
        find: /^@par-noir\/pqc-crypto$/,
        replacement: join(root, '../pqc-crypto/src/index.ts'),
      },
    ],
  },
  test: {
    environment: 'node',
  },
});

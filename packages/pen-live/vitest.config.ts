import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // pen-protocol dist can lag src; the live ACL lives in src.
      '@par-noir/pen-protocol': path.resolve(__dirname, '../pen-protocol/src/index.ts')
    }
  },
  test: {
    environment: 'node'
  }
});

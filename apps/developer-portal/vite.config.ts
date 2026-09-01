import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@par-noir/aggregator-domain': path.resolve(
        __dirname,
        '../../packages/aggregator-domain/src/index.ts'
      ),
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

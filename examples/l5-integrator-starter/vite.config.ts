import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@identity-protocol/identity-sdk': path.resolve(
        __dirname,
        '../../sdk/identity-sdk/src/index.ts'
      ),
      '@par-noir/aggregator-domain': path.resolve(
        __dirname,
        '../../packages/aggregator-domain/src/index.ts'
      )
    }
  },
  server: { port: 5180 }
});

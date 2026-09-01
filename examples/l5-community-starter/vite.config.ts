import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@identity-protocol/identity-sdk': path.resolve(
        __dirname,
        '../../sdk/identity-sdk/src/index.ts'
      )
    }
  },
  server: { port: 5181 }
});

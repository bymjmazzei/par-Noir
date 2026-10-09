import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { assertViteApiEndpointForBuild } from '../../scripts/vite-require-api-endpoint.mjs';

export default defineConfig(({ command, mode }) => {
  assertViteApiEndpointForBuild({ command, mode, root: __dirname });
  return {
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false
  },
  server: {
    port: 5178
  }
};
});

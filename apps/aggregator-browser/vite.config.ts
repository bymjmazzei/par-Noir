import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@par-noir/aggregator-domain': path.resolve(__dirname, '../../packages/aggregator-domain/src/index.ts'),
      '@par-noir/device-auth': path.resolve(__dirname, '../../packages/device-auth/src/index.ts'),
      '@par-noir/device-client': path.resolve(__dirname, '../../packages/device-client/src/index.ts'),
    }
  },
  worker: {
    format: 'es',
    plugins: () => [react()]
  },
  build: {
    // Use `vite build --mode messaging` + `.env.messaging` — do not rely on shell env during config load
    outDir: mode === 'messaging' ? 'dist-messaging' : 'dist',
    sourcemap: false,
    copyPublicDir: true // Ensure public folder is copied
  },
  publicDir: 'public', // Explicitly set public directory
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : undefined
  },
  server: {
    port: 3001
  }
}));


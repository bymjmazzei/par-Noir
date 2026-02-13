import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  worker: {
    format: 'es',
    plugins: () => [react()]
  },
  build: {
    outDir: 'dist',
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


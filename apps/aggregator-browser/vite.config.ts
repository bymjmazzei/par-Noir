import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '../services': path.resolve(__dirname, '../id-dashboard/src/services'),
      '../types': path.resolve(__dirname, '../id-dashboard/src/types'),
      '../utils': path.resolve(__dirname, '../id-dashboard/src/utils')
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  },
  server: {
    port: 3001
  }
});


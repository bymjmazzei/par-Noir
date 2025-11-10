import path from 'path';
import { defineConfig } from 'vite';

const rendererRoot = path.resolve(__dirname, 'src/renderer');
const outDir = path.resolve(__dirname, 'dist');
const allowDir = path.resolve(__dirname, '../id-dashboard');

export default defineConfig(async () => {
  const { default: react } = await import('@vitejs/plugin-react');

  return {
    base: './',
    root: rendererRoot,
    plugins: [react()],
    publicDir: path.resolve(__dirname, 'public'),
    build: {
      outDir,
      emptyOutDir: true,
      sourcemap: false
    },
    server: {
      port: 5173,
      fs: {
        // Allow Vite to import shared code from the dashboard workspace.
        allow: [rendererRoot, allowDir]
      }
    },
    resolve: {
      alias: {
        '@renderer': rendererRoot,
        react: path.resolve(__dirname, '../../node_modules/react'),
        'react-dom': path.resolve(__dirname, '../../node_modules/react-dom')
      },
      dedupe: ['react', 'react-dom']
    }
  };
});


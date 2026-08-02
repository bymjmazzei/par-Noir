import path from 'path';
import { defineConfig } from 'vite';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const rendererRoot = path.resolve(__dirname, 'src/renderer');
const outDir = path.resolve(__dirname, 'dist');
const dashboardRoot = path.dirname(require.resolve('par-noir-dashboard/package.json'));

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
        allow: [rendererRoot, dashboardRoot, path.resolve(__dirname, '../../packages')]
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

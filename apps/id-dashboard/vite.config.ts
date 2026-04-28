import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { resolve, normalize } from 'path'

/** Only our app config — NOT `node_modules/.../src/config/...` (e.g. ipfs-http-client), which would break the bundle with TDZ errors */
const APP_CONFIG_DIR = normalize(resolve(__dirname, 'src/config')).replace(/\\/g, '/')

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: './', // Required for Capacitor: assets load from file:// in WebView
  plugins: [
    react(),
    // genSTARK / AirScript pull Node builtins (`fs`, `crypto`, …); required for ZK v2 in the browser bundle
    nodePolyfills({ include: ['buffer', 'process', 'crypto', 'stream', 'util', 'path', 'fs'] }),
  ],
  worker: {
    format: 'es',
  },
  publicDir: 'public',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // Source ESM — dist is CJS and breaks Vite named exports for this workspace package
      '@par-noir/standard-data-points': resolve(__dirname, '../../packages/standard-data-points/src/index.ts'),
      '@par-noir/aggregator-domain': resolve(__dirname, '../../packages/aggregator-domain/src/index.ts'),
      // pqc-crypto dist is CJS; Vite/Rollup cannot resolve named exports from workspace CJS builds
      '@par-noir/pqc-crypto/encoding': resolve(__dirname, '../../packages/pqc-crypto/src/encoding.ts'),
      '@par-noir/pqc-crypto/ml-dsa': resolve(__dirname, '../../packages/pqc-crypto/src/mlDsa.ts'),
      '@par-noir/pqc-crypto/constants': resolve(__dirname, '../../packages/pqc-crypto/src/constants.ts'),
      '@par-noir/zk-protocol-v1': resolve(__dirname, '../../packages/zk-protocol-v1/src/index.ts'),
      '@par-noir/zk-protocol-v2': resolve(__dirname, '../../packages/zk-protocol-v2/src/index.ts'),
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'lucide-react',
      'qrcode',
      'tailwind-merge',
      'buffer',
    ]
  },
  build: {
    // BigInt crypto deps (ML-DSA) require modern output; downleveling to es2015 rewrites `**` to Math.pow
    // which throws at runtime for bigint operands.
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    chunkSizeWarningLimit: 1000,
    // Workers are handled separately and should not be minified
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Exclude workers from chunking
          if (id.includes('workers/') || id.includes('.worker.')) {
            return null;
          }
          // App config only — `id.includes('config/')` also matches vendor paths like ipfs-http-client/src/config and corrupts the chunk
          {
            const normalizedId = id.replace(/\\/g, '/')
            if (normalizedId === APP_CONFIG_DIR || normalizedId.startsWith(`${APP_CONFIG_DIR}/`)) {
              return 'config'
            }
          }
          // Vendor chunks
          if (id.includes('node_modules')) {
            // Keep ZK v2/STARK runtime out of startup vendor chunk.
            if (
              id.includes('@guildofweavers/') ||
              id.includes('@par-noir/zk-protocol-v2') ||
              id.includes('packages/zk-protocol-v2/')
            ) {
              return 'zk-v2-lazy';
            }
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor';
            }
            if (id.includes('lucide-react')) {
              return 'icons';
            }
            if (id.includes('qrcode')) {
              return 'qr';
            }
            if (id.includes('tailwind')) {
              return 'styles';
            }
            // Other vendor libraries
            return 'vendor';
          }
          
          // Feature-based chunks
          if (id.includes('components/')) {
            if (id.includes('Security') || id.includes('security')) {
              return 'security-features';
            }
            if (id.includes('Auth') || id.includes('auth')) {
              return 'auth-features';
            }
            if (id.includes('Privacy') || id.includes('privacy')) {
              return 'privacy-features';
            }
            if (id.includes('PWA') || id.includes('pwa')) {
              return 'pwa-features';
            }
            return 'components';
          }
          
          // Utility chunks
          if (id.includes('utils/')) {
            if (id.includes('crypto') || id.includes('security')) {
              return 'crypto-utils';
            }
            if (id.includes('storage') || id.includes('localStorage')) {
              return 'storage-utils';
            }
            if (id.includes('analytics') || id.includes('notifications')) {
              return 'service-utils';
            }
            return 'utils';
          }
          
          // Hooks chunk
          if (id.includes('hooks/')) {
            return 'hooks';
          }
        },
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
            return `assets/images/[name]-[hash][extname]`;
          }
          if (/woff2?|eot|ttf|otf/i.test(ext)) {
            return `assets/fonts/[name]-[hash][extname]`;
          }
          return `assets/[name]-[hash][extname]`;
        },
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
      },
    },
    terserOptions: {
      compress: {
        drop_console: mode === 'production',
        drop_debugger: true,
        ...(mode !== 'production' ? { pure_funcs: ['console.log', 'console.info', 'console.debug'] } : {}),
        passes: 2,
      },
      mangle: {
        safari10: true,
        // Don't mangle worker files - they use self/global which can break
        reserved: ['self', 'global', 'Worker', 'importScripts'],
      },
    },
  },
  server: {
    port: 3001,
    host: true,
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    },
  },
  preview: {
    port: 4173,
    host: true,
  },
  define: {
    global: 'globalThis',
    'process.env.NODE_ENV': JSON.stringify(mode),
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString())
  },
  esbuild: {
    // Skip TypeScript checking during build
    logOverride: { 'this-is-undefined-in-esm': 'silent' }
  }
}))

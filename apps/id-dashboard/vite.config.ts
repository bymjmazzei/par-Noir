import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es'
  },
  publicDir: 'public',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'lucide-react',
      'qrcode',
      'tailwind-merge'
    ]
  },
  build: {
    target: 'es2015',
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Vendor chunks
          if (id.includes('node_modules')) {
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
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug'],
        passes: 2,
      },
      mangle: {
        safari10: true,
      },
    },
  },
  server: {
    port: 3000,
    host: true,
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
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
    // Force development mode
    'process.env.NODE_ENV': JSON.stringify('development'),
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    'process.env.REACT_APP_IPFS_PROJECT_ID': JSON.stringify(process.env.REACT_APP_IPFS_PROJECT_ID),
    'process.env.REACT_APP_IPFS_PROJECT_SECRET': JSON.stringify(process.env.REACT_APP_IPFS_PROJECT_SECRET),
    'process.env.REACT_APP_IPFS_GATEWAY_URL': JSON.stringify(process.env.REACT_APP_IPFS_GATEWAY_URL),
    'process.env.REACT_APP_SENDGRID_API_KEY': JSON.stringify(process.env.REACT_APP_SENDGRID_API_KEY),
    'process.env.REACT_APP_TWILIO_ACCOUNT_SID': JSON.stringify(process.env.REACT_APP_TWILIO_ACCOUNT_SID),
    'process.env.REACT_APP_TWILIO_AUTH_TOKEN': JSON.stringify(process.env.REACT_APP_TWILIO_AUTH_TOKEN),
    'process.env.REACT_APP_TWILIO_FROM_NUMBER': JSON.stringify(process.env.REACT_APP_TWILIO_FROM_NUMBER),
    'process.env.REACT_APP_COINBASE_COMMERCE_API_KEY': JSON.stringify(process.env.REACT_APP_COINBASE_COMMERCE_API_KEY)
  },
  esbuild: {
    // Skip TypeScript checking during build
    logOverride: { 'this-is-undefined-in-esm': 'silent' }
  }
})

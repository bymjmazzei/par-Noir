# Identity Protocol Dashboard - Developer Guide

## 🏗️ Architecture Overview

### PWA Architecture
The Identity Protocol Dashboard is built as a Progressive Web App (PWA) with the following architecture:

```
├── Frontend (React + TypeScript)
│   ├── Components
│   │   ├── PWAInstall.tsx - PWA installation prompt
│   │   ├── OfflineIndicator.tsx - Online/offline status
│   │   └── UnifiedAuth.tsx - Authentication flow
│   ├── Hooks
│   │   └── usePWA.ts - PWA state management
│   └── Utils
│       └── localStorage.ts - Secure storage
├── Service Worker (sw.js)
│   ├── Caching strategies
│   ├── Offline functionality
│   └── Background sync
└── PWA Assets
    ├── manifest.json - App manifest
    ├── Icons - SVG icons for different sizes
    └── offline.html - Offline page
```

### Core Technologies
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **IndexedDB** - Local storage
- **Web Crypto API** - Encryption
- **Service Worker** - PWA functionality

## 🔧 Development Setup

### Prerequisites
```bash
Node.js 18+
npm 8+
```

### Installation
```bash
cd apps/id-dashboard
npm install
```

### Development Server
```bash
npm run dev
```

### Building for Production
```bash
npm run build
```

## 📱 PWA Features

### Service Worker
Located at `public/sw.js`, the service worker provides:
- **Cache Management**: Static and dynamic caching
- **Offline Support**: Fallback pages and offline functionality
- **Background Sync**: Sync data when connection is restored
- **Push Notifications**: Handle push notifications

### Manifest Configuration
The `public/manifest.json` defines:
- **App Metadata**: Name, description, theme colors
- **Icons**: Multiple sizes for different devices
- **Display Mode**: Standalone app experience
- **Shortcuts**: Quick access to key features

### Secure Storage
The `localStorage.ts` utility provides:
- **Encrypted Storage**: AES-GCM encryption
- **IndexedDB Integration**: Persistent storage
- **Data Integrity**: Checksums and validation
- **Export/Import**: Secure data backup

## 🔐 Security Implementation

### Encryption
- **AES-GCM**: Symmetric encryption for data
- **PBKDF2**: Key derivation for passwords
- **Web Crypto API**: Browser-native cryptography

### Authentication
- **Multi-Factor Recovery**: 4-factor authentication
- **Custodian System**: Distributed trust model
- **Recovery Keys**: Offline backup mechanism

### Privacy
- **Local-First**: Data stays on device
- **Selective Disclosure**: User controls data sharing
- **Zero-Knowledge**: No server-side data storage

## 🧪 Testing

### Unit Tests
```bash
npm test
```

### Cross-Browser Testing
```bash
npx playwright test
```

### Performance Testing
```bash
npx lighthouse http://localhost:3000
```

## 📦 Build Configuration

### Vite Configuration
```typescript
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    port: 3000,
  },
})
```

### PWA Configuration
```json
// manifest.json
{
  "name": "Identity Protocol Dashboard",
  "short_name": "ID Dashboard",
  "display": "standalone",
  "theme_color": "#1f2937",
  "background_color": "#ffffff"
}
```

## 🚀 Deployment

### Static Hosting
The PWA can be deployed to any static hosting service:
- **Netlify**: Automatic deployments
- **Vercel**: Edge deployment
- **GitHub Pages**: Free hosting
- **OrbitDB/IPFS**: Decentralized hosting

### Build Output
```bash
npm run build
# Output: dist/ directory
```

### Service Worker Registration
```javascript
// index.html
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
}
```

## 🔧 Customization

### Theming
Update colors in `tailwind.config.js`:
```javascript
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: '#1f2937',
        secondary: '#374151',
      },
    },
  },
}
```

### Icons
Replace icons in `public/icons/`:
- `icon-192x192.svg` - Small icon
- `icon-512x512.svg` - Large icon
- `icon.svg` - Fallback icon

### Manifest
Update `public/manifest.json` for:
- App name and description
- Theme colors
- Shortcuts
- Display options

## 📊 Performance Optimization

### Bundle Optimization
- **Code Splitting**: Automatic with Vite
- **Tree Shaking**: Unused code removal
- **Minification**: Production builds

### Caching Strategy
- **Static Assets**: Cache-first
- **API Requests**: Network-first
- **Dynamic Content**: Stale-while-revalidate

### Loading Performance
- **Lazy Loading**: Components loaded on demand
- **Preloading**: Critical resources
- **Service Worker**: Background caching

## 🔍 Debugging

### Service Worker
```javascript
// Chrome DevTools > Application > Service Workers
navigator.serviceWorker.getRegistrations()
```

### Storage
```javascript
// Chrome DevTools > Application > Storage
indexedDB.open('IdentityDashboardDB')
```

### PWA Features
```javascript
// Check PWA support
if ('serviceWorker' in navigator) {
  console.log('Service Worker supported')
}
if ('PushManager' in window) {
  console.log('Push notifications supported')
}
```

## 📚 API Reference

### PWA Hooks
```typescript
const [pwaState, pwaHandlers] = usePWA()

// State includes:
pwaState.isInstalled
pwaState.isOnline
pwaState.serviceWorkerRegistration

// Handlers include:
pwaHandlers.install()
pwaHandlers.exportData()
pwaHandlers.importData()
```

### Storage API
```typescript
import { secureStorage } from './utils/localStorage'

// Store data
await secureStorage.setItem('key', data)

// Retrieve data
const data = await secureStorage.getItem('key')

// Export all data
const exported = await secureStorage.exportData()
```

### Components
```typescript
// PWA Install Prompt
<PWAInstall className="mb-4" />

// Offline Indicator
<OfflineIndicator />

// Authentication
<UnifiedAuth onAuthSuccess={handleAuth} />
```

## 🐛 Common Issues

### Service Worker Not Registering
- Check if HTTPS is enabled (required for service workers)
- Verify the service worker file exists at `/sw.js`
- Check browser console for errors

### PWA Not Installable
- Ensure manifest.json is valid
- Check that icons are properly sized
- Verify HTTPS is enabled

### Storage Issues
- Check IndexedDB support in browser
- Verify storage quotas
- Check for encryption errors

### Performance Issues
- Monitor bundle size with `npm run build`
- Check Lighthouse scores
- Optimize images and assets

## 🔄 Updates and Maintenance

### Service Worker Updates
```javascript
// Check for updates
registration.addEventListener('updatefound', () => {
  const newWorker = registration.installing
  newWorker.addEventListener('statechange', () => {
    if (newWorker.state === 'installed') {
      // Prompt user to reload
    }
  })
})
```

### Data Migration
```typescript
// Handle schema updates
const migrateData = async (oldVersion: number) => {
  if (oldVersion < 2) {
    // Migrate to new schema
  }
}
```

### Security Updates
- Regularly update dependencies
- Monitor for security vulnerabilities
- Update encryption algorithms as needed

---

For more information, see the main project documentation or contact the development team. 
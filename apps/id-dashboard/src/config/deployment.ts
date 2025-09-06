import { cryptoWorkerManager } from './cryptoWorkerManager';
// Deployment configuration - Update these values for production deployment
export const deploymentConfig = {
  // Production API endpoints
  apiEndpoints: {
    orbitDB: 'https://api.identityprotocol.com/orbitdb',
    websocket: 'wss://api.identityprotocol.com/socket.io',
    cloudSync: 'https://api.identityprotocol.com/sync',
    emailService: 'https://api.identityprotocol.com/email',
    smsService: 'https://api.identityprotocol.com/sms',
    ipfsService: 'https://api.identityprotocol.com/ipfs',
  },
  
  // Production domain settings
  domain: {
    main: 'https://identityprotocol.com',
    api: 'https://api.identityprotocol.com',
    cdn: 'https://cdn.identityprotocol.com',
  },
  
  // Production feature flags
  features: {
    enableWebSocket: true,
    enableCloudSync: true,
    enableRealTimeAlerts: true,
    enableBiometricAuth: true,
    enablePWA: true,
    enableServiceWorker: true,
    enableAnalytics: true,
    enableErrorReporting: true,
  },
  
  // Production security settings
  security: {
    enableStrictCSP: true,
    enableHSTS: true,
    enableSecureCookies: true,
    maxLoginAttempts: 5,
    sessionTimeout: 3600, // 1 hour
  },
  
  // Production logging settings
  logging: {
    level: 'error',
    enableConsoleLogs: false,
    enableNetworkLogs: false,
    enableErrorReporting: true,
  },
  
  // Production PWA settings
  pwa: {
    name: 'Par Noir - Digital Identity Management',
    shortName: 'Par Noir',
    description: 'Create, manage, and secure your digital identities',
    themeColor: '#1f2937',
    backgroundColor: '#ffffff',
    display: 'standalone',
    scope: '/',
    startUrl: '/',
  },
  
  // Production service worker settings
  serviceWorker: {
    cacheName: 'par-noir-v1',
    maxCacheAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    enableBackgroundSync: true,
    enablePushNotifications: true,
  },
  
  // Production analytics settings
  analytics: {
    googleAnalyticsId: process.env.GOOGLE_ANALYTICS_ID || '',
    sentryDsn: process.env.SENTRY_DSN || '',
  },
  
  // Production error reporting settings
  errorReporting: {
    enableSentry: true,
    enableConsoleErrorReporting: false,
    enableNetworkErrorReporting: true,
  },
  
  // Production performance settings
  performance: {
    enableLazyLoading: true,
    enableCodeSplitting: true,
    enableImageOptimization: true,
    enableGzipCompression: true,
  },
};

// Helper function to update deployment config
export const updateDeploymentConfig = (updates: Partial<typeof deploymentConfig>) => {
  Object.assign(deploymentConfig, updates);
};

// Helper function to get deployment info
export const getDeploymentInfo = () => ({
  version: process.env.npm_package_version || '1.0.0',
  buildTime: process.env.BUILD_TIME || new Date().toISOString(),
  environment: process.env.NODE_ENV || 'development',
  deploymentConfig,
});


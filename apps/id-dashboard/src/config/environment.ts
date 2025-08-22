// Environment configuration for development vs deployment modes
export interface EnvironmentConfig {
  mode: 'development' | 'production';
  apiEndpoints: {
    firebase: string;
    websocket: string;
    cloudSync: string;
    emailService: string;
    smsService: string;
    ipfsService: string;
  };
  features: {
    enableWebSocket: boolean;
    enableCloudSync: boolean;
    enableRealTimeAlerts: boolean;
    enableBiometricAuth: boolean;
    enablePWA: boolean;
    enableServiceWorker: boolean;
    enableAnalytics: boolean;
    enableErrorReporting: boolean;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error' | 'none';
    enableConsoleLogs: boolean;
    enableNetworkLogs: boolean;
  };
  security: {
    enableStrictCSP: boolean;
    enableHSTS: boolean;
    enableSecureCookies: boolean;
  };
}

// Development configuration
const developmentConfig: EnvironmentConfig = {
  mode: 'development',
  apiEndpoints: {
    firebase: 'http://localhost:3002/firebase',
    websocket: 'ws://localhost:3002/socket.io',
    cloudSync: 'http://localhost:3002/sync',
    emailService: 'http://localhost:3002/email',
    smsService: 'http://localhost:3002/sms',
    ipfsService: 'http://localhost:3002/ipfs',
  },
  features: {
    enableWebSocket: false, // Disabled in dev to avoid connection errors
    enableCloudSync: false, // Disabled in dev to avoid API errors
    enableRealTimeAlerts: false, // Disabled in dev
    enableBiometricAuth: false, // Disabled in dev
    enablePWA: true,
    enableServiceWorker: true,
    enableAnalytics: false, // Disabled in dev
    enableErrorReporting: false, // Disabled in dev
  },
  logging: {
    level: 'debug',
    enableConsoleLogs: true,
    enableNetworkLogs: true,
  },
  security: {
    enableStrictCSP: false, // Relaxed in dev
    enableHSTS: false, // Disabled in dev
    enableSecureCookies: false, // Disabled in dev
  },
};

// Production configuration
const productionConfig: EnvironmentConfig = {
  mode: 'production',
  apiEndpoints: {
    firebase: 'https://api.identityprotocol.com/firebase',
    websocket: 'wss://api.identityprotocol.com/socket.io',
    cloudSync: 'https://api.identityprotocol.com/sync',
    emailService: 'https://api.identityprotocol.com/email',
    smsService: 'https://api.identityprotocol.com/sms',
    ipfsService: 'https://api.identityprotocol.com/ipfs',
  },
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
  logging: {
    level: 'error',
    enableConsoleLogs: false,
    enableNetworkLogs: false,
  },
  security: {
    enableStrictCSP: true,
    enableHSTS: true,
    enableSecureCookies: true,
  },
};

// Determine current environment
const isDevelopment = process.env.NODE_ENV === 'development' || 
                     process.env.VITE_APP_ENV === 'development' ||
                     window.location.hostname === 'localhost' ||
                     window.location.hostname === '127.0.0.1';

// Export the appropriate configuration
export const config: EnvironmentConfig = isDevelopment ? developmentConfig : productionConfig;

// Helper functions
export const isDev = () => config.mode === 'development';
export const isProd = () => config.mode === 'production';

// Feature flags
export const features = config.features;
export const apiEndpoints = config.apiEndpoints;
export const logging = config.logging;
export const security = config.security;

// Logging utility
export const log = {
  debug: (message: string, ...args: any[]) => {
    if (config.logging.enableConsoleLogs && config.logging.level === 'debug') {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  },
  info: (message: string, ...args: any[]) => {
    if (config.logging.enableConsoleLogs && ['debug', 'info'].includes(config.logging.level)) {
      console.info(`[INFO] ${message}`, ...args);
    }
  },
  warn: (message: string, ...args: any[]) => {
    if (config.logging.enableConsoleLogs && ['debug', 'info', 'warn'].includes(config.logging.level)) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  },
  error: (message: string, ...args: any[]) => {
    if (config.logging.enableConsoleLogs && ['debug', 'info', 'warn', 'error'].includes(config.logging.level)) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  },
};

// Environment detection
export const getEnvironmentInfo = () => ({
  mode: config.mode,
  isDevelopment: isDev(),
  isProduction: isProd(),
  hostname: window.location.hostname,
  port: window.location.port,
  protocol: window.location.protocol,
  userAgent: navigator.userAgent,
});


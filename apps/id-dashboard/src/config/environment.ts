// Environment configuration for development vs deployment
export interface EnvironmentConfig {
  mode: 'development' | 'production';
  apiEndpoints: {
    websocket: string;
    cloudSync: string;
    emailService: string;
    smsService: string;
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

const developmentConfig: EnvironmentConfig = {
  mode: 'development',
  apiEndpoints: {
    websocket: 'ws://localhost:3002/socket.io',
    cloudSync: 'http://localhost:3002/sync',
    emailService: 'http://localhost:3002/email',
    smsService: 'http://localhost:3002/sms',
  },
  features: {
    enableWebSocket: false,
    enableCloudSync: false,
    enableRealTimeAlerts: false,
    enableBiometricAuth: false,
    enablePWA: true,
    enableServiceWorker: true,
    enableAnalytics: false,
    enableErrorReporting: false,
  },
  logging: {
    level: 'debug',
    enableConsoleLogs: true,
    enableNetworkLogs: true,
  },
  security: {
    enableStrictCSP: false,
    enableHSTS: false,
    enableSecureCookies: false,
  },
};

const productionConfig: EnvironmentConfig = {
  mode: 'production',
  apiEndpoints: {
    websocket: 'wss://pn.parnoir.com/socket.io',
    cloudSync: 'https://pn.parnoir.com/api/sync',
    emailService: 'https://pn.parnoir.com/api/email',
    smsService: 'https://pn.parnoir.com/api/sms',
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

const isDevelopment = process.env.NODE_ENV === 'development' ||
                     process.env.VITE_APP_ENV === 'development' ||
                     window.location.hostname === 'localhost' ||
                     window.location.hostname === '127.0.0.1';

export const config: EnvironmentConfig = isDevelopment ? developmentConfig : productionConfig;

export const isDev = () => config.mode === 'development';
export const isProd = () => config.mode === 'production';

export const features = config.features;
export const apiEndpoints = config.apiEndpoints;
export const logging = config.logging;
export const security = config.security;

export const log = {
  debug: (message: string, ...args: any[]) => {
    if (config.logging.enableConsoleLogs && config.logging.level === 'debug') {
      void message;
      void args;
    }
  },
  info: (message: string, ...args: any[]) => {
    if (config.logging.enableConsoleLogs && ['debug', 'info'].includes(config.logging.level)) {
      void message;
      void args;
    }
  },
  warn: (message: string, ...args: any[]) => {
    if (config.logging.enableConsoleLogs && ['debug', 'info', 'warn'].includes(config.logging.level)) {
      void message;
      void args;
    }
  },
  error: (message: string, ...args: any[]) => {
    if (config.logging.enableConsoleLogs && ['debug', 'info', 'warn', 'error'].includes(config.logging.level)) {
      void message;
      void args;
    }
  },
};

export const getEnvironmentInfo = () => ({
  mode: config.mode,
  isDevelopment: isDev(),
  isProduction: isProd(),
  hostname: window.location.hostname,
  port: window.location.port,
  protocol: window.location.protocol,
  userAgent: navigator.userAgent,
});

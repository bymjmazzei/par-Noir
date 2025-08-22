#!/usr/bin/env node

/**
 * Deployment Configuration Script
 * 
 * This script helps update deployment configuration for different environments.
 * 
 * Usage:
 *   node scripts/deploy-config.js --env production --domain your-domain.com
 *   node scripts/deploy-config.js --env staging --domain staging.your-domain.com
 *   node scripts/deploy-config.js --env development --domain localhost:3002
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const env = args.find(arg => arg.startsWith('--env='))?.split('=')[1] || 'development';
const domain = args.find(arg => arg.startsWith('--domain='))?.split('=')[1] || 'localhost:3002';

console.log(`Configuring deployment for environment: ${env}`);
console.log(`Domain: ${domain}`);

// Configuration templates
const configs = {
  development: {
    apiEndpoints: {
      firebase: `http://${domain}/firebase`,
      websocket: `ws://${domain}/socket.io`,
      cloudSync: `http://${domain}/sync`,
      emailService: `http://${domain}/email`,
      smsService: `http://${domain}/sms`,
      ipfsService: `http://${domain}/ipfs`,
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
  },
  staging: {
    apiEndpoints: {
      firebase: `https://api.${domain}/firebase`,
      websocket: `wss://api.${domain}/socket.io`,
      cloudSync: `https://api.${domain}/sync`,
      emailService: `https://api.${domain}/email`,
      smsService: `https://api.${domain}/sms`,
      ipfsService: `https://api.${domain}/ipfs`,
    },
    features: {
      enableWebSocket: true,
      enableCloudSync: true,
      enableRealTimeAlerts: true,
      enableBiometricAuth: false, // Disabled in staging
      enablePWA: true,
      enableServiceWorker: true,
      enableAnalytics: false, // Disabled in staging
      enableErrorReporting: true,
    },
    logging: {
      level: 'info',
      enableConsoleLogs: true,
      enableNetworkLogs: false,
    },
  },
  production: {
    apiEndpoints: {
      firebase: `https://api.${domain}/firebase`,
      websocket: `wss://api.${domain}/socket.io`,
      cloudSync: `https://api.${domain}/sync`,
      emailService: `https://api.${domain}/email`,
      smsService: `https://api.${domain}/sms`,
      ipfsService: `https://api.${domain}/ipfs`,
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
  },
};

// Get the configuration for the specified environment
const config = configs[env];
if (!config) {
  console.error(`Unknown environment: ${env}`);
  console.log('Available environments: development, staging, production');
  process.exit(1);
}

// Update the deployment configuration file
const deploymentConfigPath = path.join(__dirname, '../src/config/deployment.ts');
let deploymentConfigContent = fs.readFileSync(deploymentConfigPath, 'utf8');

// Update API endpoints
Object.entries(config.apiEndpoints).forEach(([key, value]) => {
  const regex = new RegExp(`(${key}:\\s*['"])[^'"]*['"]`, 'g');
  deploymentConfigContent = deploymentConfigContent.replace(regex, `$1${value}"`);
});

// Update feature flags
Object.entries(config.features).forEach(([key, value]) => {
  const regex = new RegExp(`(${key}:\\s*)(true|false)`, 'g');
  deploymentConfigContent = deploymentConfigContent.replace(regex, `$1${value}`);
});

// Update logging settings
Object.entries(config.logging).forEach(([key, value]) => {
  if (typeof value === 'string') {
    const regex = new RegExp(`(${key}:\\s*['"])[^'"]*['"]`, 'g');
    deploymentConfigContent = deploymentConfigContent.replace(regex, `$1${value}"`);
  } else {
    const regex = new RegExp(`(${key}:\\s*)(true|false)`, 'g');
    deploymentConfigContent = deploymentConfigContent.replace(regex, `$1${value}`);
  }
});

// Write the updated configuration back to the file
fs.writeFileSync(deploymentConfigPath, deploymentConfigContent);

console.log(`✅ Deployment configuration updated for ${env} environment`);
console.log(`📁 Updated file: ${deploymentConfigPath}`);

// Create environment-specific .env file
const envContent = `# Environment: ${env}
VITE_APP_ENV=${env}
VITE_APP_DOMAIN=${domain}
VITE_APP_API_BASE_URL=${config.apiEndpoints.firebase.replace('/firebase', '')}
`;

const envFilePath = path.join(__dirname, `../.env.${env}`);
fs.writeFileSync(envFilePath, envContent);

console.log(`📁 Created environment file: ${envFilePath}`);

// Update package.json scripts if they don't exist
const packageJsonPath = path.join(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

if (!packageJson.scripts[`build:${env}`]) {
  packageJson.scripts[`build:${env}`] = `VITE_APP_ENV=${env} npm run build`;
}

if (!packageJson.scripts[`dev:${env}`]) {
  packageJson.scripts[`dev:${env}`] = `VITE_APP_ENV=${env} npm run dev`;
}

fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

console.log(`📁 Updated package.json with ${env} scripts`);
console.log(`\n🚀 To build for ${env}: npm run build:${env}`);
console.log(`🚀 To run in ${env} mode: npm run dev:${env}`);


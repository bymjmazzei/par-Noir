# Development vs Deployment Mode

This document explains how to use the development vs deployment mode system in the Par Noir Identity Dashboard.

## Overview

The application now has a comprehensive environment configuration system that automatically switches between development and production modes based on the current environment. This allows you to:

- **Development Mode**: Test the application locally without external dependencies
- **Deployment Mode**: Use production endpoints and features for live deployment

## Environment Detection

The system automatically detects the current environment based on:

1. `NODE_ENV` environment variable
2. `VITE_APP_ENV` environment variable  
3. Hostname (localhost/127.0.0.1 = development)

## Development Mode Features

When running in development mode:

- ✅ **WebSocket**: Disabled (simulated locally)
- ✅ **Cloud Sync**: Disabled (simulated locally)
- ✅ **Real-time Alerts**: Disabled
- ✅ **Biometric Auth**: Disabled
- ✅ **PWA**: Enabled
- ✅ **Service Worker**: Enabled
- ❌ **Analytics**: Disabled
- ❌ **Error Reporting**: Disabled
- ✅ **Console Logging**: Enabled (debug level)
- ✅ **Network Logging**: Enabled

## Production Mode Features

When running in production mode:

- ✅ **WebSocket**: Enabled (real connections)
- ✅ **Cloud Sync**: Enabled (real API calls)
- ✅ **Real-time Alerts**: Enabled
- ✅ **Biometric Auth**: Enabled
- ✅ **PWA**: Enabled
- ✅ **Service Worker**: Enabled
- ✅ **Analytics**: Enabled
- ✅ **Error Reporting**: Enabled
- ❌ **Console Logging**: Disabled
- ❌ **Network Logging**: Disabled

## Configuration Files

### 1. Environment Configuration (`src/config/environment.ts`)

This file contains the main environment configuration that automatically switches between development and production settings.

### 2. Deployment Configuration (`src/config/deployment.ts`)

This file contains all production endpoints and settings that can be easily updated for deployment.

### 3. Development Mode Indicator

A visual indicator appears in the bottom-right corner when running in development mode, showing:
- Current environment
- Hostname and port
- WebSocket status (ON/OFF)
- Cloud Sync status (ON/OFF)

## Usage

### Running in Development Mode

```bash
# Start the development server
npm run dev

# The app will automatically run in development mode
# You'll see a yellow "DEV MODE" indicator in the bottom-right corner
```

### Running in Production Mode

```bash
# Build for production
npm run build

# The app will automatically run in production mode
# No development indicator will be shown
```

### Using the Deployment Configuration Script

```bash
# Configure for development
node scripts/deploy-config.js --env=development --domain=localhost:3002

# Configure for staging
node scripts/deploy-config.js --env=staging --domain=staging.yourdomain.com

# Configure for production
node scripts/deploy-config.js --env=production --domain=yourdomain.com
```

## Environment Variables

You can override the automatic environment detection using these environment variables:

```bash
# Force development mode
VITE_APP_ENV=development npm run dev

# Force production mode
VITE_APP_ENV=production npm run build
```

## API Endpoints

### Development Mode Endpoints
- Firebase: `http://localhost:3002/firebase`
- WebSocket: `ws://localhost:3002/socket.io`
- Cloud Sync: `http://localhost:3002/sync`
- Email Service: `http://localhost:3002/email`
- SMS Service: `http://localhost:3002/sms`
- IPFS Service: `http://localhost:3002/ipfs`

### Production Mode Endpoints
- Firebase: `https://api.identityprotocol.com/firebase`
- WebSocket: `wss://api.identityprotocol.com/socket.io`
- Cloud Sync: `https://api.identityprotocol.com/sync`
- Email Service: `https://api.identityprotocol.com/email`
- SMS Service: `https://api.identityprotocol.com/sms`
- IPFS Service: `https://api.identityprotocol.com/ipfs`

## Logging

### Development Mode Logging
- Level: `debug`
- Console logs: Enabled
- Network logs: Enabled
- All debug information is visible

### Production Mode Logging
- Level: `error`
- Console logs: Disabled
- Network logs: Disabled
- Only errors are logged

## Security Settings

### Development Mode Security
- Strict CSP: Disabled
- HSTS: Disabled
- Secure Cookies: Disabled

### Production Mode Security
- Strict CSP: Enabled
- HSTS: Enabled
- Secure Cookies: Enabled

## Troubleshooting

### Console Errors in Development

If you see console errors in development mode:

1. **WebSocket Connection Errors**: These are expected in development mode since WebSocket is disabled
2. **API Endpoint Errors**: These are expected since external APIs are not available
3. **Service Worker Errors**: Check if the service worker files exist in the public directory

### Switching Between Modes

To manually switch between modes:

1. **Force Development Mode**:
   ```bash
   VITE_APP_ENV=development npm run dev
   ```

2. **Force Production Mode**:
   ```bash
   VITE_APP_ENV=production npm run dev
   ```

### Updating Production Endpoints

To update production endpoints for deployment:

1. Edit `src/config/deployment.ts`
2. Update the `apiEndpoints` section with your actual production URLs
3. Or use the deployment script:
   ```bash
   node scripts/deploy-config.js --env=production --domain=yourdomain.com
   ```

## Benefits

This system provides several benefits:

1. **No Console Errors**: Development mode disables problematic features that would cause errors
2. **Easy Testing**: You can test the core functionality without external dependencies
3. **Simple Deployment**: Production mode automatically enables all features
4. **Visual Feedback**: Development mode indicator shows current status
5. **Configurable**: Easy to update endpoints and settings for different environments

## Migration from Old System

If you were previously seeing console errors, they should now be resolved because:

1. WebSocket connections are disabled in development mode
2. Cloud sync is disabled in development mode
3. External API calls are disabled in development mode
4. All logging is properly controlled

The application will now load properly in development mode without any console errors, while still providing full functionality in production mode.


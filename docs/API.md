# API Documentation

## Overview

This document provides comprehensive API documentation for the par Noir Identity Dashboard.

## Identity Management APIs

### analytics

**Exported Functions:**
- `analytics`

### cleanupManager

**Exported Functions:**
- `useCleanupManager`

### cloudSync

**Exported Functions:**
- `cloudSyncManager`

### coinbaseWebhook

**Exported Functions:**
- `createWebhookEndpoint`

### cryptoMigrationUtility

**Exported Functions:**
- `migrateEd25519KeyGeneration`
- `migrateECDSAKeyGeneration`
- `migrateECDHKeyGeneration`
- `migrateAES256GCMKeyGeneration`
- `migrateAES256GCMEncryption`
- `migrateAES256GCMDecryption`
- `migrateEd25519Signing`
- `migrateEd25519Verification`
- `migrateSHA512Hashing`
- `migrateSecureRandomGeneration`
- `migratePBKDF2Derivation`
- `migrateScryptDerivation`
- `migratePolynomialOperation`
- `migrateQuantumResistantHashing`
- `migrateLatticeOperation`
- `batchMigrate`
- `isWorkerHealthy`
- `getWorkerPerformanceMetrics`
- `resetWorkerPerformanceMetrics`
- `cleanupCryptoWorker`

### cryptoWorkerManager

**Exported Functions:**
- `cryptoWorkerManager`

### decentralizedAuth

**Exported Functions:**
- `decentralizedAuthManager`
- `useDecentralizedAuth`

### decentralizedEnforcement

**Exported Functions:**
- `COMMERCIAL_OPERATIONS`
- `FREE_OPERATIONS`

### emailService

**Exported Functions:**
- `emailService`

### errorMonitor

**Exported Functions:**
- `errorMonitor`
- `captureError`

### helpers

**Exported Functions:**
- `getTimeAgo`
- `formatDate`
- `generateRandomString`
- `truncateText`
- `capitalizeFirst`
- `formatBytes`
- `debounce`
- `throttle`
- `isPWA`
- `isMobile`
- `getDeviceType`
- `generateDeviceFingerprint`
- `isValidEmail`
- `isValidPhone`
- `sanitizeFilename`
- `getFileExtension`
- `isImageFile`
- `fileToBase64`
- `downloadFile`
- `copyToClipboard`
- `sleep`
- `retry`

### integrationTests

**Exported Functions:**
- `integrationTests`

### ipfs

**Exported Functions:**
- `ipfsClient`

### ipfsMetadataService

**Exported Functions:**
- `ipfsMetadataService`

### ipfsService

**Exported Functions:**
- `ipfsService`

### localStorage

**Exported Functions:**
- `secureStorage`

### logger

**Exported Functions:**
- `logger`

### notificationAPI

**Exported Functions:**
- `notificationAPI`

### notificationsService

**Exported Functions:**
- `notificationsService`

### optimizedStorage

**Exported Functions:**
- `optimizedIdentityStorage`

### orbitCloudAPI

**Exported Functions:**
- `orbitCloudAPI`

### orbitDBService

**Exported Functions:**
- `orbitDBService`

### performanceMonitor

**Exported Functions:**
- `performanceMonitor`
- `measure`
- `measureAsync`
- `recordMetric`

### productionServices

**Exported Functions:**
- `productionServices`

### qrScannerService

**Exported Functions:**
- `qrScannerService`

### rateLimiter

**Exported Functions:**
- `rateLimiters`
- `defaultRateLimiter`

### realtime

**Exported Functions:**
- `realtimeManager`

### routeSplitting

**Exported Functions:**
- `routeConfig`
- `preloadCriticalRoutes`

### security

**Exported Functions:**
- `security`

### smsService

**Exported Functions:**
- `smsService`

### testRunner

**Exported Functions:**
- `runTests`

### verificationService

**Exported Functions:**
- `verificationService`

### websocket

**Exported Functions:**
- `websocketManager`


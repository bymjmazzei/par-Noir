# pN Notification Events Developer Guide

**Version**: 1.0.0  
**Last Updated**: 2024-01-01

---

## Table of Contents

1. [Overview](#overview)
2. [Understanding pN Events](#understanding-pn-events)
3. [Privacy & Sharing Events](#privacy--sharing-events)
4. [Security Events](#security-events)
5. [Recovery Events](#recovery-events)
6. [Integration Events](#integration-events)
7. [Implementation Guide](#implementation-guide)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)

---

## Overview

pN-level notification events are system-generated notifications that inform users about changes to their identity metadata, privacy settings, security events, and other important updates. These events are automatically generated when certain actions occur and are stored in the pN's metadata for cross-device synchronization.

### Key Concepts

- **Event-Driven**: Notifications are triggered by specific actions or changes
- **Metadata-Based**: Stored in pN metadata for automatic sync
- **Cross-Device**: Available on all devices when pN is unlocked
- **Privacy-Preserving**: Encrypted and only accessible to pN owner
- **Auto-Cleanup**: Expired notifications are automatically removed

---

## Understanding pN Events

### Event Flow

```
User Action → System Event → Notification Generation → Metadata Storage → Cross-Device Sync
```

### Event Categories

1. **Privacy & Sharing Events**: Settings changes, data sharing updates
2. **Security Events**: Login attempts, suspicious activity, account locks
3. **Recovery Events**: Recovery requests, custodian actions
4. **Integration Events**: Third-party service connections, device pairing

### Event Priority Levels

- **Critical**: Immediate attention required (security breaches)
- **High**: Important events (recovery requests, security alerts)
- **Medium**: Standard updates (settings changes, custodian actions)
- **Low**: Informational updates (integration changes)

---

## Privacy & Sharing Events

### Privacy Settings Update

**Trigger**: When privacy level or privacy-related settings change

**Event Type**: `privacy-settings-update`

**Common Triggers**:
- Privacy level changed (public → private)
- Data sharing preferences modified
- Profile visibility settings updated
- Contact sharing settings changed

**Example Implementation**:
```typescript
// When privacy settings are updated
async function handlePrivacySettingsUpdate(
  identityId: string,
  setting: string,
  previousValue: any,
  newValue: any,
  reason: string = 'user_request'
) {
  const notification = {
    targetIdentityId: identityId,
    type: 'privacy-settings-update',
    title: 'Privacy Settings Updated',
    message: `Your privacy settings have been modified.`,
    priority: 'medium',
    actionUrl: '/dashboard/privacy',
    metadata: {
      setting,
      previousValue,
      newValue,
      reason,
      timestamp: new Date().toISOString(),
      deviceId: getCurrentDeviceId(),
      location: getCurrentLocation()
    },
    senderId: 'privacy-manager',
    signature: generateSignature()
  };

  await sendNotification(notification);
}
```

### Sharing Settings Update

**Trigger**: When data sharing preferences are modified

**Event Type**: `sharing-settings-update`

**Common Triggers**:
- Profile visibility changed
- Contact sharing enabled/disabled
- Data export settings modified
- Third-party sharing preferences updated

**Example Implementation**:
```typescript
// When sharing settings are updated
async function handleSharingSettingsUpdate(
  identityId: string,
  changedSettings: string[],
  settingsData: Record<string, { previous: any; new: any }>
) {
  const notification = {
    targetIdentityId: identityId,
    type: 'sharing-settings-update',
    title: 'Data Sharing Updated',
    message: 'Your data sharing preferences have been modified.',
    priority: 'medium',
    actionUrl: '/dashboard/sharing',
    metadata: {
      changedSettings,
      ...settingsData,
      timestamp: new Date().toISOString()
    },
    senderId: 'sharing-service',
    signature: generateSignature()
  };

  await sendNotification(notification);
}
```

### Notification Settings Update

**Trigger**: When notification preferences change

**Event Type**: `notification-settings-update`

**Common Triggers**:
- Email notifications enabled/disabled
- Push notifications enabled/disabled
- Notification types added/removed
- Notification frequency changed

**Example Implementation**:
```typescript
// When notification settings are updated
async function handleNotificationSettingsUpdate(
  identityId: string,
  settings: {
    enabledNotifications: { previous: string[]; new: string[] };
    emailNotifications: { previous: boolean; new: boolean };
    pushNotifications: { previous: boolean; new: boolean };
  }
) {
  const notification = {
    targetIdentityId: identityId,
    type: 'notification-settings-update',
    title: 'Notification Preferences Changed',
    message: 'Your notification settings have been updated.',
    priority: 'low',
    actionUrl: '/dashboard/notifications',
    metadata: settings,
    senderId: 'notification-service',
    signature: generateSignature()
  };

  await sendNotification(notification);
}
```

---

## Security Events

### Security Alert

**Trigger**: When security-related events occur

**Event Type**: `security-alert`

**Common Triggers**:
- Suspicious login detected
- Failed login attempts
- Account lockout
- Unusual activity detected
- Security settings changed

**Example Implementation**:
```typescript
// When suspicious login is detected
async function handleSuspiciousLogin(
  identityId: string,
  deviceInfo: {
    browser: string;
    os: string;
    location: string;
    ipAddress: string;
  }
) {
  const notification = {
    targetIdentityId: identityId,
    type: 'security-alert',
    title: 'Suspicious Login Detected',
    message: 'A new device logged into your account from an unknown location.',
    priority: 'high',
    actionUrl: '/dashboard/security',
    metadata: {
      alertType: 'suspicious_login',
      deviceInfo,
      timestamp: new Date().toISOString(),
      riskLevel: 'medium'
    },
    senderId: 'security-monitor',
    signature: generateSignature()
  };

  await sendNotification(notification);
}

// When account is locked
async function handleAccountLock(
  identityId: string,
  reason: string,
  failedAttempts: number,
  lockDuration: string
) {
  const notification = {
    targetIdentityId: identityId,
    type: 'security-alert',
    title: 'Account Temporarily Locked',
    message: 'Your account has been locked due to multiple failed login attempts.',
    priority: 'critical',
    actionUrl: '/dashboard/security',
    metadata: {
      alertType: 'account_locked',
      reason,
      failedAttempts,
      lockDuration,
      unlockTime: new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 minutes
    },
    senderId: 'security-service',
    signature: generateSignature()
  };

  await sendNotification(notification);
}
```

---

## Recovery Events

### Recovery Request

**Trigger**: When identity recovery is requested

**Event Type**: `recovery-request`

**Common Triggers**:
- User initiates recovery process
- Custodian approval required
- Recovery method changed
- Recovery deadline approaching

**Example Implementation**:
```typescript
// When recovery request is initiated
async function handleRecoveryRequest(
  identityId: string,
  requestId: string,
  requestingUser: string,
  recoveryMethod: string,
  custodiansRequired: number
) {
  const notification = {
    targetIdentityId: identityId,
    type: 'recovery-request',
    title: 'Identity Recovery Requested',
    message: 'A recovery request has been initiated for your identity.',
    priority: 'high',
    actionUrl: '/dashboard/recovery',
    metadata: {
      requestId,
      requestingUser,
      recoveryMethod,
      custodiansRequired,
      custodiansApproved: 0,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
    },
    senderId: 'recovery-service',
    signature: generateSignature()
  };

  await sendNotification(notification);
}
```

### Custodian Approval

**Trigger**: When custodian takes action on recovery request

**Event Type**: `custodian-approval`

**Common Triggers**:
- Custodian approves recovery
- Custodian denies recovery
- Custodian added/removed
- Custodian settings changed

**Example Implementation**:
```typescript
// When custodian approves recovery
async function handleCustodianApproval(
  identityId: string,
  custodianId: string,
  custodianName: string,
  action: 'approved' | 'denied',
  requestType: string,
  requestId: string
) {
  const notification = {
    targetIdentityId: identityId,
    type: 'custodian-approval',
    title: 'Custodian Action Completed',
    message: `Custodian '${custodianName}' has ${action} the ${requestType} request.`,
    priority: 'medium',
    actionUrl: '/dashboard/custodians',
    metadata: {
      custodianId,
      custodianName,
      action,
      requestType,
      requestId,
      timestamp: new Date().toISOString()
    },
    senderId: 'custodian-service',
    signature: generateSignature()
  };

  await sendNotification(notification);
}
```

---

## Integration Events

### Integration Update

**Trigger**: When third-party integrations change

**Event Type**: `integration-update`

**Common Triggers**:
- Integration connected/disconnected
- Integration permissions changed
- Integration data synced
- Integration error occurred

**Example Implementation**:
```typescript
// When integration is connected
async function handleIntegrationConnect(
  identityId: string,
  integrationName: string,
  integrationId: string,
  permissions: string[]
) {
  const notification = {
    targetIdentityId: identityId,
    type: 'integration-update',
    title: 'Integration Connected',
    message: `Your account has been successfully connected to '${integrationName}'.`,
    priority: 'low',
    actionUrl: '/dashboard/integrations',
    metadata: {
      integrationName,
      integrationId,
      action: 'connected',
      permissions,
      connectedAt: new Date().toISOString()
    },
    senderId: 'integration-service',
    signature: generateSignature()
  };

  await sendNotification(notification);
}
```

### Device Pairing

**Trigger**: When devices are paired/unpaired

**Event Type**: `device-pairing`

**Common Triggers**:
- New device paired
- Device unpaired
- Device settings changed
- Device sync completed

**Example Implementation**:
```typescript
// When new device is paired
async function handleDevicePairing(
  identityId: string,
  deviceId: string,
  deviceName: string,
  deviceType: string,
  action: 'paired' | 'unpaired'
) {
  const notification = {
    targetIdentityId: identityId,
    type: 'device-pairing',
    title: action === 'paired' ? 'New Device Paired' : 'Device Unpaired',
    message: `${deviceName} (${deviceType}) has been ${action} with your account.`,
    priority: 'medium',
    actionUrl: '/dashboard/devices',
    metadata: {
      deviceId,
      deviceName,
      deviceType,
      action,
      pairedAt: new Date().toISOString(),
      location: getCurrentLocation()
    },
    senderId: 'device-service',
    signature: generateSignature()
  };

  await sendNotification(notification);
}
```

---

## Implementation Guide

### 1. Set Up Event Listeners

```typescript
// Listen for privacy settings changes
privacyManager.on('settingsChanged', async (event) => {
  await handlePrivacySettingsUpdate(
    event.identityId,
    event.setting,
    event.previousValue,
    event.newValue,
    event.reason
  );
});

// Listen for security events
securityMonitor.on('suspiciousActivity', async (event) => {
  await handleSuspiciousLogin(
    event.identityId,
    event.deviceInfo
  );
});

// Listen for recovery events
recoveryService.on('requestInitiated', async (event) => {
  await handleRecoveryRequest(
    event.identityId,
    event.requestId,
    event.requestingUser,
    event.recoveryMethod,
    event.custodiansRequired
  );
});
```

### 2. Create Notification Service

```typescript
class NotificationEventService {
  private api: NotificationAPI;

  constructor() {
    this.api = new NotificationAPI({
      apiKey: process.env.PARNOIR_API_KEY,
      baseURL: 'https://api.parnoir.com/v1'
    });
  }

  async sendNotification(notification: NotificationRequest) {
    try {
      const result = await this.api.sendNotification(notification);
      
      if (result.success) {
        console.log('Notification sent:', result.data.notificationId);
        return result.data;
      } else {
        console.error('Failed to send notification:', result.error);
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error sending notification:', error);
      throw error;
    }
  }

  generateSignature(data: any): string {
    // Implement cryptographic signature generation
    const payload = JSON.stringify(data);
    return crypto.createHmac('sha256', process.env.SIGNATURE_SECRET)
      .update(payload)
      .digest('hex');
  }
}
```

### 3. Handle Event Triggers

```typescript
// Privacy settings change handler
async function onPrivacySettingsChange(identityId: string, changes: PrivacyChanges) {
  const notificationService = new NotificationEventService();
  
  for (const [setting, change] of Object.entries(changes)) {
    await notificationService.sendNotification({
      targetIdentityId: identityId,
      type: 'privacy-settings-update',
      title: 'Privacy Settings Updated',
      message: `Your ${setting} has been updated.`,
      priority: 'medium',
      actionUrl: '/dashboard/privacy',
      metadata: {
        setting,
        previousValue: change.previous,
        newValue: change.new,
        reason: change.reason || 'user_request',
        timestamp: new Date().toISOString()
      },
      senderId: 'privacy-manager',
      signature: notificationService.generateSignature({
        targetIdentityId: identityId,
        setting,
        timestamp: new Date().toISOString()
      })
    });
  }
}

// Security alert handler
async function onSecurityAlert(identityId: string, alert: SecurityAlert) {
  const notificationService = new NotificationEventService();
  
  await notificationService.sendNotification({
    targetIdentityId: identityId,
    type: 'security-alert',
    title: alert.title,
    message: alert.message,
    priority: alert.priority,
    actionUrl: '/dashboard/security',
    metadata: {
      alertType: alert.type,
      ...alert.metadata,
      timestamp: new Date().toISOString()
    },
    senderId: 'security-monitor',
    signature: notificationService.generateSignature({
      targetIdentityId: identityId,
      alertType: alert.type,
      timestamp: new Date().toISOString()
    })
  });
}
```

---

## Best Practices

### 1. Event Design

- **Be Specific**: Include relevant details in metadata
- **Use Appropriate Priority**: Don't overuse high/critical
- **Provide Context**: Explain why the event occurred
- **Include Timestamps**: When the event happened

### 2. Security

- **Always Sign Events**: Use cryptographic signatures
- **Validate Data**: Ensure event data is valid
- **Rate Limit Events**: Don't spam notifications
- **Log Events**: Track event generation for debugging

### 3. User Experience

- **Clear Messages**: Use understandable language
- **Action URLs**: Help users take action
- **Consistent Formatting**: Standardize notification structure
- **Appropriate Timing**: Don't send too many notifications

### 4. Performance

- **Async Processing**: Don't block main operations
- **Error Handling**: Gracefully handle failures
- **Retry Logic**: Implement exponential backoff
- **Monitoring**: Track event processing metrics

---

## Troubleshooting

### Common Issues

1. **Notifications Not Appearing**
   - Check pN ID format
   - Verify signature generation
   - Ensure API key is valid
   - Check rate limits

2. **Events Not Triggering**
   - Verify event listeners are registered
   - Check event data format
   - Ensure proper error handling
   - Monitor event logs

3. **Cross-Device Sync Issues**
   - Verify metadata storage
   - Check encryption/decryption
   - Ensure proper cleanup
   - Monitor sync status

### Debugging Tips

```typescript
// Enable debug logging
const DEBUG = process.env.NODE_ENV === 'development';

if (DEBUG) {
  console.log('Event triggered:', {
    type: event.type,
    identityId: event.identityId,
    metadata: event.metadata
  });
}

// Add request ID for tracking
const requestId = generateRequestId();
console.log('Processing event:', requestId);

// Monitor API responses
const result = await api.sendNotification(notification);
console.log('API response:', {
  requestId,
  success: result.success,
  notificationId: result.data?.notificationId,
  error: result.error
});
```

---

## Support

For developer support and questions:

- **Documentation**: https://docs.parnoir.com/developer/events
- **API Reference**: https://docs.parnoir.com/api/notifications
- **GitHub**: https://github.com/parnoir/developer-docs
- **Support Email**: dev-support@parnoir.com
- **Community**: https://community.parnoir.com

---

**Happy Coding! 🚀**

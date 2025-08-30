# pN Notifications API Reference

**Version**: 1.0.0  
**Base URL**: `https://api.parnoir.com/v1/notifications`  
**Authentication**: API Key or JWT Bearer Token

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Notification Types](#notification-types)
4. [Sending Notifications](#sending-notifications)
5. [Privacy & Sharing Events](#privacy--sharing-events)
6. [Security Events](#security-events)
7. [Recovery Events](#recovery-events)
8. [Integration Events](#integration-events)
9. [Error Handling](#error-handling)
10. [Rate Limiting](#rate-limiting)
11. [SDK Examples](#sdk-examples)

---

## Overview

The pN Notifications API allows external services to send notifications directly to pN identities. Notifications are stored in the pN's metadata and automatically sync across all devices when the pN is unlocked.

### Key Features

- **🔐 Secure**: Notifications are encrypted with pN keys
- **🔄 Cross-Device**: Automatically syncs to all pN devices
- **🛡️ Access Control**: Third parties can only add, not read/modify
- **⚡ Real-time**: Notifications appear immediately when pN is unlocked
- **🗑️ Auto-cleanup**: Expired notifications are automatically removed

### Architecture

```
External Service → API → pN Metadata → All pN Devices
```

---

## Authentication

### API Key Authentication
```http
Authorization: Bearer your-api-key
Content-Type: application/json
```

### JWT Token Authentication
```http
Authorization: Bearer your-jwt-token
Content-Type: application/json
```

### Request Headers
```http
X-API-Version: 1.0
X-Request-ID: unique-request-id
User-Agent: Your-Service-Name/1.0
```

---

## Notification Types

### Core Notification Types

| Type | Description | Priority | Expiration |
|------|-------------|----------|------------|
| `privacy-settings-update` | Privacy settings changed | Medium | 7 days |
| `sharing-settings-update` | Sharing settings changed | Medium | 7 days |
| `security-alert` | Security-related events | High | 30 days |
| `recovery-request` | Identity recovery requests | High | 7 days |
| `custodian-approval` | Custodian actions | Medium | 90 days |
| `integration-update` | Third-party integration changes | Low | 7 days |
| `device-pairing` | Device pairing events | Medium | 7 days |

### Priority Levels

- **`critical`**: Immediate attention required (security breaches)
- **`high`**: Important events (recovery requests, security alerts)
- **`medium`**: Standard updates (settings changes, custodian actions)
- **`low`**: Informational updates (integration changes)

---

## Sending Notifications

### Send Notification

**Endpoint**: `POST /notifications/send`

**Request Body**:
```json
{
  "targetIdentityId": "pn-1234567890abcdef",
  "type": "privacy-settings-update",
  "title": "Privacy Settings Updated",
  "message": "Your privacy settings have been modified to increase security.",
  "priority": "medium",
  "actionUrl": "/dashboard/privacy",
  "metadata": {
    "changedSettings": ["dataSharing", "notifications"],
    "previousValue": "public",
    "newValue": "private",
    "timestamp": "2024-01-01T12:00:00.000Z"
  },
  "senderId": "privacy-service-001",
  "signature": "verified-signature-here"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Notification sent successfully",
  "data": {
    "notificationId": "ext-1704110400000-abc123def",
    "targetIdentityId": "pn-1234567890abcdef",
    "timestamp": "2024-01-01T12:00:00.000Z",
    "expiresAt": "2024-01-08T12:00:00.000Z"
  }
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "message": "Invalid notification request",
  "details": {
    "field": "targetIdentityId",
    "issue": "Invalid pN ID format"
  }
}
```

---

## Privacy & Sharing Events

### Privacy Settings Update

**Type**: `privacy-settings-update`

**Use Case**: Notify pN when privacy settings are modified

**Example**:
```json
{
  "targetIdentityId": "pn-1234567890abcdef",
  "type": "privacy-settings-update",
  "title": "Privacy Level Changed",
  "message": "Your privacy level has been updated from 'Public' to 'Private'.",
  "priority": "medium",
  "actionUrl": "/dashboard/privacy",
  "metadata": {
    "setting": "privacyLevel",
    "previousValue": "public",
    "newValue": "private",
    "reason": "user_request",
    "deviceId": "device-abc123",
    "location": "192.168.1.100"
  },
  "senderId": "privacy-manager",
  "signature": "verified-signature"
}
```

### Sharing Settings Update

**Type**: `sharing-settings-update`

**Use Case**: Notify pN when data sharing preferences change

**Example**:
```json
{
  "targetIdentityId": "pn-1234567890abcdef",
  "type": "sharing-settings-update",
  "title": "Data Sharing Updated",
  "message": "Your data sharing preferences have been modified.",
  "priority": "medium",
  "actionUrl": "/dashboard/sharing",
  "metadata": {
    "changedSettings": ["profileVisibility", "contactSharing"],
    "profileVisibility": {
      "previous": "public",
      "new": "friends_only"
    },
    "contactSharing": {
      "previous": "enabled",
      "new": "disabled"
    },
    "timestamp": "2024-01-01T12:00:00.000Z"
  },
  "senderId": "sharing-service",
  "signature": "verified-signature"
}
```

### Notification Settings Update

**Type**: `notification-settings-update`

**Use Case**: Notify pN when notification preferences change

**Example**:
```json
{
  "targetIdentityId": "pn-1234567890abcdef",
  "type": "notification-settings-update",
  "title": "Notification Preferences Changed",
  "message": "Your notification settings have been updated.",
  "priority": "low",
  "actionUrl": "/dashboard/notifications",
  "metadata": {
    "enabledNotifications": {
      "previous": ["security", "recovery"],
      "new": ["security", "recovery", "updates"]
    },
    "emailNotifications": {
      "previous": true,
      "new": false
    },
    "pushNotifications": {
      "previous": false,
      "new": true
    }
  },
  "senderId": "notification-service",
  "signature": "verified-signature"
}
```

---

## Security Events

### Security Alert

**Type**: `security-alert`

**Use Case**: Notify pN about security-related events

**Example**:
```json
{
  "targetIdentityId": "pn-1234567890abcdef",
  "type": "security-alert",
  "title": "Suspicious Login Detected",
  "message": "A new device logged into your account from an unknown location.",
  "priority": "high",
  "actionUrl": "/dashboard/security",
  "metadata": {
    "alertType": "suspicious_login",
    "deviceInfo": {
      "browser": "Chrome 120.0",
      "os": "Windows 11",
      "location": "Unknown"
    },
    "ipAddress": "203.0.113.1",
    "timestamp": "2024-01-01T12:00:00.000Z",
    "riskLevel": "medium"
  },
  "senderId": "security-monitor",
  "signature": "verified-signature"
}
```

### Account Lock

**Type**: `security-alert`

**Example**:
```json
{
  "targetIdentityId": "pn-1234567890abcdef",
  "type": "security-alert",
  "title": "Account Temporarily Locked",
  "message": "Your account has been locked due to multiple failed login attempts.",
  "priority": "critical",
  "actionUrl": "/dashboard/security",
  "metadata": {
    "alertType": "account_locked",
    "reason": "multiple_failed_logins",
    "failedAttempts": 5,
    "lockDuration": "15 minutes",
    "unlockTime": "2024-01-01T12:15:00.000Z"
  },
  "senderId": "security-service",
  "signature": "verified-signature"
}
```

---

## Recovery Events

### Recovery Request

**Type**: `recovery-request`

**Use Case**: Notify pN about identity recovery requests

**Example**:
```json
{
  "targetIdentityId": "pn-1234567890abcdef",
  "type": "recovery-request",
  "title": "Identity Recovery Requested",
  "message": "A recovery request has been initiated for your identity.",
  "priority": "high",
  "actionUrl": "/dashboard/recovery",
  "metadata": {
    "requestId": "recovery-abc123",
    "requestingUser": "user-456",
    "recoveryMethod": "custodian_approval",
    "custodiansRequired": 2,
    "custodiansApproved": 1,
    "expiresAt": "2024-01-08T12:00:00.000Z"
  },
  "senderId": "recovery-service",
  "signature": "verified-signature"
}
```

### Custodian Approval

**Type**: `custodian-approval`

**Use Case**: Notify pN about custodian actions

**Example**:
```json
{
  "targetIdentityId": "pn-1234567890abcdef",
  "type": "custodian-approval",
  "title": "Custodian Action Completed",
  "message": "Custodian 'John Doe' has approved the recovery request.",
  "priority": "medium",
  "actionUrl": "/dashboard/custodians",
  "metadata": {
    "custodianId": "custodian-789",
    "custodianName": "John Doe",
    "action": "approved",
    "requestType": "recovery",
    "requestId": "recovery-abc123",
    "timestamp": "2024-01-01T12:00:00.000Z"
  },
  "senderId": "custodian-service",
  "signature": "verified-signature"
}
```

---

## Integration Events

### Integration Update

**Type**: `integration-update`

**Use Case**: Notify pN about third-party integration changes

**Example**:
```json
{
  "targetIdentityId": "pn-1234567890abcdef",
  "type": "integration-update",
  "title": "Integration Connected",
  "message": "Your account has been successfully connected to 'Service XYZ'.",
  "priority": "low",
  "actionUrl": "/dashboard/integrations",
  "metadata": {
    "integrationName": "Service XYZ",
    "integrationId": "service-xyz-001",
    "action": "connected",
    "permissions": ["read_profile", "send_notifications"],
    "connectedAt": "2024-01-01T12:00:00.000Z"
  },
  "senderId": "integration-service",
  "signature": "verified-signature"
}
```

### Device Pairing

**Type**: `device-pairing`

**Use Case**: Notify pN about device pairing events

**Example**:
```json
{
  "targetIdentityId": "pn-1234567890abcdef",
  "type": "device-pairing",
  "title": "New Device Paired",
  "message": "A new device has been paired with your account.",
  "priority": "medium",
  "actionUrl": "/dashboard/devices",
  "metadata": {
    "deviceId": "device-abc123",
    "deviceName": "iPhone 15 Pro",
    "deviceType": "mobile",
    "action": "paired",
    "pairedAt": "2024-01-01T12:00:00.000Z",
    "location": "San Francisco, CA"
  },
  "senderId": "device-service",
  "signature": "verified-signature"
}
```

---

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": {
    "field": "field-name",
    "issue": "specific issue description",
    "suggestion": "how to fix the issue"
  },
  "timestamp": "2024-01-01T12:00:00.000Z",
  "requestId": "req-abc123"
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_PN_ID` | 400 | Invalid pN ID format |
| `PN_NOT_FOUND` | 404 | pN does not exist |
| `INVALID_NOTIFICATION_TYPE` | 400 | Unsupported notification type |
| `INVALID_PRIORITY` | 400 | Invalid priority level |
| `MESSAGE_TOO_LONG` | 400 | Message exceeds 500 characters |
| `TITLE_TOO_LONG` | 400 | Title exceeds 100 characters |
| `INVALID_SIGNATURE` | 401 | Invalid or missing signature |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Internal server error |

---

## Rate Limiting

### Rate Limits

- **Standard**: 100 requests per 15 minutes
- **High Priority**: 50 requests per 15 minutes
- **Critical**: 25 requests per 15 minutes

### Rate Limit Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
X-RateLimit-Window: 900
```

### Rate Limit Response

```json
{
  "success": false,
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Rate limit exceeded. Try again in 15 minutes.",
  "retryAfter": 900
}
```

---

## SDK Examples

### JavaScript/TypeScript

```typescript
import { NotificationAPI } from '@parnoir/notification-api';

const api = new NotificationAPI({
  apiKey: 'your-api-key',
  baseURL: 'https://api.parnoir.com/v1'
});

// Send privacy settings update
const result = await api.sendNotification({
  targetIdentityId: 'pn-1234567890abcdef',
  type: 'privacy-settings-update',
  title: 'Privacy Settings Updated',
  message: 'Your privacy level has been changed to Private.',
  priority: 'medium',
  actionUrl: '/dashboard/privacy',
  metadata: {
    setting: 'privacyLevel',
    previousValue: 'public',
    newValue: 'private'
  },
  senderId: 'privacy-service',
  signature: 'verified-signature'
});

if (result.success) {
  console.log('Notification sent:', result.data.notificationId);
} else {
  console.error('Failed to send notification:', result.error);
}
```

### Python

```python
from parnoir_notifications import NotificationAPI

api = NotificationAPI(
    api_key='your-api-key',
    base_url='https://api.parnoir.com/v1'
)

# Send security alert
result = api.send_notification(
    target_identity_id='pn-1234567890abcdef',
    notification_type='security-alert',
    title='Suspicious Login Detected',
    message='A new device logged into your account.',
    priority='high',
    action_url='/dashboard/security',
    metadata={
        'alertType': 'suspicious_login',
        'deviceInfo': {
            'browser': 'Chrome 120.0',
            'location': 'Unknown'
        }
    },
    sender_id='security-monitor',
    signature='verified-signature'
)

if result.success:
    print(f"Notification sent: {result.data.notification_id}")
else:
    print(f"Failed to send notification: {result.error}")
```

### cURL

```bash
curl -X POST https://api.parnoir.com/v1/notifications/send \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "targetIdentityId": "pn-1234567890abcdef",
    "type": "privacy-settings-update",
    "title": "Privacy Settings Updated",
    "message": "Your privacy settings have been modified.",
    "priority": "medium",
    "actionUrl": "/dashboard/privacy",
    "metadata": {
      "setting": "privacyLevel",
      "previousValue": "public",
      "newValue": "private"
    },
    "senderId": "privacy-service",
    "signature": "verified-signature"
  }'
```

---

## Best Practices

### 1. Notification Content

- **Keep titles short**: Maximum 100 characters
- **Be specific**: Include relevant details in metadata
- **Use appropriate priority**: Don't overuse high/critical
- **Provide action URLs**: Help users take action

### 2. Security

- **Always sign notifications**: Use cryptographic signatures
- **Validate pN IDs**: Ensure they exist before sending
- **Rate limit appropriately**: Don't spam notifications
- **Use HTTPS**: Always use secure connections

### 3. Metadata

- **Include timestamps**: When events occurred
- **Add context**: Why the notification was sent
- **Use consistent formats**: Standardize metadata structure
- **Keep it relevant**: Only include necessary information

### 4. Error Handling

- **Handle rate limits**: Implement exponential backoff
- **Validate responses**: Check for success/error status
- **Log failures**: Track failed notification attempts
- **Retry appropriately**: Don't retry indefinitely

---

## Support

For API support and questions:

- **Documentation**: https://docs.parnoir.com/api/notifications
- **SDK Documentation**: https://sdk.parnoir.com/notifications
- **Support Email**: api-support@parnoir.com
- **Status Page**: https://status.parnoir.com
- **GitHub**: https://github.com/parnoir/notification-api

---

**Last Updated**: 2024-01-01  
**API Version**: 1.0.0

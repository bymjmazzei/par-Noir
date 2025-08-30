# Identity Protocol API Reference

**Version**: 1.0.0  
**Base URL**: `https://api.your-domain.com/v1`  
**Authentication**: JWT Bearer Token

---

## Table of Contents

1. [Authentication](#authentication)
2. [DID Management](#did-management)
3. [Authentication & Authorization](#authentication--authorization)
4. [Tool Access Management](#tool-access-management)
5. [Metadata Management](#metadata-management)
6. [Security & Monitoring](#security--monitoring)
7. [Error Handling](#error-handling)

---

## Authentication

All API endpoints require authentication using JWT Bearer tokens.

### Headers
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

### Token Format
JWT tokens are obtained through the authentication endpoints and contain:
- User ID
- Username
- Permissions
- Expiration time
- Issuer information

---

## DID Management

### Create DID

Creates a new Decentralized Identifier (DID) for a user.

**Endpoint**: `POST /dids`

**Request Body**:
```json
{
  "username": "string (3-50 chars, alphanumeric + hyphens)",
  "passcode": "string (min 12 chars, strong password)",
  "displayName": "string (optional)",
  "email": "string (optional, valid email)",
  "preferences": {
    "privacy": "low|medium|high",
    "sharing": "private|selective|public",
    "notifications": "boolean",
    "backup": "boolean"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "did:key:abc123...",
    "username": "testuser",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "status": "active",
    "metadata": {
      "displayName": "Test User",
      "email": "test@example.com",
      "preferences": {
        "privacy": "medium",
        "sharing": "selective",
        "notifications": true,
        "backup": false
      }
    }
  }
}
```

**Error Responses**:
- `400 Bad Request`: Invalid input data
- `409 Conflict`: Username already exists
- `422 Unprocessable Entity`: Weak passcode

### Get DID

Retrieves a specific DID by ID.

**Endpoint**: `GET /dids/{did_id}`

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "did:key:abc123...",
    "username": "testuser",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "status": "active",
    "metadata": { ... }
  }
}
```

**Error Responses**:
- `404 Not Found`: DID not found
- `403 Forbidden`: Insufficient permissions

### List DIDs

Retrieves all DIDs for the authenticated user.

**Endpoint**: `GET /dids`

**Query Parameters**:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)
- `status`: Filter by status (active, inactive, suspended)

**Response**:
```json
{
  "success": true,
  "data": {
    "dids": [
      {
        "id": "did:key:abc123...",
        "username": "testuser",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "status": "active"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "pages": 1
    }
  }
}
```

### Update DID

Updates DID metadata and preferences.

**Endpoint**: `PUT /dids/{did_id}`

**Request Body**:
```json
{
  "metadata": {
    "displayName": "Updated Name",
    "email": "updated@example.com",
    "preferences": {
      "privacy": "high",
      "sharing": "private",
      "notifications": false,
      "backup": true
    }
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "did:key:abc123...",
    "username": "testuser",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "metadata": { ... }
  }
}
```

### Delete DID

Permanently deletes a DID.

**Endpoint**: `DELETE /dids/{did_id}`

**Response**:
```json
{
  "success": true,
  "message": "DID deleted successfully"
}
```

---

## Authentication & Authorization

### Authenticate

Authenticates a user and returns a JWT token.

**Endpoint**: `POST /auth/login`

**Request Body**:
```json
{
  "username": "string",
  "passcode": "string"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "token": "jwt_token_here",
    "refreshToken": "refresh_token_here",
    "expiresIn": 3600,
    "user": {
      "id": "did:key:abc123...",
      "username": "testuser",
      "displayName": "Test User"
    }
  }
}
```

**Error Responses**:
- `401 Unauthorized`: Invalid credentials
- `423 Locked`: Account temporarily locked
- `429 Too Many Requests`: Rate limit exceeded

### Refresh Token

Refreshes an expired JWT token.

**Endpoint**: `POST /auth/refresh`

**Request Body**:
```json
{
  "refreshToken": "string"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "token": "new_jwt_token_here",
    "expiresIn": 3600
  }
}
```

### Logout

Invalidates the current JWT token.

**Endpoint**: `POST /auth/logout`

**Response**:
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### Generate Challenge

Generates a cryptographic challenge for challenge-response authentication.

**Endpoint**: `POST /auth/challenge`

**Request Body**:
```json
{
  "didId": "did:key:abc123..."
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "challenge": "base64_encoded_challenge",
    "expiresAt": "2024-01-01T00:05:00.000Z"
  }
}
```

### Verify Signature

Verifies a cryptographic signature for challenge-response authentication.

**Endpoint**: `POST /auth/verify`

**Request Body**:
```json
{
  "didId": "did:key:abc123...",
  "challenge": "base64_encoded_challenge",
  "signature": "base64_encoded_signature"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "verified": true,
    "user": {
      "id": "did:key:abc123...",
      "username": "testuser"
    }
  }
}
```

---

## Tool Access Management

### Grant Tool Access

Grants access to a specific tool for a DID.

**Endpoint**: `POST /tools/{tool_id}/access`

**Request Body**:
```json
{
  "didId": "did:key:abc123...",
  "permissions": ["read", "write", "delete"],
  "expiresAt": "2024-01-02T00:00:00.000Z"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "toolId": "browser-tool",
    "granted": true,
    "grantedAt": "2024-01-01T00:00:00.000Z",
    "expiresAt": "2024-01-02T00:00:00.000Z",
    "permissions": ["read", "write", "delete"]
  }
}
```

### Revoke Tool Access

Revokes access to a specific tool for a DID.

**Endpoint**: `DELETE /tools/{tool_id}/access/{did_id}`

**Response**:
```json
{
  "success": true,
  "message": "Tool access revoked successfully"
}
```

### List Tool Access

Lists all tool access permissions for a DID.

**Endpoint**: `GET /dids/{did_id}/tools`

**Response**:
```json
{
  "success": true,
  "data": {
    "tools": [
      {
        "toolId": "browser-tool",
        "granted": true,
        "grantedAt": "2024-01-01T00:00:00.000Z",
        "expiresAt": "2024-01-02T00:00:00.000Z",
        "permissions": ["read", "write"]
      }
    ]
  }
}
```

---

## Metadata Management

### Get Metadata

Retrieves metadata for a specific DID.

**Endpoint**: `GET /dids/{did_id}/metadata`

**Response**:
```json
{
  "success": true,
  "data": {
    "displayName": "Test User",
    "email": "test@example.com",
    "preferences": {
      "privacy": "medium",
      "sharing": "selective",
      "notifications": true,
      "backup": false
    },
    "security": {
      "lastLoginAttempt": "2024-01-01T00:00:00.000Z",
      "failedAttempts": 0,
      "accountLockedUntil": null
    }
  }
}
```

### Update Metadata

Updates metadata for a specific DID.

**Endpoint**: `PUT /dids/{did_id}/metadata`

**Request Body**:
```json
{
  "displayName": "Updated Name",
  "email": "updated@example.com",
  "preferences": {
    "privacy": "high",
    "sharing": "private",
    "notifications": false,
    "backup": true
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "metadata": { ... }
  }
}
```

---

## Security & Monitoring

### Get Security Status

Retrieves security status and audit information for a DID.

**Endpoint**: `GET /dids/{did_id}/security`

**Response**:
```json
{
  "success": true,
  "data": {
    "accountStatus": "active",
    "lastLogin": "2024-01-01T00:00:00.000Z",
    "failedAttempts": 0,
    "lockoutUntil": null,
    "securityLevel": "high",
    "auditEvents": [
      {
        "timestamp": "2024-01-01T00:00:00.000Z",
        "event": "login_success",
        "ipAddress": "192.168.1.1",
        "userAgent": "Mozilla/5.0..."
      }
    ]
  }
}
```

### Get Performance Metrics

Retrieves performance metrics for the system.

**Endpoint**: `GET /admin/metrics`

**Headers**: Requires admin privileges

**Response**:
```json
{
  "success": true,
  "data": {
    "system": {
      "uptime": 86400,
      "memoryUsage": {
        "used": 512000000,
        "total": 1024000000,
        "percentage": 50
      },
      "cpuUsage": 25.5
    },
    "api": {
      "requestsPerMinute": 120,
      "averageResponseTime": 150,
      "errorRate": 0.02
    },
    "security": {
      "failedLoginAttempts": 5,
      "blockedIPs": 2,
      "activeSessions": 45
    }
  }
}
```

### Health Check

Checks the health status of the API.

**Endpoint**: `GET /health`

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0",
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "encryption": "healthy"
  }
}
```

---

## Error Handling

All API endpoints follow a consistent error response format:

### Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": "Additional error details (optional)",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid input data |
| `AUTHENTICATION_ERROR` | 401 | Invalid credentials |
| `AUTHORIZATION_ERROR` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `ACCOUNT_LOCKED` | 423 | Account temporarily locked |
| `INTERNAL_ERROR` | 500 | Internal server error |

### Rate Limiting

API endpoints are rate-limited to prevent abuse:

- **Authentication endpoints**: 5 requests per 15 minutes
- **DID creation**: 10 requests per hour
- **General endpoints**: 100 requests per 15 minutes

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

---

## SDK Examples

### JavaScript/TypeScript

```typescript
import { IdentityProtocolAPI } from '@identity-protocol/sdk';

const api = new IdentityProtocolAPI({
  baseURL: 'https://api.your-domain.com/v1',
  token: 'your-jwt-token'
});

// Create DID
const did = await api.dids.create({
  username: 'testuser',
  passcode: 'MySecurePass123!@#'
});

// Authenticate
const auth = await api.auth.login({
  username: 'testuser',
  passcode: 'MySecurePass123!@#'
});

// Update metadata
await api.dids.updateMetadata(did.id, {
  displayName: 'Updated Name',
  preferences: { privacy: 'high' }
});
```

### Python

```python
from identity_protocol import IdentityProtocolAPI

api = IdentityProtocolAPI(
    base_url='https://api.your-domain.com/v1',
    token='your-jwt-token'
)

# Create DID
did = api.dids.create(
    username='testuser',
    passcode='MySecurePass123!@#'
)

# Authenticate
auth = api.auth.login(
    username='testuser',
    passcode='MySecurePass123!@#'
)
```

---

## Support

For API support and questions:

- **Documentation**: https://docs.identity-protocol.com
- **SDK Documentation**: https://sdk.identity-protocol.com
- **Support Email**: api-support@identity-protocol.com
- **Status Page**: https://status.identity-protocol.com

---

**Last Updated**: 2024-01-01  
**API Version**: 1.0.0

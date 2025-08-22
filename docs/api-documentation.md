# Identity Protocol API Documentation

## Overview

The Identity Protocol provides OAuth 2.0 endpoints for third-party authentication and identity management. This documentation covers all available endpoints, authentication flows, and integration patterns.

## Base URL

```
https://identity-protocol.com/api
```

## Authentication

All API requests require authentication using Bearer tokens obtained through the OAuth flow.

```bash
Authorization: Bearer <access_token>
```

## OAuth 2.0 Endpoints

### 1. Authorization Endpoint

**Endpoint:** `GET /oauth/authorize`

**Description:** Initiates the OAuth 2.0 authorization code flow.

**Parameters:**
- `response_type` (required): Must be `code`
- `client_id` (required): Your application's client ID
- `redirect_uri` (required): Your application's callback URL
- `scope` (optional): Space-separated list of requested scopes
- `state` (optional): Random string for CSRF protection
- `nonce` (optional): Random string for replay protection

**Example Request:**
```bash
GET /oauth/authorize?response_type=code&client_id=your-client-id&redirect_uri=https://your-app.com/callback&scope=openid%20profile%20email&state=random-string
```

**Response:**
- **Success:** Redirects to your `redirect_uri` with authorization code
- **Error:** Returns error response with description

### 2. Token Endpoint

**Endpoint:** `POST /oauth/token`

**Description:** Exchanges authorization code for access token.

**Parameters:**
- `grant_type` (required): Must be `authorization_code`
- `code` (required): Authorization code from previous step
- `client_id` (required): Your application's client ID
- `client_secret` (required): Your application's client secret
- `redirect_uri` (required): Must match the one used in authorization

**Example Request:**
```bash
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=authorization_code&client_id=your-client-id&client_secret=your-client-secret&redirect_uri=https://your-app.com/callback
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "openid profile email",
  "state": "random-string"
}
```

### 3. User Info Endpoint

**Endpoint:** `GET /oauth/userinfo`

**Description:** Returns user information based on the access token.

**Headers:**
- `Authorization: Bearer <access_token>`

**Example Request:**
```bash
GET /oauth/userinfo
Authorization: Bearer your-access-token
```

**Response:**
```json
{
  "sub": "user-id",
  "name": "John Doe",
  "email": "john@example.com",
  "username": "johndoe",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

### 4. Token Revocation Endpoint

**Endpoint:** `POST /oauth/revoke`

**Description:** Revokes an access token.

**Parameters:**
- `token` (required): The access token to revoke
- `token_type_hint` (optional): Hint about the token type

**Example Request:**
```bash
POST /oauth/revoke
Content-Type: application/x-www-form-urlencoded

token=your-access-token
```

**Response:**
```json
{
  "message": "Token revoked successfully"
}
```

### 5. Client Registration Endpoint

**Endpoint:** `POST /oauth/clients`

**Description:** Registers a new OAuth client application.

**Parameters:**
- `name` (required): Application name
- `redirect_uri` (required): Callback URL
- `scopes` (optional): Array of requested scopes

**Example Request:**
```bash
POST /oauth/clients
Content-Type: application/json

{
  "name": "My Application",
  "redirect_uri": "https://my-app.com/callback",
  "scopes": ["openid", "profile", "email"]
}
```

**Response:**
```json
{
  "client_id": "generated-client-id",
  "client_secret": "generated-client-secret",
  "redirect_uri": "https://my-app.com/callback",
  "scopes": ["openid", "profile", "email"],
  "name": "My Application"
}
```

## Identity Management Endpoints

### 1. Create Identity

**Endpoint:** `POST /api/identities`

**Description:** Creates a new decentralized identity.

**Parameters:**
- `username` (required): Unique username
- `passcode` (required): Secure passcode
- `displayName` (optional): Display name
- `email` (optional): Email address

**Example Request:**
```bash
POST /api/identities
Content-Type: application/json

{
  "username": "johndoe",
  "passcode": "secure-passcode",
  "displayName": "John Doe",
  "email": "john@example.com"
}
```

**Response:**
```json
{
  "id": "did:identity:123456789abcdefghi",
  "username": "johndoe",
  "displayName": "John Doe",
  "email": "john@example.com",
  "createdAt": "2024-01-01T00:00:00Z",
  "status": "active"
}
```

### 2. Authenticate Identity

**Endpoint:** `POST /api/identities/authenticate`

**Description:** Authenticates an existing identity.

**Parameters:**
- `did` (required): Identity ID
- `passcode` (required): Passcode

**Example Request:**
```bash
POST /api/identities/authenticate
Content-Type: application/json

{
  "did": "did:identity:123456789abcdefghi",
  "passcode": "secure-passcode"
}
```

**Response:**
```json
{
  "id": "did:identity:123456789abcdefghi",
  "username": "johndoe",
  "displayName": "John Doe",
  "email": "john@example.com",
  "status": "active",
  "authenticatedAt": "2024-01-01T00:00:00Z"
}
```

### 3. Update Identity

**Endpoint:** `PUT /api/identities/{id}`

**Description:** Updates identity metadata.

**Headers:**
- `Authorization: Bearer <access_token>`

**Parameters:**
- `displayName` (optional): New display name
- `email` (optional): New email address
- `metadata` (optional): Additional metadata

**Example Request:**
```bash
PUT /api/identities/did:identity:123456789abcdefghi
Authorization: Bearer your-access-token
Content-Type: application/json

{
  "displayName": "John Smith",
  "email": "john.smith@example.com"
}
```

**Response:**
```json
{
  "id": "did:identity:123456789abcdefghi",
  "username": "johndoe",
  "displayName": "John Smith",
  "email": "john.smith@example.com",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

## Custodian Management Endpoints

### 1. Add Custodian

**Endpoint:** `POST /api/identities/{id}/custodians`

**Description:** Adds a recovery custodian to an identity.

**Headers:**
- `Authorization: Bearer <access_token>`

**Parameters:**
- `name` (required): Custodian name
- `contactType` (required): `email` or `phone`
- `contactValue` (required): Contact information
- `type` (optional): `person`, `service`, or `self`

**Example Request:**
```bash
POST /api/identities/did:identity:123456789abcdefghi/custodians
Authorization: Bearer your-access-token
Content-Type: application/json

{
  "name": "Jane Doe",
  "contactType": "email",
  "contactValue": "jane@example.com",
  "type": "person"
}
```

**Response:**
```json
{
  "id": "custodian-id",
  "name": "Jane Doe",
  "contactType": "email",
  "contactValue": "jane@example.com",
  "type": "person",
  "status": "pending",
  "addedAt": "2024-01-01T00:00:00Z"
}
```

### 2. List Custodians

**Endpoint:** `GET /api/identities/{id}/custodians`

**Description:** Lists all custodians for an identity.

**Headers:**
- `Authorization: Bearer <access_token>`

**Example Request:**
```bash
GET /api/identities/did:identity:123456789abcdefghi/custodians
Authorization: Bearer your-access-token
```

**Response:**
```json
{
  "custodians": [
    {
      "id": "custodian-id",
      "name": "Jane Doe",
      "contactType": "email",
      "contactValue": "jane@example.com",
      "type": "person",
      "status": "active",
      "addedAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

## Recovery Endpoints

### 1. Initiate Recovery

**Endpoint:** `POST /api/recovery/initiate`

**Description:** Initiates a recovery process for an identity.

**Parameters:**
- `did` (required): Identity ID
- `claimantContactType` (required): `email` or `phone`
- `claimantContactValue` (required): Contact information

**Example Request:**
```bash
POST /api/recovery/initiate
Content-Type: application/json

{
  "did": "did:identity:123456789abcdefghi",
  "claimantContactType": "email",
  "claimantContactValue": "recovery@example.com"
}
```

**Response:**
```json
{
  "id": "recovery-request-id",
  "status": "pending",
  "requiredApprovals": 2,
  "currentApprovals": 0,
  "expiresAt": "2024-01-04T00:00:00Z"
}
```

### 2. Approve Recovery

**Endpoint:** `POST /api/recovery/{id}/approve`

**Description:** Approves a recovery request (for custodians).

**Headers:**
- `Authorization: Bearer <access_token>`

**Example Request:**
```bash
POST /api/recovery/recovery-request-id/approve
Authorization: Bearer custodian-access-token
```

**Response:**
```json
{
  "id": "recovery-request-id",
  "status": "approved",
  "approvedBy": "custodian-id",
  "approvedAt": "2024-01-01T00:00:00Z"
}
```

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": "error_code",
  "error_description": "Human-readable error description",
  "error_uri": "https://docs.identity-protocol.com/errors/error_code"
}
```

### Common Error Codes

- `invalid_request`: Missing or invalid parameters
- `unauthorized_client`: Invalid client credentials
- `access_denied`: User denied authorization
- `unsupported_response_type`: Unsupported response type
- `invalid_scope`: Invalid scope requested
- `server_error`: Internal server error
- `temporarily_unavailable`: Service temporarily unavailable

## Rate Limiting

API requests are rate-limited to:
- **OAuth endpoints:** 100 requests per 15 minutes per IP
- **Identity endpoints:** 1000 requests per hour per client
- **Recovery endpoints:** 10 requests per hour per identity

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## SDK Integration

### JavaScript/TypeScript

```javascript
import { createIdentitySDK, createSimpleConfig } from '@identity-protocol/identity-sdk';

const sdk = createIdentitySDK(createSimpleConfig(
  'your-client-id',
  'https://your-app.com/callback'
));

// Start authentication
await sdk.authenticate('identity-protocol');

// Handle callback
const session = await sdk.handleCallback(window.location.href);

// Get user info
const userInfo = await sdk.getUserInfo();
```

### React Integration

```javascript
import { useIdentitySDK } from '@identity-protocol/identity-sdk';

function App() {
  const { session, isAuthenticated, authenticate, logout } = useIdentitySDK(config);

  if (isAuthenticated) {
    return <div>Welcome, {session.identity.displayName}!</div>;
  }

  return <button onClick={authenticate}>Sign in with Identity Protocol</button>;
}
```

## Security Best Practices

1. **Always use HTTPS** in production
2. **Validate state parameter** to prevent CSRF attacks
3. **Store tokens securely** and never expose client secrets
4. **Implement proper token refresh** before expiration
5. **Use PKCE** for public clients (mobile apps)
6. **Validate redirect URIs** to prevent open redirects
7. **Implement proper error handling** for all API calls
8. **Use appropriate scopes** - request only what you need

## Testing

Use the test client for development:
- **Client ID:** `test-client`
- **Client Secret:** `test-secret`
- **Redirect URI:** `https://localhost:3000/callback`

## Support

For API support and questions:
- **Documentation:** https://docs.identity-protocol.com
- **Developer Portal:** https://developers.identity-protocol.com
- **GitHub:** https://github.com/identity-protocol
- **Email:** api-support@identity-protocol.com 
# pN OAuth Integration Guide

**Enable users to login to your platform with their pN identity, just like Google OAuth or Meta Login.**

---

## Get a `client_id` and API access

1. **Developer console (hosted):** [https://developers.parnoir.com](https://developers.parnoir.com) (Firebase multisite id **`developers-parnoir`**; fallback [https://developers-parnoir.web.app](https://developers-parnoir.web.app)). Deploy target `hosting:developer` must map to that site id in `.firebaserc`. **Unlock pN** uses the same par Noir OAuth flow as any third-party app: the portal is registered as OAuth client `developer-portal` (override with env `DEVELOPER_PORTAL_CLIENT_ID` on the API). After you unlock, the SPA calls:
   - `POST /api/developer/oauth-clients` — register **your** app’s OAuth client (Bearer token; `owner_pn_id` stored server-side).
   - `POST /api/developer/api-keys` — create an API key for **your** signed-in identity only (Bearer token).
   - `GET /api/developer/oauth-clients` and `GET /api/developer/api-keys` — list what you registered (no secrets).
2. **Local:** Run `apps/developer-portal` (`npm install && npm run dev`, default [http://localhost:5176](http://localhost:5176)). Set `VITE_API_ENDPOINT` to your API if not using production. Optional: `VITE_PN_CLIENT_ID` if you changed `DEVELOPER_PORTAL_CLIENT_ID` on the API. Copy [`apps/developer-portal/.env.example`](../../apps/developer-portal/.env.example) to `.env` as needed.
3. **Break-glass / automation:** `POST /oauth/clients` and `POST /api/admin/api-keys` with `X-Admin-Key: <ADMIN_API_KEY>` — **never** ship `ADMIN_API_KEY` in a browser app; use only from secure operators or CI. See [why-oauth-registry-is-centralized.md](../architecture/why-oauth-registry-is-centralized.md).

4. **Superseded identities:** Poll `GET /api/v1/identity/successor?pn_identifier=` so you do not treat a retired pN as valid forever — see [INTEGRATOR_IDENTITY_SUCCESSION.md](./INTEGRATOR_IDENTITY_SUCCESSION.md).

---

## Quick Start

### Installation

```bash
npm install @identity-protocol/identity-sdk
```

### Basic Integration (Popup Flow)

```typescript
import { createPNOAuthClient } from '@identity-protocol/identity-sdk';

// Initialize OAuth client
const pnAuth = createPNOAuthClient({
  clientId: 'your-client-id', // From developers.parnoir.com or admin POST /oauth/clients
  scopes: ['openid', 'profile'],
  usePopup: true // Opens popup window (like Google OAuth)
});

// Login button handler
async function handleLogin() {
  try {
    const session = await pnAuth.authenticate();
    
    console.log('User logged in:', session.did);
    console.log('pN Name:', session.pnName);
    console.log('Access Token:', session.accessToken);
    
    // Store session and update UI
    localStorage.setItem('pn_session', JSON.stringify(session));
    updateUI();
  } catch (error) {
    console.error('Login failed:', error);
  }
}
```

### React Integration

```tsx
import { useState, useEffect } from 'react';
import { createPNOAuthClient, PNOAuthSession } from '@identity-protocol/identity-sdk';

function LoginButton() {
  const [session, setSession] = useState<PNOAuthSession | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check for existing session
    const stored = localStorage.getItem('pn_session');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.expiresAt > Date.now()) {
        setSession(parsed);
      }
    }
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const pnAuth = createPNOAuthClient({
        clientId: 'your-client-id',
        usePopup: true
      });

      const newSession = await pnAuth.authenticate();
      setSession(newSession);
      localStorage.setItem('pn_session', JSON.stringify(newSession));
    } catch (error) {
      console.error('Login failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (session?.accessToken) {
      const pnAuth = createPNOAuthClient({ clientId: 'your-client-id' });
      await pnAuth.revokeToken(session.accessToken);
    }
    setSession(null);
    localStorage.removeItem('pn_session');
  };

  if (session) {
    return (
      <div>
        <p>Logged in as: {session.pnName || session.did}</p>
        <button onClick={handleLogout}>Logout</button>
      </div>
    );
  }

  return (
    <button onClick={handleLogin} disabled={loading}>
      {loading ? 'Logging in...' : 'Login with pN'}
    </button>
  );
}
```

---

## How It Works

### 1. User Clicks "Login with pN"

When a user clicks your login button, the SDK opens a popup window (just like Google OAuth):

```typescript
const session = await pnAuth.authenticate();
```

### 2. Popup Shows Unlock Screen

The popup displays the pN unlock interface where users:
- Upload their pN identity file (.did or .json)
- Enter their pN name
- Enter their passcode

### 3. User Approves Permissions

After unlocking, users see a consent screen showing what permissions your app is requesting:
- Access to pN identity
- Like and engage with content
- Create and manage feeds

### 4. Authorization Code Returned

The popup sends an authorization code back to your app via `postMessage`.

### 5. Code Exchanged for Tokens

Your app automatically exchanges the code for:
- Access token (for API calls)
- Refresh token (for token renewal)
- User info (DID, pN name)

### 6. User Logged In

Your app receives the session and can now make authenticated API calls.

---

## API Reference

### `createPNOAuthClient(config)`

Creates a new pN OAuth client instance.

**Parameters:**
- `config.clientId` (required): Your app's client ID from par Noir developer portal
- `config.redirectUri` (optional): Redirect URI for non-popup flows
- `config.apiEndpoint` (optional): API endpoint (default: `https://api.parnoir.com`)
- `config.scopes` (optional): OAuth scopes (default: `['openid', 'profile']`)
- `config.usePopup` (optional): Use popup flow (default: `true`)

**Returns:** `PNOAuthClient` instance

### `authenticate(options?)`

Starts the OAuth flow and returns a session.

**Parameters:**
- `options.scope` (optional): Override default scopes
- `options.state` (optional): Custom state parameter

**Returns:** `Promise<PNOAuthSession>`

**Example:**
```typescript
const session = await pnAuth.authenticate({
  scope: ['openid', 'profile', 'email']
});
```

### `getUserInfo(accessToken)`

Gets user information using an access token.

**Parameters:**
- `accessToken`: Valid access token

**Returns:** `Promise<PNOAuthUserInfo>`

**Example:**
```typescript
const userInfo = await pnAuth.getUserInfo(session.accessToken);
console.log(userInfo.did); // User's DID
console.log(userInfo.pn_name); // User's pN name
```

### `refreshAccessToken(refreshToken)`

Refreshes an expired access token.

**Parameters:**
- `refreshToken`: Valid refresh token

**Returns:** `Promise<PNOAuthTokenResponse>`

**Example:**
```typescript
const newTokens = await pnAuth.refreshAccessToken(session.refreshToken);
session.accessToken = newTokens.access_token;
session.expiresAt = Date.now() + (newTokens.expires_in * 1000);
```

### `revokeToken(token, tokenTypeHint?)`

Revokes an access or refresh token.

**Parameters:**
- `token`: Token to revoke
- `tokenTypeHint` (optional): `'access_token'` or `'refresh_token'`

**Example:**
```typescript
await pnAuth.revokeToken(session.accessToken, 'access_token');
```

---

## Complete Example

```typescript
import { createPNOAuthClient, PNOAuthSession } from '@identity-protocol/identity-sdk';

class MyApp {
  private pnAuth = createPNOAuthClient({
    clientId: 'your-client-id',
    usePopup: true
  });

  async login(): Promise<PNOAuthSession> {
    try {
      const session = await this.pnAuth.authenticate();
      
      // Store session
      this.saveSession(session);
      
      // Make authenticated API calls
      await this.loadUserData(session.accessToken);
      
      return session;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  async loadUserData(accessToken: string) {
    const userInfo = await this.pnAuth.getUserInfo(accessToken);
    console.log('User:', userInfo.pn_name || userInfo.did);
    
    // Make your own API calls with the access token
    const response = await fetch('https://your-api.com/user/profile', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    return response.json();
  }

  async logout(session: PNOAuthSession) {
    await this.pnAuth.revokeToken(session.accessToken);
    this.clearSession();
  }

  private saveSession(session: PNOAuthSession) {
    localStorage.setItem('pn_session', JSON.stringify(session));
  }

  private clearSession() {
    localStorage.removeItem('pn_session');
  }
}
```

---

## Registering Your Application

1. **Visit the par Noir Developer Portal**: `https://parnoir.com/developers`
2. **Create a new application**
3. **Get your Client ID**
4. **Configure redirect URIs** (if using redirect flow)
5. **Set requested scopes**

---

## Security Best Practices

1. **Always verify the state parameter** - The SDK handles this automatically
2. **Store tokens securely** - Use `localStorage` or `sessionStorage` appropriately
3. **Handle token expiration** - Check `expiresAt` before making API calls
4. **Revoke tokens on logout** - Always revoke tokens when users log out
5. **Use HTTPS** - Always use HTTPS in production

---

## Comparison with Google OAuth

| Feature | Google OAuth | pN OAuth |
|---------|--------------|----------|
| Flow Type | Popup/Redirect | Popup/Redirect |
| User Experience | Google login screen | pN unlock screen |
| Tokens | Access + Refresh | Access + Refresh |
| User Info | Email, Name, etc. | DID, pN Name |
| Privacy | Google controls data | User controls data |
| Decentralized | No | Yes |

---

## Troubleshooting

### Popup Blocked

If popups are blocked, the SDK will throw an error. Guide users to allow popups for your domain.

### Invalid State Error

This means the state parameter doesn't match. The SDK handles this automatically, but if you see this error, ensure:
- Users aren't opening multiple popups
- Session storage is enabled
- No browser extensions are interfering

### Token Expired

Handle token expiration by refreshing:

```typescript
if (session.expiresAt < Date.now()) {
  const newTokens = await pnAuth.refreshAccessToken(session.refreshToken);
  session.accessToken = newTokens.access_token;
  session.expiresAt = Date.now() + (newTokens.expires_in * 1000);
}
```

---

## Support

- **Documentation**: `https://parnoir.com/docs`
- **Developer Portal**: `https://parnoir.com/developers`
- **API Reference**: `https://api.parnoir.com/docs`


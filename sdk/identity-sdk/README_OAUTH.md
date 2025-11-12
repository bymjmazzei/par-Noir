# pN OAuth Integration - Quick Reference

**Enable users to login with their pN identity, just like Google OAuth or Meta Login.**

## Installation

```bash
npm install @identity-protocol/identity-sdk
```

## Setup

1. **Copy OAuth HTML files** to your `public/` directory:
   - `node_modules/@identity-protocol/identity-sdk/public/oauth-authorize.html` → `public/oauth-authorize.html`
   - `node_modules/@identity-protocol/identity-sdk/public/oauth-callback.html` → `public/oauth-callback.html`

2. **Register your app** at `https://parnoir.com/developers` to get your `clientId`

## Basic Usage

```javascript
import { createPNOAuthClient } from '@identity-protocol/identity-sdk';

// Initialize
const pnAuth = createPNOAuthClient({
  clientId: 'your-client-id',
  usePopup: true // Opens popup (like Google OAuth)
});

// Login
const session = await pnAuth.authenticate();
console.log('Logged in:', session.did, session.pnName);

// Use access token for API calls
const userInfo = await pnAuth.getUserInfo(session.accessToken);
```

## React Example

```tsx
import { createPNOAuthClient } from '@identity-protocol/identity-sdk';

function LoginButton() {
  const handleLogin = async () => {
    const pnAuth = createPNOAuthClient({
      clientId: 'your-client-id',
      usePopup: true
    });
    
    const session = await pnAuth.authenticate();
    localStorage.setItem('pn_session', JSON.stringify(session));
  };

  return <button onClick={handleLogin}>Login with pN</button>;
}
```

## Flow

1. User clicks "Login with pN"
2. Popup opens with pN unlock screen
3. User uploads pN file, enters name & passcode
4. User approves permissions
5. Popup closes, user is logged in

**Just like Google OAuth!**

See full documentation: [PN_OAUTH_INTEGRATION.md](../../docs/developer/PN_OAUTH_INTEGRATION.md)


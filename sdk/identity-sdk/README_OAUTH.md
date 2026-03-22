# pN OAuth Integration - Quick Reference

**Enable users to login with their pN identity, just like Google OAuth or Meta Login.**

## Installation

```bash
npm install @identity-protocol/identity-sdk @par-noir/oauth-ui
```

`@par-noir/oauth-ui` provides the shared popup + consent URL helpers used by the SDK’s browser flow.

## Setup

1. **Copy the static OAuth callback page** into your app’s `public/` directory (must match your registered `redirect_uri`, usually `https://your-app/oauth-callback.html`):
   - Use the same file as the par Noir browser: copy [`apps/aggregator-browser/public/oauth-callback.html`](../../apps/aggregator-browser/public/oauth-callback.html) from this repository.
   - It posts `postMessage` with `{ type: 'oauth_callback', code, state, ... }` back to the opener and must stay in sync with par Noir’s template.

2. **Register your app** at `https://developers.parnoir.com` (or your operator’s developer console) so your `clientId` and redirect URIs are allowed on the API.

3. **Consent is always API-hosted**: the SDK opens `https://api.parnoir.com/oauth/authorize/consent?...` (or your `apiEndpoint`), not a page on your origin.

## Basic Usage

```javascript
import { createPNOAuthClient } from '@identity-protocol/identity-sdk';

const pnAuth = createPNOAuthClient({
  clientId: 'your-client-id',
  usePopup: true, // default; opens popup like Google OAuth
});

const session = await pnAuth.authenticate();
console.log('Logged in:', session.did, session.pnName);
```

## Redirect flow (no popup)

```javascript
const pnAuth = createPNOAuthClient({
  clientId: 'your-client-id',
  usePopup: false,
});
await pnAuth.authenticate(); // full-page navigation; current tab will unload
```

## React Example

```tsx
import { createPNOAuthClient } from '@identity-protocol/identity-sdk';

function LoginButton() {
  const handleLogin = async () => {
    const pnAuth = createPNOAuthClient({ clientId: 'your-client-id' });
    const session = await pnAuth.authenticate();
    localStorage.setItem('pn_session', JSON.stringify(session));
  };

  return <button onClick={handleLogin}>Login with pN</button>;
}
```

## Flow

1. User clicks “Login with pN”
2. Popup opens the par Noir API consent / unlock UI
3. User unlocks with identity file + passcode and approves scopes
4. Redirect to your `oauth-callback.html` → `postMessage` to opener → popup closes
5. SDK exchanges the code for tokens

See full documentation: [PN_OAUTH_INTEGRATION.md](../../docs/developer/PN_OAUTH_INTEGRATION.md)

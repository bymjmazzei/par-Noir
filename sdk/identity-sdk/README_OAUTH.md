# pN OAuth — L5 kit quick reference

User login uses **`/oauth/*` only** (interactive unlock). There is no `/api/v1/oauth` login path.

## Install

Workspace / `file:` deps (not on public npm yet):

```bash
# in package.json
"@identity-protocol/identity-sdk": "file:../../sdk/identity-sdk"
"@par-noir/oauth-ui": "file:../../packages/oauth-ui"
```

## Callback page

Copy the canonical file:

`packages/oauth-ui/static/oauth-callback.html` → your app `public/oauth-callback.html`

## Usage

```javascript
import { createPnIntegratorClient, PN_INTEGRATOR_SCOPES } from '@identity-protocol/identity-sdk';

const pn = createPnIntegratorClient({
  clientId: 'your-client-id',
  redirectUri: `${window.location.origin}/oauth-callback.html`,
  scopes: [...PN_INTEGRATOR_SCOPES],
  usePopup: true
});

const session = await pn.auth.authenticate();
```

For login only: `createPNOAuthClient`.

React unlock UI: `@par-noir/oauth-ui` `UnlockButton`.

See `docs/developer/L5_INTEGRATOR_QUICKSTART.md`.

# @identity-protocol/identity-sdk

L5 integrator kit for par Noir: **pN OAuth**, **Drive silo** (`cloud:app`), **ZKP data points**, succession, and public index.

## Install (monorepo / workspace)

Packages are not published to the public npm registry yet. From this repo:

```bash
# workspace dependency
"@identity-protocol/identity-sdk": "workspace:*"
"@par-noir/oauth-ui": "workspace:*"

# or file:
"@identity-protocol/identity-sdk": "file:../../sdk/identity-sdk"
"@par-noir/oauth-ui": "file:../../packages/oauth-ui"
```

When published to npm:

```bash
npm install @identity-protocol/identity-sdk @par-noir/oauth-ui
```

Copy `packages/oauth-ui/static/oauth-callback.html` into your app `public/` after install (see `static/README.md`).

## Quick start

```typescript
import { createPnIntegratorClient, PN_INTEGRATOR_SCOPES } from '@identity-protocol/identity-sdk';

const pn = createPnIntegratorClient({
  clientId: 'your-client-id',
  redirectUri: `${window.location.origin}/oauth-callback.html`,
  apiEndpoint: 'https://api.parnoir.com',
  scopes: [...PN_INTEGRATOR_SCOPES, 'zkp:age_attestation'],
  usePopup: true
});

const session = await pn.auth.authenticate();
await pn.storage.getStorageRoot(session.accessToken);
await pn.zkp.getDataPoints(session.accessToken, { dataPoints: ['age_attestation'] });
```

Login-only: `createPNOAuthClient`.

## OAuth callback

Copy `packages/oauth-ui/static/oauth-callback.html` into your app `public/` folder (see `static/README.md`).

## Docs

- `docs/developer/L5_INTEGRATOR_QUICKSTART.md`
- `docs/developer/L5_ONE_KIT_REVIEW.md`
- Example: `examples/l5-integrator-starter/`
- Community publish example: `examples/l5-community-starter/`

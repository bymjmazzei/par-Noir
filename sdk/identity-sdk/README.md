# @identity-protocol/identity-sdk

L5 integrator kit for par Noir: **pN OAuth**, **Drive silo** (`cloud:app`), **ZKP data points**, succession, public index, and community publish helpers.

## Install

```bash
npm install @identity-protocol/identity-sdk @par-noir/oauth-ui
```

Copy `node_modules/@par-noir/oauth-ui/static/oauth-callback.html` into your app `public/` after install.

Monorepo contributors: use `workspace:*` from the repo root (`npm install` at root).

Publish preflight: `./scripts/publish-integrator-packages.sh` — see [PUBLISHING.md](./PUBLISHING.md).

## Quick start

```typescript
import { createPnIntegratorClient, PN_INTEGRATOR_SCOPES } from '@identity-protocol/identity-sdk';
import { buildMessagingEmbedUrl, buildFeedEmbedUrl } from '@par-noir/oauth-ui';

const pn = createPnIntegratorClient({
  clientId: 'your-client-id',
  redirectUri: `${window.location.origin}/oauth-callback.html`,
  apiEndpoint: 'https://api.parnoir.com',
  scopes: [...PN_INTEGRATOR_SCOPES, 'zkp:age_attestation'],
  usePopup: true
});

const session = await pn.auth.authenticate();

const messagingSrc = buildMessagingEmbedUrl('your-client-id');
const feedSrc = buildFeedEmbedUrl('your-client-id');
```

See [docs/developer/L5_INTEGRATOR_QUICKSTART.md](../../docs/developer/L5_INTEGRATOR_QUICKSTART.md).

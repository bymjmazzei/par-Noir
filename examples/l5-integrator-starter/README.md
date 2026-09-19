# L5 integrator starter

Minimal Vite app demonstrating par Noir OAuth, integrator Drive silo, and ZKP fetch.

## Setup

1. Copy `.env.example` to `.env` and set `VITE_PN_CLIENT_ID` (Active OAuth client).
2. Register `http://localhost:5180/oauth-callback.html` on [developers.parnoir.com](https://developers.parnoir.com).
3. Copy `oauth-callback.html` from `@par-noir/oauth-ui/static/` (or `../../packages/oauth-ui/static/`) to `public/`.
4. Install:

```bash
# Preferred when published:
npm install @identity-protocol/identity-sdk @par-noir/oauth-ui

# Or from monorepo root:
npm install
cd examples/l5-integrator-starter && npm run dev
```

See [docs/developer/L5_INTEGRATOR_QUICKSTART.md](../../docs/developer/L5_INTEGRATOR_QUICKSTART.md).

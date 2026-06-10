# Platform operator (developer portal)

Operator-only section in the developer portal for OAuth approval and commercial license management.

## Requirements

On the **API** (production):

```bash
PLATFORM_REGISTRY_PN_IDENTIFIER=pn-<hash>   # whose Drive holds platform-registry.xlsx
PLATFORM_OPERATOR_PN_IDS=pn-<hash>,pn-<hash> # who sees Platform nav + /api/developer/platform/*
```

The registry pN must connect Google Drive to the API (same as any user — dashboard Storage settings).

## Operator workflow

1. Sign in to [developers.parnoir.com](https://developers.parnoir.com) with an allowlisted pN.
2. Open **Platform** in the nav.
3. **Initialize Drive registry** (creates `_metadata/platform-registry.xlsx` on operator Drive).
4. Review **Applications** → approve or reject integrator OAuth client requests.
5. Issue **Commercial licenses** for integrators needing elevated API limits or `cloud:app` / ZKP scopes.
6. **Sync to API cache** after changes (also runs every 5 minutes on the API).

## Integrator workflow

- **Credentials** → register OAuth client → status **pending** until operator approval.
- Free-tier API keys (default rate limits, standard scopes) work without a commercial license.
- Elevated limits or commercial scopes require an active license for your pN.

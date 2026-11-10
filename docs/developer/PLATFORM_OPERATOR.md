# Platform operator (developer portal)

Operator-only section in the developer portal for OAuth approval and commercial license management.

## Requirements

On the **API** (production):

```bash
PLATFORM_OPERATOR_PN_IDS=pn-<hash>,pn-<hash> # who sees Platform nav + /api/developer/platform/*
```

The registry (applications, approved OAuth clients, commercial licenses) lives in API Postgres (`platform_applications`, `oauth_clients`, `platform_commercial_licenses`). No operator cloud or Drive token is involved.

## Operator workflow

1. Sign in to [developers.parnoir.com](https://developers.parnoir.com) with an allowlisted pN.
2. Open **Platform** in the nav.
3. Review **Applications** → approve or reject integrator OAuth client requests.
4. Issue **Commercial licenses** for integrators needing elevated API limits or `cloud:app` / ZKP scopes.

Changes take effect immediately.

## Integrator workflow

- **Credentials** → register OAuth client → status **pending** until operator approval.
- Free-tier API keys (default rate limits, standard scopes) work without a commercial license.
- Elevated limits or commercial scopes require an active license for your pN.

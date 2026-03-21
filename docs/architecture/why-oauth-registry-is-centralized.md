# Why the OAuth client registry and API keys are “centralized”

## This is not Layer 1 identity centralization

**User-owned identity** in par Noir still means: the **pn file**, **pn name**, and **passcode** live with the user; the API does not hold those secrets to unlock identities.

## What is centralized on `api.parnoir.com`

When everyone uses the hosted API, these are **already** single-operator concerns:

1. **OAuth clients** — Which third-party apps may use “Sign in with pN” (client id, allowed redirect URLs, scopes). This is the same role as Google’s client registry for “Sign in with Google.”
2. **API keys** — Which server-side callers may access `/api/v1/*` under rate limits and scopes.

Storing these in **PostgreSQL** instead of an **in-memory `Map`** only fixes **durability and operations** (survives restarts, auditable). It does **not** change who owns identity secrets.

## Analogy

- **Passport** = user-held pn file + secrets.  
- **Airline registry** = which carriers are allowed to verify travel documents at your border.  
Registering airlines is not the same as holding everyone’s passport.

## Related code

- OAuth clients: [`api/src/server/modules/clientRegistration.ts`](../../api/src/server/modules/clientRegistration.ts), table `oauth_clients`.
- API keys: [`api/src/server/modules/apiKeyService.ts`](../../api/src/server/modules/apiKeyService.ts), table `api_keys`.

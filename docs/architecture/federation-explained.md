# Federation (explained) — design only

**Status:** Documentation and environment-level API URL configuration only. **No multi-instance federation is implemented** in this codebase until product requirements and trust models are finalized.

## Plain-language goal

Multiple organizations or communities might one day run **their own** par Noir–compatible API instances. **Federation** would let identities, proofs, and (with consent) pointers to public content be recognized **across** instances without collapsing user ownership into a single vendor account system.

## What we are not doing yet

- No cross-instance identity sync, no shared global DID registry, no blockchain.
- The **canonical** production API remains the single coordination point for OAuth client registry, optional succession rows, and aggregator index behavior tied to this deployment.

## Experiments

- Point clients at another base URL via **`VITE_API_ENDPOINT`** (browser apps) or the API’s own deployment env, only for **isolated** tests.
- Third-party apps should treat **base URL + opaque identifiers** as the integration boundary; see `docs/developer/PN_OAUTH_INTEGRATION.md`.

## Hardening before real federation

- Succession and revocation semantics must be **instance-local** or explicitly replicated with a defined trust root.  
- OAuth clients and API keys would need **per-instance** or **federated** registration — not assumed today.  
- Privacy: never replicate pn name, passcode, or raw tokens across instances.

When federation becomes a requirement, extend this document with a threat model and a minimal interoperability profile (discovery document, JWKS or token validation rules, and revocation propagation).

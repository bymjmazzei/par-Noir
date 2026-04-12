# JSON-LD `@context` migration (par Noir)

## Canonical value

New metadata and types in `core/identity-core` use:

`https://parnoir.com/ns/v1#`

This matches the par Noir namespace already emitted in API paths such as aggregator metadata (`@context` alongside Schema.org).

The constant `CONTEXT_URL` in `core/identity-core/src/types/metadata-standards.ts` is set to this URI.

## Legacy string

Older examples and documents may still reference:

`https://identity-protocol.com/v1`

If you validate `@context` strictly, either:

1. **Accept both** URIs during a transition window and normalize writes to `CONTEXT_URL`, or  
2. **Run a one-time migration** on stored JSON (user-owned files, indices) to rewrite `@context` to the canonical URI.

Choose explicitly in product code; do not assume all on-disk payloads already use the new string.

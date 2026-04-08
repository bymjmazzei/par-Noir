# Identity PQC upgrade — implementation plan

This plan implements **`docs/security/IDENTITY_PQC_DECISIONS.md`** (canonical crypto decisions) and updates **OAuth-related flows** so unlock, tokens, and API verification stay consistent end-to-end.

| Field | Value |
|-------|--------|
| **Depends on** | [IDENTITY_PQC_DECISIONS.md](./IDENTITY_PQC_DECISIONS.md) (complete) |
| **Last updated** | 2026-04-07 |

---

## What “upgrade” means (scope)

| Layer | What changes | What mostly stays |
|-------|----------------|-------------------|
| **Identity cryptography** | ML-DSA-65, ML-KEM-768, SHA-3 policy, explicit versioned blobs (§2–§5), WASM execution (§7) | Product UX of “unlock → consent → tokens” |
| **OAuth protocol (HTTP)** | Same **routes and semantics** where possible: `/api/v1/oauth/authorize`, `/oauth/token`, refresh, `redirect_uri`, `state`, `code` exchange | Wire format of **authorization codes** and **what the API verifies** may change if they embed or bind to new key material |
| **ZK (§6)** | **Phase 5** — redesign is **committed** (PQ-aligned ZK); **scheduled after** Phases 0–4 so it does not block PQC identity + OAuth; “defer” = **phase order**, not “cancel redesign.” Interim ECC ZK **fenced** until Phase 5 |

**OAuth** here means: **L5-style pN OAuth** (API key + consent UI + code exchange), not Google OAuth in the dashboard (different layer; see architecture rules).

---

## Repository map (touchpoints)

Use this as a checklist when changing behavior:

| Area | Role |
|------|------|
| **`core/identity-core`** | Identity file, unlock, legacy `encryption/quantum/*` → **quarantine only** (§8) |
| **`packages/`** | New shared PQC module (WASM + thin TS API); avoid duplicating per app |
| **`api/`** | `pnOAuthService`, OAuth routes, auth middleware — verify identities / codes / tokens against **new** material |
| **`packages/oauth-ui`** | Consent + unlock UI used by browser and developer portal |
| **`sdk/identity-sdk`** | `PNOAuthClient`, `AuthenticationManager`, integrator-facing APIs |
| **`apps/aggregator-browser`** | `pnOAuthService`, `useAuthAndSession`, many services using session/API |
| **`apps/id-dashboard`** | `parNoirOAuthInline`, storage flows using OAuth/API token |
| **`apps/prism`** | `prismAuthService`, `AuthContext`, `ApplyModal` OAuth popup |
| **`apps/developer-portal`** | `PortalContext`, `UnlockButton` from `@par-noir/oauth-ui` |
| **`apps/licensing-portal`** | Re-check for API/session usage when PQC lands (may be minimal OAuth) |

---

## Phased delivery

### Phase 0 — Spike and build foundation

1. **Evaluate and pin** a **WASM + liboqs-style** (or equivalent) build for **ML-DSA-65** and **ML-KEM-768** in a **browser + Node** worker (§7).
2. Define **`packages/<name>/`** with: load WASM once, sign/verify, encaps/decaps, **zero** app imports from quarantined `identity-core` quantum code.
3. **CBOR + algorithm IDs** prototype for a minimal **signed** structure (§5) — even if fields are stubbed, prove round-trip in TS.
4. **Exit criteria:** Unit tests with **known-answer** vectors (from NIST / reference impl) for at least one ML-DSA and one ML-KEM operation.

### Phase 1 — Identity core + wire spec

1. Write **`docs/standards/`** (or extend existing) **identity wire format vN**: `format_version`, `sig_alg_id`, `kem_alg_id`, `hash_policy_id`, canonical CBOR rules.
2. Implement **create / load / verify** identity artifacts in **`core/identity-core`** using **`packages/` PQC only** — quarantine old modules per §8 (lint/depcruise rule optional).
3. **SHA-3** for protocol-level hashing per §4 (Web Crypto SHA-3 where available; polyfill or worker if needed).

### Phase 2 — API server

1. Update **`api/src/server/modules/pnOAuthService.ts`** (and related) so authorization codes, token binding, and DID/pN resolution use **new** public keys / proofs as specified.
2. Update **`apiRoutes` OAuth handlers** and **`authMiddleware`** to accept **only** the new identity verification path (no temporary classical+PQC dual verifier).
3. Integration tests: authorize → token → protected route.

### Phase 3 — OAuth UI + SDK

1. **`packages/oauth-ui`** — Unlock path calls **new** crypto from `packages/`; no direct `identity-core` quantum imports.
2. **`sdk/identity-sdk`** — `PNOAuthClient` / `AuthenticationManager` aligned with new session shape and any new fields returned by `/oauth/token` or userinfo.
3. Update **`docs/developer/PN_OAUTH_INTEGRATION.md`** and SDK README claims that still mention “Round 3 Kyber” etc.

### Phase 4 — Apps (parallel where possible)

| App | Tasks |
|-----|--------|
| **aggregator-browser** | Swap `pnOAuthService` / session storage to new types; full **smoke**: browse, feed, messaging entrypoints with new session |
| **id-dashboard** | `parNoirOAuthInline`, `useApiToken`, flows that acquire API tokens after unlock |
| **prism** | `prismAuthService`, `AuthContext`, native vs web OAuth resume |
| **developer-portal** | `PortalContext` + `UnlockButton` — end-to-end “unlock portal” |
| **licensing-portal** | Audit API auth; align if it shares token patterns |

### Phase 5 — ZK redesign (PQ-aligned, §6)

1. **Deliverable:** PQ-aligned ZK consistent with ML-DSA / ML-KEM identity; interim ECC-based ZK removed or strictly non-production until replaced.
2. **Scheduling:** Starts **after** Phases 0–4 (and typically before or in parallel with hardening as capacity allows) — Phases 0–4 **do not** wait on ZK.
3. **Planning:** Separate technical spec when Phase 5 kicks off (research-shaped scope).
4. **Status (2026-04-07):** **Shipped** as `@par-noir/zk-protocol-v2` + [ZK_PROOF_V2.md](../standards/ZK_PROOF_V2.md): STARK inner proof (genSTARK) replaces **issuance** of v1 `sigma`; API verifies **v1 and v2**; dashboard emits **v2** only. See [ZK_PHASE5_SPIKE.md](ZK_PHASE5_SPIKE.md).

### Phase 6 — Hardening

1. **Quarantine enforcement:** eslint `no-restricted-imports` or dependency-cruiser from `apps/*` → `identity-core/.../quantum` (except tests/docs).
2. **Performance:** WASM load time, worker offload for mobile (Prism/Capacitor).
3. **Deploy:** `./deploy.sh` / Firebase; ensure **`VITE_API_ENDPOINT`** builds for all apps.

---

## Testing matrix (definition of “everything works”)

| Check | Description |
|-------|----------------|
| **Unit** | ML-DSA / ML-KEM vectors; CBOR canonicalization; hash policy |
| **API** | OAuth code + token + refresh + revoke (as implemented today) with **new** crypto |
| **SDK** | `PNOAuthClient.authenticate()` in a minimal test page |
| **oauth-ui** | Unlock + consent + callback postMessage |
| **aggregator-browser** | Login, feed load, at least one write path |
| **id-dashboard** | Token acquisition for API operations you rely on |
| **prism** | Popup + full-page OAuth where applicable |
| **developer-portal** | Portal OAuth completion |

### Test pN identities (fixtures)

Per **`IDENTITY_PQC_DECISIONS.md` §1 (PQC-only, no classical compat)** and the new wire format, **existing test pN files / identities created with the old classical stack will not verify** on the new implementation. **No temporary dual verifier** — single PQC path only; regenerate test fixtures.

**Expect to:** generate **new** test identities after the PQC path lands; replace **committed test fixtures** (samples in `core/`, `api` tests, e2e seeds) with PQC-backed artifacts; update any docs that reference sample `.did` / identity blobs.

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| WASM size / load on mobile | Lazy-load; worker; measure early on Prism |
| Spec drift | Single **`IDENTITY_PQC_DECISIONS.md`** + wire spec; PR checklist |
| Accidental quarantine import | Lint rules in Phase 6 |
| Doc / README still claiming old PQC | Sweep `api/README.md`, `sdk/**/README.md` in Phase 3 |
| Old test pN fixtures silently fail | Regenerate fixtures when switching verifiers; grep for sample identity paths in tests |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-03-26 | Initial plan from completed `IDENTITY_PQC_DECISIONS.md` |
| 2026-03-26 | Clarify §6 ZK: Phase 5 = committed redesign; “defer” = schedule order vs Phases 0–4 |
| 2026-03-26 | Note: classical test pN fixtures invalid after PQC-only; regenerate |
| 2026-03-26 | Explicit: **no** temporary dual verifier; single PQC path |
| 2026-04-07 | Phase 5 **delivered**: `zk-protocol-v2` + dual ZK verify (v1/v2) in API; dashboard issues v2 |

# SHARED CODE RULES — Non‑Negotiable

This repo is a monorepo so we can reuse code. Duplicating logic or types across apps is forbidden.

---

## Guiding principles

- **Crypto without blockchain.** The cryptographic asset is decentralized identity, not a blockchain token. Identity is verified through math (pn file + pn name + passcode); no central server. All three factors are required to unlock the identity and everything on top. Crypto primitives must be clear in documentation and codebase.
- **User-owned, centralized to the user.** Users own their digital identity like their real-world identity. They create it at will via **proof-of-work** (see glossary below); there is no central issuer. They can connect real-world ID and share ZKPs with third parties instead of handing over data to store. Decentralization starts with a decentralized identity protocol.
- **Platforms as aggregators and service providers.** The browser is the aggregator: it aggregates public files from users’ Google Drives into feeds. Service providers are any third party. Long term, they use our APIs to leverage the user’s infrastructure instead of storing user data.
- **par Noir as infrastructure.** Identity = layer 1; dashboard = layer 2; API = layer 3; browser = layer 4; third parties = layer 5. User data and content are portable across pN-based systems. Goal: invert surveillance capitalism—users aggregate and broker their own data; systems stay feature- and value-focused instead of exploitative.

**Layer model:** L1 Identity (proof-of-work, 3-factor) → L2 Dashboard (identity interaction, secure cloud) → L3 API (connect to tools) → L4 Browser (aggregate public Drive files into feeds) → L5 Third parties (build on our APIs).

**Glossary — proof-of-work (par Noir):** The cryptographic process by which a user **self-issues** an identity: they supply pn name + passcode (+ pn file); `IdentityCrypto.createIdentity()` in the dashboard performs PQC key generation and encrypts the identity blob. No central issuer and **not** blockchain mining. Unlock verifies the same math (pn file + pn name + passcode).

**Implications for the codebase:** No sensitive data in plain text (see Rules). Feature hierarchy: identity-direct → dashboard + APIs; browser-only → browser only. Crypto primitives clear in docs and code. Canonical identity create/unlock: `apps/id-dashboard/src/utils/crypto.ts` (`IdentityCrypto`); shared extraction to `packages/` is ongoing.

---

## What we're building

- **Identity** (dashboard `IdentityCrypto` + `packages/pqc-crypto`): L1; proof-of-work (credential-driven derivation), 3-factor; no central verification.
- **Dashboard** (`apps/id-dashboard`): L2; where identity is used; secure cloud; identity-direct features + APIs.
- **API** (`api/`): L3; connects dashboard to other tools.
- **Browser** (`apps/aggregator-browser`): L4; aggregates public Drive files into feeds; talks only to API, not Google directly.
- **Third parties:** L5; build on browser/API; user data portable.

---

## 1. Before You Write Any New Code

1. **Could id-dashboard or aggregator-browser or api also need this?**  
   If yes → implement in `core/` or `sdk/` first (or `packages/` when introduced), then import into the app(s).

2. **Am I about to copy a type, util, or service from one app into another?**  
   **Stop.** Put it in shared code (`core/`, `sdk/`, or `packages/` when used); both apps import from it.

3. **Am I adding a file that looks like something in the other app?**  
   **Stop.** Single source of truth in `core/`, `sdk/`, or `packages/`; both apps depend on it.

---

## 2. Where Shared Code Lives

Shared code lives in **`core/`** (e.g. identity-core) and **`sdk/`** (e.g. identity-sdk). When adding shared types or API clients used by multiple apps, use `core/` or `sdk/`; **`packages/`** may be introduced later for additional shared modules.

| What | Where | Used by |
|------|-------|---------|
| Identity / crypto (proof-of-work, 3-factor) | `apps/id-dashboard/src/utils/crypto.ts`, `packages/pqc-crypto`, `packages/dm-crypto` | dashboard, API, browser |
| SDK / client helpers | `sdk/` (e.g. identity-sdk) | apps |
| Types, API clients, pure logic shared by apps | `core/`, `sdk/`, or `packages/` when present | both apps |
| Pure logic used in one app only | `services/` in that app | that app |

Apps: UI, app-specific flows, wiring only. No duplicated types, API logic, or encryption.

---

## 3. Rules (Must Follow)

1. **One definition per concept.** One PublicMetadata, one IndexedFile, one processPDFPagesParallel, one CentralMetadata. If two apps need it, it lives in `core/`, `sdk/`, or `packages/` (when used).
2. **Apps do not import from each other.** Shared code is in `core/`, `sdk/`, or `packages/`.
3. **Services do not import from UI components.** Put the function in `packages/` or `services/`; the component imports it.
4. **Aggregator-browser: API‑only for storage.** No direct googleapis.com or oauth2.googleapis.com. Storage = par Noir API only.
5. **When adding shared code:** Prefer `core/` or `sdk/`. If using `packages/`: `packages/<name>/`, add to root `workspaces`, `package.json` with main/types, `src/index.ts`. Apps: `"@par-noir/<name>": "workspace:*"`.
6. **We are in development.** Do not prioritize backwards compatibility. Prefer correct, simple behavior over preserving legacy or broken behavior.
7. **Do not patch symptoms.** Find the root cause and fix it. Avoid workarounds, compatibility shims, or "quick fixes" that hide the real bug.
8. **Do not commit .env, API keys, secrets, or other sensitive config to git.** Use .env (gitignored), .env.example with placeholders only, or a secrets manager. Pre-commit runs scripts/check-secrets.sh; do not bypass or remove it.
9. **Do not add hardcoded API keys, client IDs, or secrets as fallbacks** when env is unset. Use VITE_* only; fail clearly when required and unset.
10. **When the API provides an endpoint** (e.g. token refresh, drive), use it. Do not add a direct-Google (e.g. oauth2.googleapis.com) fallback.
11. **API base URL:** One config module (e.g. config/api.ts), one env var (VITE_API_ENDPOINT), one default in that module only. Do not scatter process.env.REACT_APP_* or inline API URLs.
12. **No sensitive data in plain text.** pn name, passcode, Google Drive account, age, email, and everything the identity protocol and ZKPs are designed to protect must never appear in plain text in code, server logs, console logs, or anywhere else. If it’s used or shown, encrypt or expose via ZKP; never raw.
13. **Feature hierarchy.** Identity-direct behavior → dashboard + APIs for third parties. Browser-only → browser only.

---

## 4. After completing an update — push and deploy

**Do not treat the task as done until changes are committed, pushed, and deployed.** Leaving work only in the working tree is not done.

1. **Commit:** `git add` (no .env or secrets; pre-commit runs `scripts/check-secrets.sh`), then `git commit -m "<clear message>"`.
2. **Push:** `git push` to `main` (or the project’s deploy branch).
3. **Deploy to Firebase:** Build the app(s) you changed, then run `./deploy.sh` or `firebase deploy --only hosting`. Deploy target is Firebase Hosting (id-dashboard and aggregator-browser). If you changed aggregator-browser, build it before `firebase deploy` so both targets are current.

If you cannot push (e.g. no credentials): before finishing, tell the user exactly what to run: `git add` / `git commit` / `git push`, then `./deploy.sh` or `firebase deploy --only hosting`.

---

## 5. PR / Pre‑Commit Checklist

- [ ] I did not duplicate a type/util/service across apps without putting it in `core/`, `sdk/`, or `packages/`.
- [ ] I did not create two separate implementations of the same thing in two apps.
- [ ] No service imports from a React component to get a pure function.
- [ ] In aggregator-browser, no direct googleapis.com or oauth2.googleapis.com.
- [ ] I did not patch symptoms; I found and fixed the root cause.
- [ ] I did not add backwards-compatibility shims for legacy or broken behavior (we are in development).
- [ ] I did not commit .env, API keys, or secrets; I used .env (gitignored) or a secrets manager.
- [ ] I did not add hardcoded API keys or client IDs as fallbacks.
- [ ] I did not expose pn name, passcode, Google Drive account, age, email, or other identity/ZKP-protected data in plain text in code, logs, or console.
- [ ] I followed the feature hierarchy: identity-direct → dashboard + API; browser-only → browser only.
- [ ] I committed, pushed, and ran deploy (or told the user exactly what to run to push and deploy).

# Testing

Automated tests for the par Noir monorepo: what exists, how to run it locally, and what CI enforces.

## Layout

| Area | Location | Runner |
|---|---|---|
| Identity core (L1) | `core/identity-core/tests` | Vitest |
| SDK | `sdk/identity-sdk` | Jest |
| ZK protocol v1 / v2 | `packages/zk-protocol-v*/test` | `node --test` |
| Shared packages | `packages/*/src/**/*.test.ts` | Vitest |
| API (L3) | `api/src/server/**/*.test.ts` | Jest (ts-jest) |
| Dashboard (L2) | `apps/id-dashboard/src/__tests__` | Jest (ts-jest, jsdom) |
| Dashboard E2E smoke (L2) | `apps/id-dashboard/tests` | Playwright |
| Aggregator browser E2E smoke (L4) | `apps/aggregator-browser/tests` | Playwright |

Packages currently covered by `test:packages`: `pqc-crypto`, `recovery-crypto`, `device-auth`,
`dm-crypto`, `oauth-ui`, `device-cloud-credentials`, `user-owned-storage`, `storage-migration`,
`identity-migration`. Packages without tests yet are intentionally left out so a missing suite
cannot silently pass.

## Running locally

Install once at the repo root:

```bash
npm ci
```

The API installs separately (it is not a root workspace and links shared packages with `file:`),
and its Jest suite resolves those packages from their built `dist/` output:

```bash
cd api && npm ci && npm run build:deps
```

Then, from the repo root:

```bash
npm test                    # everything CI runs: identity, sdk, zk, packages, api, dashboard
npm run test:identity       # core/identity-core
npm run test:sdk            # sdk/identity-sdk
npm run test:zk             # zk-protocol-v1 + v2
npm run test:packages       # shared packages listed above
npm run test:pqc            # packages/pqc-crypto only
npm run test:api            # api Jest suite
npm run test:dashboard:unit # dashboard Jest suite
```

Type checks:

```bash
cd apps/id-dashboard && npm run type-check
cd apps/aggregator-browser && npm run type-check
```

### E2E smoke suites

Both suites run against a **production build** served by `vite preview`, never the dev server:
chunk splitting, minification, and the `VITE_API_ENDPOINT` guard in `config/api.ts` only exist
in a real build, and those are exactly what has broken boot before.

Install the browser binary once per app, then run from the repo root:

```bash
cd apps/id-dashboard && npx playwright install --with-deps chromium
cd apps/aggregator-browser && npx playwright install --with-deps chromium
```

```bash
npm run test:e2e:smoke     # dashboard: builds, then runs the smoke suite (chromium)
npm run test:e2e:browser   # aggregator browser: builds, then runs the smoke suite (chromium)
```

The `:prebuilt` variants skip the build and reuse whatever is in `dist/`, which is what CI uses
so it does not build twice:

```bash
npm run test:e2e:smoke:prebuilt
npm run test:e2e:browser:prebuilt
```

From inside an app you can run the full local browser matrix (chromium, firefox, webkit, and the
two mobile emulations) with `npx playwright test`; CI is chromium-only, because these guard bundle
boot rather than cross-browser rendering. The two suites use different preview ports — dashboard
4173, browser 4174 — so they can run side by side. Override with `PW_PORT`, or point at an
already-running server with `PW_BASE_URL` to skip the managed `vite preview` entirely. On a local
failure Playwright opens the HTML report and keeps serving it until you interrupt it.

What the suites cover:

| Spec | Guards |
|---|---|
| `id-dashboard/tests/unlock-smoke.spec.ts` | Production bundle boots; the three unlock factors render, stay masked, and are never prefilled |
| `id-dashboard/tests/create-modal-smoke.spec.ts` | `?create=1` deep link opens Create New pN, strips only that parameter, and starts both secrets masked and empty |
| `id-dashboard/tests/storage-shell-smoke.spec.ts` | No Drive, storage, or API request happens before unlock; the gate survives a fully failing API |
| `aggregator-browser/tests/browse-smoke.spec.ts` | Production bundle boots without hitting the ErrorBoundary; signed-out shell renders; storage is reached only through the par Noir API |

Every smoke is hermetic. No identity is unlocked, no live Google or par Noir token is used, and
outbound calls are intercepted by the test rather than answered by the network.

**Known limitation — the storage shell is not mounted.** The Storage tab lives inside
`AuthenticatedShell`, which renders only after a real three-factor unlock; `useAppBootstrapEffects`
deliberately clears any restored session on boot, so no deep link or seeded `localStorage` can
shortcut it, and driving a real unlock would mean committing a fixture pn name and passcode. The
storage smoke therefore pins the invariant that makes the gate meaningful — nothing reaches Drive
or the API before unlock — instead of exercising the storage UI itself. Covering that UI needs a
test-only identity fixture with secrets supplied from CI, which is not in place.

Guardrails (the same scripts the pre-commit hook and CI run):

```bash
PN_STRICT_GUARDRAILS=1 bash scripts/check-secrets.sh
bash scripts/check-no-backup-files.sh
bash scripts/check-app-import-boundary.sh
bash scripts/check-quantum-imports.sh
PN_CHECK_ALL=1 bash scripts/check-token-resolver-boundary.sh
PN_CHECK_ALL=1 bash scripts/check-drive-token-freshness-boundary.sh
PN_CHECK_ALL=1 bash scripts/check-owner-fetch-boundary.sh
PN_CHECK_ALL=1 bash scripts/check-googleapis-resolver-import.sh
PN_CHECK_ALL=1 bash scripts/check-oauth-unlock-proof-boundary.sh
PN_CHECK_ALL=1 bash scripts/check-no-passcode-on-oauth-wire.sh
PN_CHECK_ALL=1 bash scripts/check-postmessage-origin-boundary.sh
PN_CHECK_ALL=1 bash scripts/check-legacy-identity-crypto.sh
bash scripts/check-sheets-import-boundary.sh   # soft-warn only until Sheets route collapse finishes
```

Deploy / API env preflight (not PR CI — needs production secrets in the environment):

```bash
PN_STRICT_GUARDRAILS=1 bash scripts/check-production-flags.sh
# Also runs from ./deploy.sh when PN_STRICT_GUARDRAILS=1 is set.
```

Hermetic identity gate (package tests, part of `npm run test:packages`):

- `packages/identity-crypto` — create→unlock→OAuth unlock proof + no-demo-crypto falsification
- `packages/device-cloud-credentials` — `syncHeaderGap.gate.test.ts`
- `api` — `pnOAuthPqc.test.ts`

## What CI runs

`.github/workflows/test.yml` runs on every pull request and on pushes to `main`, in five
parallel jobs. Any red job fails the run.

1. **Guardrails** — secrets scan (strict), backup-file check, app→app import boundary, quantum
   import boundary, Drive token resolver/freshness/owner-fetch/googleapis, OAuth unlock-proof +
   passcode-wire, postMessage origin, legacy identity crypto quarantine, and Sheets import
   boundary (**soft-warn**). `check-production-flags.sh` is **not** in PR CI (needs API env).
2. **Unit tests** — root `npm ci`, API `npm ci` + `npm run build:deps`, then `npm test`
   (includes hermetic `identity-crypto` create→unlock→unlock-proof).
3. **E2E smoke (dashboard)** — builds `apps/id-dashboard` with `VITE_API_ENDPOINT`, then runs the
   Playwright smoke suite on chromium.
4. **E2E smoke (aggregator browser)** — the same for `apps/aggregator-browser`.
5. **Type check** — `tsc --noEmit` for `apps/id-dashboard` and `apps/aggregator-browser`.

Both E2E jobs upload their Playwright HTML report as an artifact when they fail.

`.github/workflows/deploy.yml` is separate and only publishes the static marketing site.

## Writing tests

- Put shared logic and its tests in `core/`, `sdk/`, or `packages/` — not in an app. Apps test
  wiring only.
- Never put a real pn name, passcode, cloud account identifier, email, or age in a fixture, even
  in a test. Use obviously fake placeholders.
- Tests must assert product behavior, not a local re-implementation of it. If a test copies the
  function it claims to cover, it is testing nothing.
- API modules that read config at import time get their placeholder environment from
  `api/jest.setup.cjs`. Add new placeholders there rather than sprinkling `process.env` writes
  across suites.

## Coverage

CI may upload an **informational** API Jest coverage artifact (`api-coverage-lcov`). There is
**no enforced coverage percentage** (the old “80%+ / Cypress” claims in README were aspirational
and incorrect). Prefer meaningful asserts on critical paths over chasing a number.

## Out of scope

These are deliberately not covered by unit tests or CI, because they need live third-party
credentials and would make CI non-deterministic:

- Stripe billing and webhooks
- Veriff identity verification
- Google Drive and Google Sheets round-trips (mocked at the service boundary instead)
- PostgreSQL and Redis integration behavior
- Authenticated end-to-end flows — unlocking an identity, the storage/Drive UI, and anything
  behind `AuthenticatedShell`. These need a fixture identity and its secrets; the Playwright
  suites cover the pre-auth surfaces and the gates around them instead.

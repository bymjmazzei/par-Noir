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
| Aggregator browser (L4) | — | type-check only for now |

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

Guardrails (the same scripts the pre-commit hook and CI run):

```bash
PN_STRICT_GUARDRAILS=1 bash scripts/check-secrets.sh
bash scripts/check-no-backup-files.sh
bash scripts/check-app-import-boundary.sh
bash scripts/check-quantum-imports.sh
```

## What CI runs

`.github/workflows/test.yml` runs on every pull request and on pushes to `main`, in three
parallel jobs. Any red job fails the run.

1. **Guardrails** — secrets scan (strict), backup-file check, app→app import boundary, quantum
   import boundary.
2. **Unit tests** — root `npm ci`, API `npm ci` + `npm run build:deps`, then `npm test`.
3. **Type check** — `tsc --noEmit` for `apps/id-dashboard` and `apps/aggregator-browser`.

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

## Out of scope

These are deliberately not covered by unit tests or CI, because they need live third-party
credentials and would make CI non-deterministic:

- Stripe billing and webhooks
- Veriff identity verification
- Google Drive and Google Sheets round-trips (mocked at the service boundary instead)
- PostgreSQL and Redis integration behavior
- End-to-end browser flows — `npm run test:e2e:smoke` is a placeholder until Playwright lands

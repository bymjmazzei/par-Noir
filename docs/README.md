# Docs

Code and tests are the source of truth for behavior. This index is the map — read a section, not the whole tree.

Patent / filing drafts are maintained **outside** this repository.

## Getting started

- [README](../README.md) — install, dev servers, tests, deploy
- [CONTRIBUTING](../CONTRIBUTING.md)
- [guides/development.md](./guides/development.md)
- [guides/testing.md](./guides/testing.md) and [developer/TESTING.md](./developer/TESTING.md)
- [guides/QUICK_START.md](./guides/QUICK_START.md), [guides/SETUP_GUIDE.md](./guides/SETUP_GUIDE.md), [guides/WHERE_TO_DO_WHAT.md](./guides/WHERE_TO_DO_WHAT.md)

## Architecture and product

- [architecture/overview.md](./architecture/overview.md)
- ADRs and Pen specs under [architecture/](./architecture/) (`ADR_*.md`, `PEN_*_V0.md`)
- [STATUS.md](./STATUS.md) and [LIVE_APPS_STATUS.md](./LIVE_APPS_STATUS.md) — what ships today
- [MESSAGING_ARCHITECTURE.md](./MESSAGING_ARCHITECTURE.md)
- [SHARED_CODE_RULES.md](../SHARED_CODE_RULES.md)

## Integrators (L5)

- [developer/L5_INTEGRATOR_QUICKSTART.md](./developer/L5_INTEGRATOR_QUICKSTART.md)
- [developer/PN_OAUTH_INTEGRATION.md](./developer/PN_OAUTH_INTEGRATION.md)
- [developer/OAUTH_CLIENT_APPROVAL_RUNBOOK.md](./developer/OAUTH_CLIENT_APPROVAL_RUNBOOK.md)
- [api/API_REFERENCE.md](./api/API_REFERENCE.md)

## Storage and cloud

- [developer/USER_STORAGE_LAYOUT.md](./developer/USER_STORAGE_LAYOUT.md)
- [developer/GOOGLE_DRIVE_STRUCTURE.md](./developer/GOOGLE_DRIVE_STRUCTURE.md)
- Provider setup guides under [developer/](./developer/) (`STORAGE_*.md`)

## Security

- [security/SECURITY_OVERVIEW.md](./security/SECURITY_OVERVIEW.md)
- [security/IDENTITY_PQC_DECISIONS.md](./security/IDENTITY_PQC_DECISIONS.md)
- [security/MIGRATION_GUIDE.md](./security/MIGRATION_GUIDE.md)
- [security/HISTORY.md](./security/HISTORY.md) — retired phase/migration logs

## Operations and launch

- [ops/LAUNCH_REMAINING_WORK.md](./ops/LAUNCH_REMAINING_WORK.md)
- [ops/GO_NO_GO_LAUNCH.md](./ops/GO_NO_GO_LAUNCH.md)
- [ops/OAUTH_AND_PRODUCTION_ROLLOUT_CHECKLIST.md](./ops/OAUTH_AND_PRODUCTION_ROLLOUT_CHECKLIST.md)
- [ops/BACKUP_AND_RESTORE_RUNBOOK.md](./ops/BACKUP_AND_RESTORE_RUNBOOK.md)
- [deployment/DEPLOYMENT_GUIDE.md](./deployment/DEPLOYMENT_GUIDE.md)
- Railway / deploy notes under [ops/](./ops/) (moved from repo root)

## History (not current behavior)

- [archive/](./archive/) — superseded plans
- [history/](./history/) — completed implementation checklists and notes
- [DOCS_CLEANUP_TRACKER.md](./DOCS_CLEANUP_TRACKER.md) — 2026-03 cleanup log

Some paths are listed in [`.cursorignore`](../.cursorignore) to reduce agent token load.

## Product QA

You validate visible flows on `.local/test-pn/`. The agent does not open that fixture.

## Live hosting

After commits land, update live sites from the repo root: `./deploy.sh`.

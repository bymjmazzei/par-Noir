# Docs

Code and tests are the source of truth for behavior. This index is the map.

## Use for current work

- `docs/architecture/` — ADRs, `overview.md`, Pen format specs (`PEN_*_V0.md`, `PEN_FORM_FORMAT_SURVEY.md`)
- `docs/developer/` — storage, OAuth, device auth, integrator guides
- `docs/guides/testing.md` and `docs/guides/development.md`
- `docs/ops/` — launch and incident runbooks (except files listed in `.cursorignore`)

Read a named section. Do not load the whole `docs/` tree.

## Not for current behavior

- `docs/archive/` — old diagnostics and plans (ignored by Cursor index)
- `docs/legal/` — patent drafts (ignored by Cursor index)
- Root and app `*PLAN*.md` files listed in `.cursorignore`

## Product QA

You validate visible flows on `.local/test-pn/`. The agent does not open that fixture. See `.cursor/rules/local-test-pn.mdc`.

## Cursor settings (your machine)

These are not in git. They cut token cost more than repo rules:

1. Disable MCP servers (especially browser).
2. Pin the model to Composer while measuring cost. Avoid Auto.
3. Shorten global User Rules. Keep: no subagents unless you ask, no browser, you do QA.
4. Disable unused Agent Skills if the setting is available.
5. New chat per task. Prefer a file path over `@Codebase`.

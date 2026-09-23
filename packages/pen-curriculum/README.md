# @par-noir/pen-curriculum

Model-agnostic teaching data for Pen. External agents (Cursor, Astra, …) read this package — no per-model plugins.

| Path | Purpose |
|------|---------|
| [HANDBOOK.md](./HANDBOOK.md) | Agent invariants + workflow |
| `snapshots/` | Catalog (with `agentStarter`), path grammar, `PenAgentBuild` schema |
| `fixtures/` | Golden intent → build examples + register tables |
| `src/` | Snapshot builders + eval harness |

Pinned to `@par-noir/pen-protocol` `0.1.0`. SoT for templates/prompts remains the protocol package; this package only exports and evaluates.

```bash
cd packages/pen-curriculum && npm test
```

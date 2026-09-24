# Pen agent handbook (v0)

Model-agnostic instructions for building with Pen. Read this plus `snapshots/` and `fixtures/`. Do not invent parallel formats.

**Pinned protocol:** `@par-noir/pen-protocol` `0.1.0` (see package.json `penProtocolVersion`).

## Goal

A user asks you to build something in Pen. You:

1. Pick a **starter template** from the catalog (`snapshots/catalog.json`).
2. Compose that template’s **agentStarter** with the user ask (`{{user_input}}` → their text). Use `composeAgentPrompt(templateId, userInput)` when you can run code; otherwise substitute manually.
3. Emit a **`PenAgentBuild`** JSON object only (schema: `snapshots/pen-agent-build.schema.json`).
4. Validate with `validatePenAgentBuild` before claiming success.
5. Materialize with `materializePenAgentBuild` when a tree is needed — never invent your own folder layout.

## Invariants

- **Template-first.** Choose an existing `templateId`. Do not invent new templates, classes, or section slugs.
- **Output contract.** `PenAgentBuild`: `{ templateId, title, sections?: [...], rows?: [...] }`. Prefer `sections[].plainText`. Register templates use `rows` matching `registerColumns`.
- **No path invention.** Canonical tree is `par-noir-pen/{docId}/doc.json`, `drafts/{draftId}/`, `current/`, `past/`, `history.chain` — see `snapshots/path-grammar.json`.
- **Consumer vs kit.** Kit forms (e.g. `records.register`) are for agents/integrators; do not treat them as consumer New… picks unless the user asked for a register/table.
- **Publish ≠ connect to feed.** Materializing / publishing current updates the doc. Putting content on a public feed is a separate human/follow-on step.
- **No secrets.** Never put pn name, passcode, tokens, or account ids in builds, prompts, or fixtures.
- **Compose from atoms.** Prefer Social/Time/Knowledge atoms (Note, tiles, Metric, Audio, Post, Collection, Set, Event, Knowledge claim). Projects are a thin shell (≤2 examples) — do not invent a Project-only zoo; users publish their own Project templates.
- **Longform** = sequence of atoms (Library Book/Article). **Feed embed** = live L5 iframe slot — never confuse with longform chapters.
- **Knowledge / geo.** Bind `dataPointId` + opaque `proofRef` only. Never raw age, email, coordinates, or Place-as-template.

## Workflow (short)

```
user ask
  → list templates / read catalog
  → composeAgentPrompt(templateId, userAsk)
  → emit PenAgentBuild JSON
  → validatePenAgentBuild
  → materializePenAgentBuild (optional tree)
```

## Examples

See `fixtures/` — each folder has `intent.md` + `build.json`. Eval expects those builds to validate and match the declared `templateId`.

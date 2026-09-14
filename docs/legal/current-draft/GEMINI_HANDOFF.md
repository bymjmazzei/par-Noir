# Gemini handoff — custody-era patent redline

**Date:** 2026-08-25  
**Baseline:** Inventor drafts dated 2026-07-28 (`/Volumes/MJ Drive/MJ/parNoir Patent/`).  
**Working package:** `docs/legal/current-draft/`  
**Status:** Inventor working draft — not filed, not legal advice.

## What changed (one paragraph)

Device-cloud custody is the system: the coordinating API does not retain long-lived user cloud OAuth secrets; the client forwards an ephemeral cloud access token for owner Drive I/O. Public feed membership truth remains the user-authored public index on user cloud. Cache alignment is via owner publish, explicit delete purge, public-content dead-link purge, and owner-device reconcile with a forwarded token. FIG. 1, 9, and 10 drawings were updated accordingly. There is **no** alternate stored-token crawl embodiment in the claims or FIG. 10. Recovery, succession/migration (FIG. 7–8), identity artifact, integrator silo, and ZK envelope families were **not** rewritten.

## Instructions for Gemini

1. Polish the Abstract, Claims, and Specification below (or the sibling `.md` / `.docx` files) into formal USPTO style.
2. **Do not invent new independent claim families.** Polish claim 12–16 (membership alignment) and embodiment language for FIG. 1 / 9 / 10 only.
3. **Do not change** claims 1–11 (recovery / succession) or claims 17–23 (artifact / integrator) except for polish.
4. **Do not add** a server-held-token background crawl as an alternate embodiment.
5. **Leave FIG. 7–8 / migration method language as-is.**
6. Do not edit USPTO forms (Declaration, Micro Entity).
7. Keep reference numerals aligned with [FIGURES.md](./FIGURES.md) and [Drawings.pdf](./Drawings.pdf).

## Deliverables in this folder

| File | Use |
|------|-----|
| [Abstract.md](./Abstract.md) / [Abstract.docx](./Abstract.docx) | Redlined abstract |
| [Claims.md](./Claims.md) / [Claims.docx](./Claims.docx) | Claims 1–23 |
| [Specification.md](./Specification.md) / [Specification.docx](./Specification.docx) | Spec with custody embodiments |
| [FIGURES.md](./FIGURES.md) | Figure descriptions |
| [Drawings.pdf](./Drawings.pdf) | Regenerated 13-sheet packet (FIG. 1, 9, 10 updated) |

External originals on `/Volumes/MJ Drive/MJ/parNoir Patent/` were **not** overwritten. After Gemini polish, replace those `.docx` / `Drawings.pdf` manually if desired.

## Claims — claim 12 family summary

- **12 (independent):** Membership alignment; device-held secrets + forwarded token reconcile + publish/delete/dead-link; index is membership truth.
- **13:** Auth-error skip on index read.
- **14:** Total purge when index removed / empty membership after read.
- **15:** Explicit delete → immediate purge.
- **16:** Spreadsheet public index.
- **17–23:** Artifact + integrator (same as prior 17–23 numbering after crawl dependent removed).

Full text: [Claims.md](./Claims.md).

## Specification (redlined sections)

Edited: Summary third aspect; FIG. 1 detailed description; FIG. 9 folder + `_outbox/`; FIG. 10 custody-only membership alignment; end-of-spec embodiments for ML-DSA OAuth unlock proof and ML-KEM sealed cloud vault.

Unchanged: Recovery vault / Shamir / succession migration narrative (FIG. 2–8), integrator silo (FIG. 11), ZK envelope (FIG. 12), selective disclosure sequence (FIG. 13).

Full text: [Specification.md](./Specification.md).

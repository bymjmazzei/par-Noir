# Current patent copy draft

**Baseline:** Inventor Word drafts dated 2026-07-28 (`/Volumes/MJ Drive/MJ/parNoir Patent/`).  
**Status:** Custody-era redline (2026-08-25) — device-cloud custody as the system; not filed, not legal advice.  
**Working edit surface:** `Abstract.md`, `Claims.md`, `Specification.md`, `FIGURES.md`. Paste polished language into Gemini for final counsel-style text.

## Source files

| File | Role |
|------|------|
| [Abstract.docx](./Abstract.docx) / [Abstract.md](./Abstract.md) | Abstract of the disclosure |
| [Claims.docx](./Claims.docx) / [Claims.md](./Claims.md) | Claims 1–23 |
| [Specification.docx](./Specification.docx) / [Specification.md](./Specification.md) | Full specification (FIG. 1–13) |
| [drawings/](./drawings/) | USPTO-style B&W layout sheets (SVG + PNG) |
| **[Drawings.pdf](./Drawings.pdf)** | Compiled 13-sheet drawings packet |
| [FIGURES.md](./FIGURES.md) | Figure descriptions + numeral list |
| [GEMINI_HANDOFF.md](./GEMINI_HANDOFF.md) | Change summary + polish instructions for Gemini |

## Custody-era redline (vs Jul 28)

- Claim 12 / FIG. 10: membership truth via publish / delete / dead-link purge / owner-device reconcile with forwarded token (no server-held Drive crawl).
- FIG. 1: forwarded ephemeral cloud access token; API does not retain long-lived Drive OAuth secrets.
- FIG. 9: `_outbox/` under `par-noir-messages/`.
- Spec embodiments: ML-DSA OAuth unlock proof; ML-KEM sealed cloud vault.
- FIG. 7–8 / migration claims: unchanged.

## Provisional priority

U.S. Provisional Application No. **63/870,290**, filed August 26, 2025.

## Regenerating drawings

```bash
cd docs/legal/current-draft
npm install
node rasterize_drawings.js
python3 compile_drawings_pdf.py
```

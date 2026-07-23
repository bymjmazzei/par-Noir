# User review — nonprovisional draft package

**Date:** July 5, 2026  
**Reviewer:** Mark Jonathan Mazzei (inventor)

Use this checklist before sending the package to patent counsel.

---

## Package completeness

- [x] **[PATENT_APPLICATION_DRAFT.md](./PATENT_APPLICATION_DRAFT.md)** — merged application (spec + claims + abstract + figures)
- [x] [README.md](./README.md) — index and attorney handoff
- [x] [INVENTION_DISCLOSURE.md](./INVENTION_DISCLOSURE.md) — executive summary
- [x] [PRIOR_ART_EXCLUSIONS.md](./PRIOR_ART_EXCLUSIONS.md) — what we dropped from Aug 2025 provisional
- [x] [SOURCE_MAP.md](./SOURCE_MAP.md) — codebase enablement map
- [x] [FIGURES.md](./FIGURES.md) — FIG. 1–13 specifications
- [x] [NONPROVISIONAL_DRAFT.md](./NONPROVISIONAL_DRAFT.md) — full specification draft
- [x] [CLAIMS_DRAFT.md](./CLAIMS_DRAFT.md) — 4 independent + 28 dependent example claims

---

## Accuracy review (inventor)

Please confirm or correct:

1. **Three-factor unlock** — File + pn name + passcode is correctly described as required for decryption.
2. **Recovery vs re-key** — Same public key for Shamir recovery; new keys for re-key migration.
3. **Unrevokable custodian** — Recovery requires at least one protected custodian approval; matches product intent.
4. **OAuth** — Spec correctly states API hosts OAuth client registry; does not claim “no OAuth servers.”
5. **PQC stack** — ML-DSA-65, ML-KEM-768, SHA3-384 accurately reflects production path.
6. **Aggregator** — Public index on Drive is truth; Postgres is cache; reconcile ~5 min.
7. **License transfer** — Optional dependent only; acceptable given stub implementation.
8. **Omissions** — ML detection, notary, FIPS/HSM, atomic swaps correctly excluded.
9. **User as source of truth** — Spec describes user-held permissions + ZKP store, proof APIs, broker entities (union/exchange) as optional L5; does not overclaim paid marketplace as shipped.
10. **FIG. 13** — Selective disclosure sequence matches product direction (consent on user cloud → proof API → verifier; no raw PII).

---

## Items to supply before counsel files

| Item | Status |
|------|--------|
| Provisional application number (USPTO Patent Center) | ________________ |
| Entity status (micro / small / large) | ________________ |
| Correspondence address | ________________ |
| Selected counsel / firm | ________________ |
| CIP vs nonprovisional decision | ________________ |
| Drawings vendor | ________________ |

---

## Filing deadline

**August 26, 2026** — 12 months from provisional filing date.

Recommended: engage counsel by **June 2026** to allow prior-art search and drawing preparation.

---

## Suggested email to counsel (template)

> Subject: par Noir nonprovisional / CIP — draft package for review  
>
> Inventor: Mark Jonathan Mazzei  
> Provisional filed: August 26, 2025  
> Provisional no.: [INSERT]  
> Deadline: August 26, 2026  
>
> Attached / linked: merged draft `docs/legal/PATENT_APPLICATION_DRAFT.md` (spec + claims + abstract + figure specs). Supporting: source map, prior-art search, invention disclosure.  
>
> Request: (1) prior-art search on recovery vault + unrevokable custodian + public index reconcile; (2) CIP vs nonprovisional recommendation; (3) formal claims and USPTO drawings from FIGURES.md; (4) priority date mapping PROV vs new matter per CLAIMS_DRAFT tags.

---

## Post-review actions

- [ ] Inventor completes accuracy review above
- [ ] Add provisional application number to README and NONPROVISIONAL_DRAFT cross-reference
- [ ] Send package to patent counsel
- [ ] Commission formal prior-art search
- [ ] Convert FIGURES.md to USPTO drawing PDFs
- [ ] Counsel files nonprovisional or CIP before deadline

---

## Revision history

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-07-05 | Initial draft package from codebase analysis |
| 1.1 | 2026-07-05 | User-sovereign data brokering: FIG. 13, spec § selective disclosure, claims 26–29 |
| 1.2 | 2026-07-13 | Merged PATENT_APPLICATION_DRAFT.md added |

# par Noir — Nonprovisional Patent Draft Package

**Status:** Technical draft for patent counsel review — not filed, not legal advice.

**Inventor:** Mark Jonathan Mazzei

**Provisional filing date:** August 26, 2025  
**Provisional title:** *Distributed Identity Management System with Social Recovery and Unified License Framework*

**Recommended filing:** Continuation-in-part (CIP) or nonprovisional claiming priority to the August 26, 2025 provisional. Counsel confirms.

**Hard deadline:** File before **August 26, 2026** (12 months from provisional).

---

## Package index

| Document | Purpose |
|----------|---------|
| **[PATENT_APPLICATION_DRAFT.md](./PATENT_APPLICATION_DRAFT.md)** | **Merged draft** — specification + claims + abstract + figure specs (single counsel-review document) |
| [INVENTION_DISCLOSURE.md](./INVENTION_DISCLOSURE.md) | Executive summary for counsel |
| [PRIOR_ART_EXCLUSIONS.md](./PRIOR_ART_EXCLUSIONS.md) | Crowded areas, differentiation, what we dropped from Aug 2025 provisional |
| [PRIOR_ART_SEARCH.md](./PRIOR_ART_SEARCH.md) | Exploratory search findings vs current claims (Jul 2026): references, § 103 risks, per-claim analysis |
| [SOURCE_MAP.md](./SOURCE_MAP.md) | Claim family → codebase + docs (enablement traceability) |
| [FIGURES.md](./FIGURES.md) | FIG. 1–13 descriptions for drawings vendor |
| [NONPROVISIONAL_DRAFT.md](./NONPROVISIONAL_DRAFT.md) | Main specification draft (Background, Detailed Description, Abstract) |
| [CLAIMS_DRAFT.md](./CLAIMS_DRAFT.md) | Example independent and dependent claims |
| [USER_REVIEW.md](./USER_REVIEW.md) | Inventor review checklist before counsel handoff |

---

## Three-pillar patent narrative

1. **pN identity protocol** — User-held post-quantum identity artifact; three-factor unlock; embedded Shamir recovery material.
2. **User-owned cloud + recovery vault** — Drive-structured recovery vault, unrevokable custodian policy, ZK-gated approvals, dual-path continuity (Shamir recovery vs re-key succession).
3. **Public index aggregation** — User-authored public index as membership truth; server cache reconciled against that index.

**Design philosophy (cross-cutting):** User as source of truth for identity metadata, consent, and attestations on user-controlled cloud storage. Selective disclosure via ZKPs; broker entities (integrators, data unions, exchanges) may relay proofs without holding the vault. See FIG. 13 and NONPROVISIONAL_DRAFT § selective disclosure.

---

## Attorney handoff checklist

### Before filing

- [ ] Enter **provisional application number** from USPTO Patent Center receipt: `________________`
- [ ] Confirm **CIP vs straight nonprovisional** with counsel
- [ ] Commission **formal prior-art search** (Block, Coinbase, Ledger, DKMS/Evernym, personal-cloud vault patents) — exploratory findings + counsel action items already in [PRIOR_ART_SEARCH.md](./PRIOR_ART_SEARCH.md)
- [ ] Refine **claims** in [CLAIMS_DRAFT.md](./CLAIMS_DRAFT.md) — example language only
- [ ] Convert [FIGURES.md](./FIGURES.md) to USPTO drawing sheets (black-and-white, reference numerals)
- [ ] Confirm **entity status** (micro / small / large) for USPTO fees
- [ ] Review **new matter** vs Aug 2025 provisional support (re-key, reconcile, unrevokable custodian, ZK v2, PQC wire format)
- [ ] Assign **correspondence address** and power of attorney if using counsel

### Priority tags (in CLAIMS_DRAFT)

- **PROV** — subject matter arguably supported by August 26, 2025 provisional
- **CIP-NEW** — new matter; priority date = CIP filing date unless counsel finds earlier support

### Known references for search (non-exhaustive)

| Reference | Relevance |
|-----------|-----------|
| Block US 12,536,531 / US 12,579,542 | Social recovery, Shamir, crypto wallets |
| Coinbase US 12,561,456 | Split key backup |
| Ledger Recover (patent-pending) | PVSS, custodian backup, IDV-gated restore |
| Evernym DKMS / US 8,874,770 | SSI, decentralized key management |
| WO2021173265A1 | DID-anchored decentralized authentication |
| Personal-cloud vault patents (e.g. US 2016/0034713) | User-controlled aggregation |
| W3C DID Core, VC, BBS+ | Standards prior art |

### Explicitly excluded from this draft

- ML commercial usage detection, differential privacy enforcement
- Notary / physical-world oracle
- Atomic swaps, FIPS 140-3 L4, HSM, “military-grade” security claims
- “No central OAuth servers” (par Noir operates hosted OAuth at the API)
- secp256k1 / ECDSA as primary identity cryptography
- Blind messaging routing (documented no-go in ADR)

### Git / confidentiality

These files are **committed by default** for version history during prosecution drafting. If counsel prefers pre-filing secrecy, add `docs/legal/` to `.gitignore` until filing.

---

## Revision log

| Date | Change |
|------|--------|
| 2026-07-05 | Initial draft package created from codebase and Aug 2025 provisional gap analysis |
| 2026-07-05 | Added user-as-source-of-truth / selective disclosure / broker entities (FIG. 13); claims 26–29 |
| 2026-07-06 | Exploratory prior-art search: PRIOR_ART_SEARCH.md added; risk annotations on independent claims 1–4 |
| 2026-07-13 | Merged PATENT_APPLICATION_DRAFT.md (spec + claims + abstract + figure appendix) |

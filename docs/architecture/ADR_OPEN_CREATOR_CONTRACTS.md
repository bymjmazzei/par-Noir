# ADR: Open creator contracts + licensing ZKP

**Status:** Accepted (groundwork)  
**Date:** 2026-09-23  
**Related:** [`ADR_PEN.md`](./ADR_PEN.md), [`CREATOR_FUND_AND_SUBSCRIPTION_ECONOMICS.md`](../business/CREATOR_FUND_AND_SUBSCRIPTION_ECONOMICS.md), [`@par-noir/pen-protocol`](../../packages/pen-protocol), [`@par-noir/zk-protocol-v2`](../../packages/zk-protocol-v2), aggregator `LICENSE_TYPES`

## Context

Pen templates and docs need a **root** place for (1) work license, (2) open creator contracts that claim a fraction of platform-defined royalty buckets, and (3) a ZKP-shaped commitment so grants can later be proven without redistributing protected asset bytes (fonts, stems, etc.). Monetization go-live (Stripe / fund period close) remains deferred; this ADR fixes the IR and policy spine first.

## Decisions

1. **Root fields:** Every `PenTemplate` may declare `licensing`; every `PenDocManifest` normalizes to a `licensing` root (`workLicense` + `contracts[]`). Share/IndexedFile metadata must eventually mirror `workLicense`; it is not the SoT.

2. **Work license vs asset/grant policy:**  
   - **Work license** — how others may use *this* work (aligned with aggregator `LICENSE_TYPES`: ARR, CC-*, etc.).  
   - **Open creator contract** — economic claim on a **platform royalty bucket** (`content_rights` | `music`), not a substitute for the work license.  
   - **Asset grants** (fonts/stems) — follow-on; ZKP binds terms + holder, never requires shipping the file to aggregators.

3. **Platform buckets (defaults, bps of post bounty = 10000):**  
   - Engager pool: **1500**  
   - Content-rights bucket: **1500** (template use + remix parents)  
   - Music bucket: **1000**  
   - Royalty cap: content-rights + music ≤ **2500**  
   - Publisher residual: remainder (≥ **6000** under defaults)

4. **Open contract `claimBps`:** 0–10000 = fraction of **that party’s bucket** claimed by the rights holder. Unclaimed remainder of the bucket → **publisher**. UI “100%” means “claim the platform max for this party,” not 100% of the post.

5. **Collaborator `splits[]`:** Divide only the **claimed** amount for that contract; `shareBps` must sum to 10000. At most one contract per `party` on a given asset root.

6. **Lineage:** Use vs remix edges remain `basedOnTemplateId` / `basedOnFileId` + remix signals (`penTemplateKind`, layer lock fingerprint). Allocation math may later weight use vs remix inside the content-rights bucket; groundwork stores contracts on the asset that earns.

7. **ZKP:** Context `parnoir.open_creator_contract.v1` on zk-protocol-v2 envelopes. Public inputs bind `asset_id`, `party`, `claim_bps`, `splits_commitment`, `work_license`, `holder_pn_hash`, timestamps. Full selective-disclosure circuits and mint UX are follow-ons.

8. **Pure math first:** `allocatePostBounty` lives in `@par-noir/pen-protocol` and is unit-tested. Creator fund period close must not call it until a dedicated follow-on wires payouts.

## Non-goals (this phase)

Period-close allocator changes; Stripe; Pen contract editor UI; licensing portal / music registry schema; My fonts / Drive fonts folder; publish rasterization.

## Consequences

| Gain | Cost |
|------|------|
| One licensing/economics root for templates, docs, later music | Manifest migration / normalize on load |
| Creators can leave unclaimed bucket share to remixers | Product copy must explain claim ≠ post % |
| ZKP-ready grant commitments | Envelope context must stay stable |

## Follow-ons

Fund close reads `allocatePostBounty`; Pen open-contract editor; music `splits_metadata` = same shape; asset grant ZKPs for fonts/stems; engager weight table (comment / reply / repost-originated).

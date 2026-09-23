# ADR: Open creator contracts + licensing ZKP

**Status:** Accepted (wired)  
**Date:** 2026-09-23  
**Related:** [`ADR_PEN.md`](./ADR_PEN.md), [`CREATOR_FUND_AND_SUBSCRIPTION_ECONOMICS.md`](../business/CREATOR_FUND_AND_SUBSCRIPTION_ECONOMICS.md), [`@par-noir/pen-protocol`](../../packages/pen-protocol), [`@par-noir/zk-protocol-v2`](../../packages/zk-protocol-v2), aggregator `LICENSE_TYPES`

## Context

Pen templates and docs need a **root** place for (1) license **family**, (2) open creator contracts / paid offers, and (3) ZKP commitments for grants without redistributing protected asset bytes.

## Decisions

1. **Root fields:** Every `PenTemplate` / `PenDocManifest` normalizes to `licensing` with `family` + `contracts` / `offers`. IndexedFile metadata snapshots `licensing` at publish (not SoT).

2. **Three families:**
   - **`unconditionalFree`** — default for non-membership; Use/remix without fund claims or Checkout.
   - **`implied`** — membership only; open contracts + `allocatePostBounty` fund path.
   - **`unconditionalPaid`** — membership + Connect; upfront price; seller-MoR Stripe direct charge; `parnoir.license_key.v1`; buyer `records.asset_key` receipt.

3. **Verified membership** = identity verification current + monetization maintenance. Monetization SKUs (implied, paid, Connect sell, fund receive) ⊆ membership. Fail closed without it.

4. **Payment rails:** Platform Stripe is MoR only for maintenance / fund G. Unconditional paid uses **seller Connect direct charge** (Shopify-style). No raw `sk_` paste; no platform MoR for asset sales.

5. **Music** = Pen form `library.music`. **Asset key** = kit `records.asset_key`. Licensing portal is thin UX over Pen music docs.

6. **Platform buckets / claimBps / splits** — unchanged defaults (engager 1500, content 1500, music 1000, cap 2500).

7. **ZKP:** `parnoir.open_creator_contract.v1` (implied contracts); `parnoir.license_key.v1` (paid grants).

8. **Period close** calls `allocatePostBounty` for micro weights; non-implied roots contribute **0** claim.

## Consequences

| Gain | Cost |
|------|------|
| Clear membership vs free path | Veriff go-live still gates membership in prod |
| Seller MoR for asset sales | Connect required before paid offers |
| Pen template-first music + keys | Legacy registry is attach/index only |

## Follow-ons

My fonts; deeper selective-disclosure circuits; engager weight refinements (repost-originated); Veriff product UX.

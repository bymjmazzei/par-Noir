# Creator fund and subscription economics

**Status:** Policy source of truth (principles and formulas). **Implementation** (ledger, webhooks, entitlements) is not yet wired in production; see [Relationship to codebase](#relationship-to-codebase).

**Audience:** Product, legal/compliance review, and engineering when building payouts and reporting.

---

## Strategic context (Web5 / infrastructure)

par Noir is intended as **infrastructure** (identity → dashboard → API → browser → **third parties**), not only a social product.

- **Verification + subscription** support **L5 tools and platforms** built on the API (access, trust, compliance), not only **creator payouts** and social reputation.
- Stronger **non-social** reasons to verify **increase** paying verified headcount and **grow the creator fund numerator** without relying on feed vanity alone.

---

## Locked product rules (confirmed)

| Rule | Definition |
|------|------------|
| **Who may earn from the fund** | Identity **verified** **and** paying the **monthly subscription** that **maintains** monetization eligibility. If either lapses, **no new accrual** from the fund until restored. |
| **Engagement** | **All** engagement counts for product/analytics. **Bounty** (fund allocation) weight: **90%** from engagement **by verified** accounts, **10%** from engagement **by unverified** accounts. |
| **Cash waterfall** | **Gross** `G` → pay **`E`** (monthly OPEX) → **`R = max(0, G - E)`** → **25%** of **`R`** to platform / **75%** of **`R`** to the **creator fund**. On each piece of content, **library music** applies **75% creator / 25% music pool** to the **creator’s** share of that reward (see Music). |

Symbols:

- **`G`**: In-scope gross receipts for the period (e.g. subscription fees collected; define whether net of PSP fees at collection time in accounting policy).
- **`E`**: Monthly operating expenses charged **before** the 25/75 split (see [OPEX categories](#opex-categories-policy-draft)).
- **`R`**: Remainder after OPEX: `max(0, G - E)`.

---

## Ideology

- **Fair:** Same rules for everyone who qualifies; music rights honored when library audio is used.
- **Practically un-gameable:** **Paid verification + recurring subscription** is the **primary** defense: each coordinated identity pays monthly and passes identity checks, making **typical** collusion rings and casual sybil farms **economically costly** relative to expected bounty. **Operational backstops** (rate limits, anomaly detection, caps, audit trails) still apply as **fund size and reward density** grow.
- **Self-sustaining:** **Gross covers variable OPEX first**; the platform **25% applies to `R`**, not to gross while hiding infra in “profit.” The **creator fund** scales with **paying verified subscribers × price**, modulo **`E`** and creator competition for the pool.
- **Honest limits:** The model does **not** scale infinitely; see [Scaling and limits](#scaling-and-limits).

---

## Eligibility (who earns from the creator fund)

1. **Identity verified** via the trust / identity verification path used for feeds and API context. This is **not** pn name, passcode, or raw PII in logs.
2. **Active paid monthly subscription** required to **maintain** verified + monetization status. **Lapse** → no new fund accrual until both conditions are met again.

---

## Engagement and bounty weighting

- **All engagement counts** for tallies (UX, analytics, health metrics).
- **Bounty allocation** for a period: **90%** of the weighted bounty pool attributed to actions by **verified** accounts; **10%** attributed to actions by **unverified** accounts (same events, different **weight buckets** for fund math).

**Implementation (future):** Define “attributable to verified” precisely (e.g. actor DID verified **and** subscribed at **event time**). Document edge cases: lapse mid-period, deleted accounts, automation, appeals.

---

## Music

| Content | Creator share of that content’s creator-side reward |
|---------|------------------------------------------------------|
| **No** licensed library music | **100%** to creator |
| **Uses** music from the **licensed library** | **75%** creator / **25%** to music rights pool (per-track split among artists—**registry and proof TBD**; see [Open decisions](#open-decisions)) |

---

## Revenue waterfall

1. Collect **`G`** (subscriptions and other in-scope gross as defined in accounting policy).
2. Pay **`E`** (monthly OPEX; transparent categories).
3. Compute **`R = max(0, G - E)`**.
4. **Platform:** `0.25 × R`. **Creator fund:** `0.75 × R`, then distributed using engagement + music rules.

**Rationale:** Variable costs scale with usage. Applying **`E` to `G` first** avoids implicitly **eating scaling infra out of the platform’s 25%**; both platform and fund share only what remains after **documented** operations spend.

---

## OPEX categories (policy draft)

Include in **`E`** (subject to final finance/legal list):

- API hosting, database, egress (e.g. Railway-class compute).
- Static hosting / CDN (e.g. Firebase Hosting).
- Identity verification vendor (e.g. Veriff)—**per-check** and/or minimum commit.
- Payment service provider fees (% of volume).
- Trust, safety, and support directly tied to operating the network.
- Compliance and security tooling required to run production.

**Optional / reporting choice:** **Exclude** or **separately tag** internal dev tooling (e.g. IDE subscriptions) so **creator-facing** “OPEX” reflects **platform delivery** cost only. Document the choice under **`E` transparency** in [Open decisions](#open-decisions).

**Architecture note:** User-owned storage (e.g. Google Drive for public index and user content) keeps **baseline media/storage OPEX** lower than fully hosted UGC platforms; **`E` is still not zero** at scale (API, DB, verification, PSP, moderation).

---

## Scaling and limits

- **Aggregate creator fund** grows roughly with **paying verified headcount × price**, after **`E`**.
- **Per-creator payouts** depend on **fund size** and **how many creators and posts** compete in the same period (supply can **dilute** per-head payouts).
- **Ceilings:** **TAM** caps **`G`**; **`E`** can grow faster than **`G`** under abuse or poor unit economics, shrinking **`R`** for **both** slices; **infra and security** eventually require **harder engineering** (replicas, queues, abuse controls).

---

## Fraud and collusion (policy stance)

- **Verification + monthly subscription** increases **marginal cost per coordinated identity**, making **many** ring/sybil strategies **economically irrational** at typical fee and bounty densities.
- **Residual risks** (not “impossible”): account takeover, very **high bounty density** changing ROI, **non-bounty** value of verified access (e.g. API abuse), determined adversaries. **Monitoring and policy** scale with **payout attractiveness**.

---

## Reference scenario (illustrative only)

Not a forecast or commitment:

- **10k** paying users × **$5**/mo ⇒ **`G ≈ $50k`/mo**. If **`E = $10k`**, then **`R = $40k`**, **creator fund ≈ 0.75 × R = $30k`/mo** before per-creator engagement and music splits.
- At **~100k DAU**, social-order-of-magnitude **posts/month** often sit in a **wide** band (e.g. **~6k–30k+**) depending on what fraction of users post; **engagement volume** affects **how thinly** a fixed fund spreads, not the **fund size** (driven by payers and price).

---

## Relationship to codebase

As of this document, the repo has **no** production-complete **creator fund ledger**, no automated **G → E → R → 25/75** accounting, and verification payment handling includes **demo-oriented** paths (e.g. dashboard `VerificationPaymentHandler` local storage). API Coinbase webhooks focus on **feed creation and feed subscriptions** (`api` webhook handler), not the full economics above.

Engineering should treat this file as the **policy target** and implement **ledger, metadata, and privacy** in dedicated modules when prioritized.

---

## Open decisions

1. **SKUs:** Single **“verification + monetization maintenance”** subscription vs separate **identity verification** and **creator eligibility** products—pricing, naming, Coinbase metadata, and API entitlements.
2. **Period boundaries:** Calendar month vs rolling window for **`G`**, **`E`**, and bounty accrual.
3. **Music library:** Authoritative **track registry**, artist opt-in, and **on-content proof** (“this post uses library track X”) for enforcing **75/25**.
4. **`E` transparency:** Line items **in** vs **out** of creator-facing OPEX reporting (e.g. internal dev tools).
5. **PSP treatment:** Whether **`G`** is recorded **gross** with PSP fees inside **`E`**, or **net** at collection—must be consistent in books and dashboards.

---

## Related documentation

- [IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md) (implementation phases; cost notes may evolve—**economics canonical here**)
- [third-party sharing and L5](../developer/third-party-sharing-and-L5.md)
- Identity verification (product): [IDENTITY_VERIFICATION.md](../../apps/id-dashboard/docs/IDENTITY_VERIFICATION.md)

# Creator fund and subscription economics

**Status:** Policy source of truth (principles and formulas). **Implementation** (ledger, webhooks, entitlements) is not yet wired in production; see [Relationship to codebase](#relationship-to-codebase).

**Audience:** Product, legal/compliance review, and engineering when building payouts and reporting.

---

## Strategic context (Web5 / infrastructure)

par Noir is intended as **infrastructure** (identity → dashboard → API → browser → **third parties**), not only a social product.

- **Verification + subscription** support **L5 tools and platforms** built on the API (access, trust, compliance), not only **creator payouts** and social reputation.
- Stronger **non-social** reasons to verify **increase** paying verified headcount and **grow the creator fund numerator** without relying on feed vanity alone.

---

## Scope: creator fund vs other paid surfaces

**Policy:** The **creator fund** waterfall in this document (**`G` → `E` → `R` → 75% fund**) applies **only** to **in-scope platform revenue** tied to **monetization maintenance** (and any future SKUs **explicitly listed** in this doc). par Noir **does not commingle** that pool with **individual creators’ own paid products** or with **paid feed** economics.

| Surface | Relationship to this creator fund |
|---------|-------------------------------------|
| **Monetization maintenance** (platform subscription for eligibility + fund) | **In `G`** for this waterfall (subject to accounting definitions). Drives **75%** pool and engagement bounty. |
| **Paid feed subscriptions** (existing feed product: subscribers pay for a **feed** on par Noir) | **Separate** commercial line—**not** counted in this doc’s **`G`** for the engagement bounty pool. Own checkout, webhook, and economics; **do not merge** into creator fund ledger lines. |
| **Creator private subscriptions, paywalls, “VIP” tiers, coaching, etc.** | **Out of par Noir billing for v1.** Creators who want that use **paid feeds** (or public index) **plus** their **own third-party** tool for access control, subscriber lists, and fees—or a **future optional add-on / L5 partner**. Revenue from those tools **does not** enter the creator fund **`G`**. |
| **Future par Noir add-on** for creator billing | Possible **later** product; until adopted, treat as **third-party** for scope purposes. Must **not** silently mix ledgers with the fund when built. |

**Rationale:** Keeps **chargeback, tax, and payout** characterization for the **platform pool** separate from **creator-operated commerce**, reduces product and legal ambiguity, and matches the goal that **users manage their own** premium access stacks unless par Noir ships a dedicated, **non-commingled** product.

---

## Locked product rules (confirmed)

| Rule | Definition |
|------|------------|
| **Who may earn from the fund** | **Identity verification** SKU **current** **and** **monetization maintenance** SKU **active** (see [SKUs](#skus-and-identity-locked)). If either lapses, **no new accrual** until restored. |
| **Engagement** | **All** engagement counts for product/analytics. **Bounty** (fund allocation) weight: **90%** from engagement **by verified** accounts, **10%** from engagement **by unverified** accounts. |
| **Cash waterfall** | Collect **`G`** (definition under **Symbols**) → pay **`E`** (platform OPEX—see [OPEX](#opex-categories-policy-draft)) → **`R = max(0, G - E)`** → **25%** of **`R`** to platform / **75%** of **`R`** to the **creator fund**. On each piece of content, **library music** applies **75% creator / 25% music pool** to the **creator’s** share of that reward (see Music). |
| **Creator payouts** | **45-day** hold after the **relevant rolling accrual period is finalized**; **payee-initiated** Stripe Connect payouts on **1st and 15th** (US **Eastern**); **$10 USD** minimum; balances **carry forward** (details under [Payouts](#payouts-and-tax-compliance-stripe-connect)). **Escheatment** is **law-driven** only—see [Dormancy and escheatment](#dormancy-and-escheatment). |
| **Payments rail (creator fund)** | **Stripe only** for **monetization maintenance** (money **in** via card/bank payers) and for **all** creator-fund **payouts** (money **out** via **Stripe Connect**). **Paid feed** products may continue to use **other** collectors (e.g. Coinbase) until migrated—they stay **out of this `G`** per [Scope](#scope-creator-fund-vs-other-paid-surfaces). |
| **Maintenance renewal (balance-first)** | At each renewal, **apply eligible creator-fund balance first** (ledger debit), then charge **Stripe** only for the **shortfall**. If eligible balance **covers the full renewal price**, **the entire renewal settles from balance**—**no** card charge that period (**no** “always charge card” override). See [Balance-first renewal](#balance-first-maintenance-renewal-default). |

Symbols:

- **`G`**: **Monetization maintenance** receipts for this waterfall **only**, **after** **Stripe processing fees** on **card/ACH** maintenance charges (**net** of those PSP fees—do **not** book the same fees again inside **`E`**). **Balance-first** legs (eligible ledger debit) count toward the **same `G`** at **cash-equivalent fair value** (same line as card proceeds for the period). **Not in `G` here:** paid **feed** subscription revenue (separate product/ledger), creator-run **private subscriptions / paywalls** (third-party or future add-on), or other creator commerce—see [Scope](#scope-creator-fund-vs-other-paid-surfaces).
- **`E`**: Monthly operating expenses charged **before** the 25/75 split (see [OPEX categories](#opex-categories-policy-draft)).
- **`R`**: Remainder after OPEX: `max(0, G - E)`.

### SKUs and identity (locked)

| SKU | What it is |
|-----|----------------|
| **Identity verification** | **Third-party** identity checks (current vendor paths in product). **Re-verification** is required whenever **credential or policy TTL expires** or **documented identity inputs materially change**—per vendor rules and dashboard UX. Gates **trust** and **payout readiness**; **not** interchangeable with maintenance. |
| **Monetization maintenance** | **Monthly** subscription (and **balance-first** settlement per this doc) that keeps **creator-fund participation** active for the **billing identity**. Billed via **Stripe** for any **cash shortfall** after balance application. |

---

## Ideology

- **Fair:** Same rules for everyone who qualifies; music rights honored when library audio is used.
- **Separation:** The **creator fund** pool is **not commingled** with **paid feed** revenue or with **creators’ own** subscription/paywall products (see [Scope](#scope-creator-fund-vs-other-paid-surfaces)).
- **Practically un-gameable:** **Paid verification + recurring subscription** is the **primary** defense: each coordinated identity pays monthly and passes identity checks, making **typical** collusion rings and casual sybil farms **economically costly** relative to expected bounty. **Operational backstops** (rate limits, anomaly detection, caps, audit trails) still apply as **fund size and reward density** grow.
- **Self-sustaining:** **`G`** (as defined—maintenance proceeds **net** of Stripe **processing** on **card** legs, plus **cash-equivalent** balance-first legs) **covers variable OPEX (`E`) next**; the platform **25% applies to `R`**, not while hiding infra in “profit.” The **creator fund** scales with **paying verified subscribers × price**, modulo **`E`** and creator competition for the pool.
- **Honest limits:** The model does **not** scale infinitely; see [Scaling and limits](#scaling-and-limits).
- **Crypto without blockchain:** Fund accounting and auditability use **traditional cryptography and append-only records** (see [Ledger transparency (no blockchain)](#ledger-transparency-no-blockchain)), not a public chain for consensus or payouts.

---

## Eligibility (who earns from the creator fund)

1. **Identity verification** SKU satisfied: **third-party** verification **current** (re-run when **TTL expires** or **ID material changes**—see [SKUs](#skus-and-identity-locked)). This is **not** pn name, passcode, or raw PII in logs.
2. **Monetization maintenance** SKU **active** (monthly entitlement, including **balance-first** renewals). **Lapse** of maintenance → **no new accrual** until restored. **Verification** and **maintenance** are **separate** products.

---

## Engagement and bounty weighting

- **All engagement counts** for tallies (UX, analytics, health metrics).
- **Bounty allocation** for a period: **90%** of the weighted bounty pool attributed to actions by **verified** accounts; **10%** attributed to actions by **unverified** accounts (same events, different **weight buckets** for fund math).

**Implementation (future):** Define “attributable to verified” precisely (e.g. actor DID verified **and** subscribed at **event time**). Document edge cases: lapse mid-period, deleted accounts, automation, appeals.

---

## Engagement integrity and bounty inputs

**Terminology:** “Unfakeable” is **not** a goal in the strict cryptographic sense for social engagement. **Colluding humans** with valid accounts can still produce **real** API calls; cryptography cannot prove **intent** or **absence of payment for engagement.**

**What we optimize for**

1. **Authoritative events:** Engagement used for **bounty** math should be **witnessed by the platform** from **authenticated** clients (tokens, identity binding), not taken as unverified client-only tallies.
2. **Economic cost to scale abuse:** Paid verification + subscription (see [Fraud and collusion](#fraud-and-collusion-policy-stance)) plus rate limits and bot scoring for unverified actors.
3. **Tamper-evidence of the record:** Once recorded, **period rules and allocations** should be **hard to rewrite silently** (see [Ledger transparency (no blockchain)](#ledger-transparency-no-blockchain)).

**What does *not* alone guarantee honesty**

- **Binary flags** or **dual copies** (e.g. engager + creator each storing a bit) without **cross-verified signatures** and a **single reconciliation rule** do not prevent coordinated fraud or account takeover.
- **High view counts** remain **easier to inflate** than scarce actions (likes/comments) unless views are defined and defended carefully for fund use.

**Policy line for external comms:** Engagement is **defensible for payouts** through **identity economics + server witnessing + monitoring + tamper-evident fund ledgers**—not through “impossible to fake” claims.

---

## Music

**v1:** Ship **with** an authoritative **track registry** (phases **A–D** in [Track registry and licensing portal (build plan)](#track-registry-and-licensing-portal-build-plan)); economics and **75/25** enforcement **depend** on it.

### What is the track registry

The **track registry** is the **single system of record** for **licensed library music**: every row is **one** licensable **track** (or stem) the platform is allowed to use. It stores at least:

- A **stable platform id** for that track (so posts and payouts reference the same thing forever).
- **Who** gets paid from the **music pool** (links to **feed pN** / rights-holder identities) and **how** the **25%** is split when multiple parties share a track.
- **Legal / commercial status** (active, takedown, contract end date—whatever product and counsel require).
- **Proof hooks** for the app: when a post **uses** library audio, the post must reference **this** id so the ledger can apply **75/25** to the right creators and rights holders.

Without it, “this post used licensed track X” is **not** enforceable at scale—the **library UI**, **licensing portal sync**, and **payout math** all read from here (or a projection of it).

| Content | Creator share of that content’s creator-side reward |
|---------|------------------------------------------------------|
| **No** licensed library music | **100%** to creator |
| **Uses** music from the **licensed library** | **75%** creator / **25%** to music rights pool (per-track split from **registry**; **on-content proof** that post **N** uses track **T** is required for enforcement) |

### Identity hierarchy (individual vs business feed)

- **Individual pN:** The **person** identity; used for **personal** creator activity and bounty accrual tied to that human.
- **Feed pN (business):** A **business** identity (label, publisher, catalog owner, etc.). **Music rights** and **catalog** are registered under this **feed pN**. **Tracks** may also appear on that feed’s **paid feed** product for **marketing/discovery** (**visibility** is **opt-in** / configurable); the **library** is the **canonical catalog** for **attaching** licensed audio to posts and for **75/25** math.

### Music rights holders (licensing portal)

**Policy:** Anyone receiving **creator fund** disbursements (**creator bounty** or **music pool**) must be **identity-verified** (third-party, with **re-verification** on expiry or material ID change) and complete **Stripe Connect** (**US-only** v1—see [Payouts](#payouts-and-tax-compliance-stripe-connect)). **Monetization maintenance** is billed to the **same identity that accrues** the line item (**individual** or **feed pN** business). **Enrollment** is **contract + licensing portal** (authenticated catalog sync on the roadmap).

**Product surface:** The **licensing portal** ([`apps/licensing-portal`](../../apps/licensing-portal)) is **today** a **rights-holder intake form** (mailto inquiry). **Next:** build out **pN sign-in** and **track library** management per [Track registry and licensing portal (build plan)](#track-registry-and-licensing-portal-build-plan)—**no** second payout vendor; **Stripe Connect** only.

### Track registry and licensing portal (build plan)

**Goal:** Rights holders **connect their par Noir identity** (same **OAuth** pattern as other first-party web apps), then **add, edit, and retire** rows in **their** licensed **track library** so the platform has an authoritative **registry** for **75/25** and music-pool payouts (see [What is the track registry](#what-is-the-track-registry)). **Intake mailto** can remain for **cold** partner inquiries; **catalog** is for **authenticated** identities only.

**Principles:** **API-only** persistence (licensing portal does **not** talk to Google for catalog); **Bearer**-authenticated routes; **owner** of each track row is the **token’s `pn_identifier`** (**individual** or **feed pN** when that identity completes OAuth). **No** sensitive PII in logs.

| Phase | Deliverable |
|-------|-------------|
| **A — Identity + API contract** | Register **`licensing-portal`** OAuth **client** (redirect URIs for `licensing.parnoir.com` / Firebase hosting + local dev). **REST** namespace e.g. `/api/v1/music/registry/tracks` (**list/create/update**, soft-delete via **status**). **PostgreSQL** table(s) for **registry rows** (stable id, `owner_pn_identifier`, title, display artist, optional ISRC, status, splits metadata JSON, timestamps). Wire **migration** + **pool** startup like other API modules. |
| **B — Licensing portal UI** | [`apps/licensing-portal`](../../apps/licensing-portal): **`@par-noir/oauth-ui`** **Unlock** flow, **`VITE_API_ENDPOINT`** + **`VITE_OAUTH_CLIENT_ID`** (prod build must set endpoint per [how-to-build](../../.cursor/rules/how-to-build.mdc)). **Track library** screen: list tracks, **add** row, **edit**, set **active/draft/retired**. Optional: link to **open** intake form in footer. |
| **C — Library / feed presentation** | **Paid feed** or catalog UI may **surface** tracks for discovery (**opt-in** visibility per policy); **canonical attach** path for posts still **references registry track id** (product choice: **aggregator-browser** composer vs dashboard—**browser-only** presentation stays in browser). |
| **D — Payouts + enforcement** | Ledger / fund allocator **reads** registry for **music pool** splits; **on-content proof** (post → track id) required before **75/25** applies (**ties** to monetization / fund periods work). |

**Dependencies:** Phase **A/B** can ship **before** full creator-fund Stripe work; Phase **D** needs **fund ledger** milestones from the **dashboard monetization** program. **Order:** **A → B** in parallel with early monetization schema is fine; **C/D** after registry data exists.

**Engineering checklist (non-code here):** unit tests for authz (cannot mutate another owner’s rows); idempotent creates if needed; rate limits on write routes.

---

## Revenue waterfall

1. Collect **`G`** (in-scope **monetization maintenance** per **Symbols**—**net** of Stripe **processing** fees on card legs; **balance-first** legs at **cash-equivalent** value).
2. Pay **`E`** (monthly OPEX; transparent categories).
3. Compute **`R = max(0, G - E)`**.
4. **Platform:** `0.25 × R`. **Creator fund:** `0.75 × R`, then distributed using engagement + music rules.

**Rationale:** Variable costs scale with usage. Applying **`E` to `G` first** avoids implicitly **eating scaling infra out of the platform’s 25%**; both platform and fund share only what remains after **documented** operations spend.

---

## OPEX categories (policy draft)

Include in **`E`** (creator-facing / “**keep the platform online**” spend):

- API hosting, database, egress (e.g. Railway-class compute).
- Static hosting / CDN (e.g. Firebase Hosting).
- Identity verification vendor (e.g. Veriff)—**per-check** and/or minimum commit.
- **Outgoing** **Stripe Connect** payout fees (per [Payouts](#payouts-and-tax-compliance-stripe-connect)), if billed separately from maintenance card charges.
- Trust, safety, and support directly tied to operating the network.
- Compliance and security tooling required to run production.

**Locked:** **Stripe processing fees** on **monetization maintenance** **card** charges are **deducted before `G`** is recorded (see **Symbols**); they are **not** also line-itemed in **`E`** (avoids **double-count**).

**Reporting:** **Exclude** or **separately tag** purely **internal** dev tooling (e.g. IDE subscriptions) from **creator-facing** **`E`** buckets so “OPEX” means **costs to run the live product**, not internal R&D overhead—**tag in dashboards**, not an open policy question.

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

## Ledger transparency (no blockchain)

par Noir’s guiding architecture is **crypto without blockchain**: decentralized **identity** and user-owned data, **without** using a public distributed ledger for creator fund consensus or payouts.

**Goals**

- **Detect retroactive tampering** with official numbers (`G`, `E`, `R`, allocations, payout batches).
- **Give creators verifiable artifacts** (e.g. signed statements) without every user hosting a **global** ledger in Drive.

**Recommended implementation pattern (engineering target—not yet built)**

1. **Append-only platform ledger** (e.g. PostgreSQL): insert-only **facts** (`revenue_event`, `expense_line`, `period_closed`, `allocation_line`, `payout_queued`, `payout_settled`). **Corrections** are **new rows** (reversal references), not silent `UPDATE`s of amounts.
2. **Tamper-evident chaining per stream:** each row includes **`hash(prev_row)`** or roll up to a **Merkle root** per fund period so backups or manual edits break verification.
3. **Signed period commitments:** once a period is finalized, publish a **small signed document** (platform key in **[cloud KMS](#kms-plain-language)**): period id, `G`, `E`, `R`, split amounts, Merkle root of allocation leaves. Signatures are verifiable **off-chain** without a blockchain.
4. **Optional:** **RFC 3161** (or similar) **timestamping** of the signed commitment if independent **time attestation** is required—still not a user-operated chain.
5. **User-owned copies (optional):** push **per-creator signed receipts** (or encrypted statements) to **that creator’s** storage (e.g. Drive metadata folder) for **portability and dispute evidence**—**not** a requirement that every user replicate a **network-wide** ledger.

### KMS (plain language)

**Policy:** Period-signing keys live in a **cloud-based KMS**—a **managed** key service from your **cloud provider** (e.g. **AWS KMS**, **GCP Cloud KMS**, Azure Key Vault)—**not** in application env vars, **not** in git, and **not** on a self-run “key server under someone’s desk.” **HSM-backed** keys, when used, are still **cloud** offerings (e.g. managed HSM tiers) where the provider runs the hardware; that satisfies the same intent.

**Why it matters:** the **signed period statement** creators can verify is only trustworthy if the signing key is **created, stored, and rotated** in that vault. **Still to pick in implementation:** which **provider/region** and **rotation** cadence ([Open decisions](#open-decisions-remaining)); v1 may **defer** publishing signed blobs until after the core ledger ships.

**Explicit non-goals (unless product changes later)**

- **Public global consensus** over payout state.
- **Smart contracts** as the source of truth for subscription revenue allocation.

**Trust boundary:** This model gives **“the operator cannot silently rewrite history without detection”** to anyone who verifies signatures and the hash chain. It does **not** remove the need to **trust the platform** for **which events were admitted** before sealing a period—that is addressed by **operations**, **identity economics**, and **abuse detection**, not by a chain.

**Interaction with payouts:** The internal ledger records **accrual**, **allocation**, and **payout batch instructions** (amounts, payee references, batch ids). **Movement of money to creators’ bank accounts** (and **stablecoin** payouts **only where Stripe Connect supports** the platform and payee profile) plus **tax information collection** are performed by **Stripe**—not by re-implementing global withholding and IRS form logic in par Noir.

---

## Inbound payments (Stripe) for monetization maintenance

**Policy:** **Cash** portions of **monetization maintenance** (the amount **after** [balance-first](#balance-first-maintenance-renewal-default) ledger settlement) are collected by **Stripe** (e.g. **Stripe Billing** and/or **Checkout**—exact product to match engineering and finance). **Webhook-verified** payment success is the **source of truth** for those **card/ACH** legs in **`creator_fund_revenue_events`** (and reconciliation with entitlements). **Balance** legs are **ledger-only** per the same section.

- **Secrets:** Use **Stripe webhook signing** (`STRIPE_WEBHOOK_SECRET` or platform equivalent); never trust unsigned callbacks.
- **Identity binding:** Each subscription or customer object must map to a stable **par Noir identity** id in metadata for reconciliation.
- **Separation:** Do **not** route **paid feed** or **other** Coinbase (or non-Stripe) charges into this **`G`** stream—those products keep their own integration until a deliberate migration.

### Balance-first maintenance renewal (default)

**Policy:** Each renewal **debits eligible creator-fund balance first** up to the **renewal price**, then bills **Stripe** only for the **shortfall**. If eligible balance **≥ full renewal price**, **the whole renewal is balance-only**—**no** card charge that period (**no** “always charge card” product path). **Rationale:** Fewer **PSP** transactions and **lower fees**, while **Stripe** remains the **only** external money-in rail for shortfalls.

**Eligibility (product defaults—tune with risk):**

- Same **identity verification** rules; renewal **extends** entitlement whether the leg is balance, Stripe, or **split**.
- Debit only from balance that is **eligible under the same (or stricter) rules as payee-initiated payouts**—e.g. **after** the **45-day** hold and **not** in dispute—so maintenance is not funded with amounts still at high **clawback** risk. (Stricter alternative: only amounts that would meet the **$10** payout threshold logic—document whichever you ship.)
- **Split renewal (default):** If eligible balance is **positive** but **less** than the renewal price, apply **all** eligible balance and **Stripe** for the **shortfall** in one renewal transaction (not “balance-only or card-only” in v1 unless you explicitly remove splits).

**Ledger (engineering target):**

- **Append-only:** `subscription_balance_debit` (or equivalent) row(s): identity id, amount, period covered, reference to pricing, **no** raw payment details; plus Stripe charge / invoice rows for any **shortfall**.
- **Entitlement:** Server-side **active maintenance** updated **only** after the **combined** settlement commits; **idempotent** renewals.
- **Relationship to Connect:** Balance legs are **internal** settlement. **Stripe** Billing / invoices should reflect **shortfall** amounts cleanly for reconciliation—**finance + engineering** pick one source of truth (e.g. invoice with **two** line items vs customer balance credit patterns).

**Accounting (`G`)—locked:** Balance-funded renewals **count toward the same `G`** as cash at **equivalent value** (see **Symbols**). **Disclaimer:** **Counsel/CPA** still confirm **1099 / reporting** treatment in your entity setup before launch.

---

## Payouts and tax compliance (Stripe Connect)

**Policy:** **Stripe Connect** is the **sole** payout rail for creator fund disbursements: **fiat** payouts to bank accounts as the default path, and **stablecoin (e.g. USDC)** payouts **only** where **Stripe’s Connect payout product** supports the **platform entity**, **payee type**, and **geography** for your account (availability evolves—confirm in Stripe Dashboard / account manager before marketing “crypto payouts”). No parallel **non-Stripe** crypto rail is required for v1 if Stripe coverage is sufficient; if not, extend policy before launch.

**Rationale**

- A **US-based** company paying **US and international** creators faces **material tax and withholding complexity** (including **Chapter 3** rules for payees outside the US). **Stripe Connect** (and Stripe’s tax/reporting products where used) is the **designated** way to handle rails and payee compliance instead of building withholding in-house—still subject to **legal and finance oversight**.
- **Identity verification** (e.g. Veriff) for **trust** is **complementary** but **not a substitute** for **taxpayer identification and certification** flows **Stripe** provides for **IRS and cross-border** compliance where applicable.

**Division of responsibility (target)**

| Area | par Noir (product + API + ledger) | Stripe (Connect + Tax as applicable) |
|------|-----------------------------------|----------------------------------------|
| Who earned what | Accrual, **rolling** period close (**America/New_York**), **90/10** bounty math, music splits, eligibility rules | Executes **Transfer / Payout** when the **payee initiates** a payout (after hold, minimum, and **US-only** Connect rules at launch) |
| User trust / identity gate | Verification + subscription policy aligned with this doc | Connected account onboarding, **bank / wallet**, **tax** collection per Stripe capabilities |
| Tax forms & withholding | **Does not** reimplement IRS logic; use **Stripe-hosted** or **Stripe Tax / reporting** products where applicable | **W‑9 / W‑8** flows, withholding, **1099 / 1042‑S** per Stripe support for your setup |
| Ledger of record | Append-only **accrual and payout status** (`payout_queued`, `payout_settled`, Stripe transfer/payout ids) | Stripe’s settlement records as source for **rails** |

### Accrual calendar (confirmed)

- **Rolling periods:** **`G`**, **`E`**, and bounty **accrual** use **rolling** **30-day** fund periods; boundaries and **finalization** timestamps are computed in **`America/New_York` (US Eastern)**.
- **Payout rail geography (launch):** **United States only** for **Connect** payees and bank payouts at v1; expand countries only after policy + Stripe capabilities are updated.

### Payout timing and thresholds (confirmed)

- **45-day hold:** Creator (or music-pool) share from a given **closed rolling accrual period** becomes **eligible for disbursement** only after **45 calendar days** have passed since **that period’s balances were finalized** in **Eastern Time** (time to absorb **chargebacks**, **subscription reversals**, **fraud or data corrections**, and to stabilize the pool before cash leaves the platform). Until then, amounts remain **pending payout** in the internal ledger.
- **Payee-initiated payouts:** The **platform does not** silently sweep all balances. Each **payee** (**creator** or **rights holder** on the music pool) **initiates** their **Stripe Connect** payout from **dashboard or licensing portal** when **eligible**. **Product cadence:** surface **1st** and **15th** of each month (**Eastern**) as the standard **payout days** when users should initiate (UX and ops may still allow initiation **outside** those dates if Stripe and risk policy allow—engineering documents the chosen rule).
- **Minimum payout:** **$10 USD** per **transfer** at US launch; if **eligible** balance is below the minimum, **no transfer** and the balance **accumulates**.
- **Carryover:** Sub-minimum and not-yet-held amounts **carry forward** across rolling periods until paid or adjusted by **clawback / reversal** ledger entries.

### Dormancy and escheatment

**What you already “resolved” in product:** There is **no** par Noir–defined **timer** (e.g. the old **24-month** rule) that **forces** payouts or **declares** balances forfeited. **Balance-first renewal** is **regular use** of the ledger.

**What that does *not* remove:** **Escheatment** is **state unclaimed-property law**: if money is **owed** to someone and **abandoned** under that state’s rules, the company may have to **report/remit**. Product cannot “resolve” that away—**counsel** says **if/when** it applies; engineering **exports data** and sends **notices** counsel approves.

**Policy:** **No** product dormancy clock tied only to “never clicked payout.” **Escheatment** playbook is **law-driven** when triggered.

**Engineering (target):** Model states such as **pending_hold**, **eligible**, **queued**, **settled**, and **reversed**; each accrual line should carry **`period_id`** and **`available_after`** (or derive from period close + 45 days); store payee **timezone policy** as **`America/New_York`** for period math at launch.

**Legal / finance (TBD with counsel):** Escheatment filing obligations, notice content, and alignment with **Stripe’s** **minimum transfer** rules (may be stricter than $10).

**Operational rules (product)**

- **Clawback / chargeback:** Subscription and payment partners may still reverse income **after** accrual; ledger must support **reversal rows** that reduce pending or eligible balances. The **45-day hold** is a **risk buffer**, not a guarantee that all disputes have ended.
- **Creators** complete payout onboarding **before** first disbursement; **no raw tax IDs or full bank details** in par Noir logs (follow existing **no sensitive data in plain text** rules).

**Disclaimer:** This section is **policy intent**, not tax or legal advice. **Stripe account structure** (e.g. Connect configuration), **merchant-of-record** treatment, and **classification** of payments (e.g. nonemployee compensation vs other categories) require **qualified counsel and CPA** review.

---

## Production readiness checklist (before launch)

Use this as a **go-live gate** alongside engineering QA—not legal advice.

| Area | Must be true |
|------|----------------|
| **Stripe** | Production **API keys**; **Connect** application approved; **webhook endpoints** deployed with **signature verification**; test **subscription lifecycle** (success, failure, cancel, chargeback simulation). |
| **Inbound `G`** | Only **monetization maintenance** Stripe events (including **shortfall** charges) append per reconciliation rules; **no** feed or other SKU leakage. **Balance-first** legs append **only** per [Balance-first renewal](#balance-first-maintenance-renewal-default)—no fake Stripe webhooks. |
| **Payouts** | **Connect** onboarding live (**US-only** v1); **payee-initiated** flows tested; **1st/15th Eastern** UX/cadence; **45-day** hold matches ledger; **$10** minimum; **reversal** rows tested. |
| **Stablecoin** | If offered: **Stripe** program **explicitly** enabled for your **platform country** and **payee** types; otherwise **disable** crypto payout UI until enabled. |
| **Identity / subscription** | **Server-side** entitlement for “verified + subscribed”; **remove demo-only** client paths for any payment that gates eligibility. |
| **Accounting** | **`G`** **net** of maintenance Stripe fees; **`E`** excludes those same fees; **balance-first** counts toward **`G`** per **Symbols**; CPA confirms **1099** posture. |
| **Periods** | **30-day** rolling accrual, **`America/New_York`** for boundaries and finalization. |
| **Music** | **Track registry** + **licensing portal** phases **A–B** minimum for v1 catalog writes; **on-content** track proof (**C/D**) per [build plan](#track-registry-and-licensing-portal-build-plan). |
| **Legal** | Counsel sign-off on **Connect** agreement, **payout classification**, **US-only** launch posture, **escheatment** when law applies ([Dormancy and escheatment](#dormancy-and-escheatment)). |
| **Observability** | Alerts on webhook failures, payout failures, ledger imbalance; **no** sensitive PII in logs. |

---

## Reference scenario (illustrative only)

Not a forecast or commitment:

- **10k** paying users × **$5**/mo ⇒ **`G ≈ $50k`/mo**. If **`E = $10k`**, then **`R = $40k`**, **creator fund ≈ 0.75 × R = $30k`/mo** before per-creator engagement and music splits.
- At **~100k DAU**, social-order-of-magnitude **posts/month** often sit in a **wide** band (e.g. **~6k–30k+**) depending on what fraction of users post; **engagement volume** affects **how thinly** a fixed fund spreads, not the **fund size** (driven by payers and price).

---

## Relationship to codebase

As of this document, the repo has **no** production-complete **creator fund ledger**, no automated **G → E → R → 25/75** accounting, and **no** **Stripe** integration for **monetization maintenance**—**Stripe** is **deferred** until operators configure accounts, **Price/Product** ids, and webhooks in deployment environments. Verification payment handling includes **demo-oriented** paths (e.g. dashboard `VerificationPaymentHandler` local storage). API **Coinbase** webhooks today cover **feed creation and feed subscriptions**—those remain **separate** from creator-fund **`G`** until feeds migrate to Stripe (optional future). The **licensing portal** app is an **intake form** only ([`apps/licensing-portal`](../../apps/licensing-portal)); **catalog sync** and **authenticated** rights-holder flows are **not** built yet.

Engineering should treat this file as the **policy target**: **Stripe** for **inbound** maintenance **shortfall/full** cash and **Stripe Connect** as the **only** creator-fund **payout** rail; ledger per [Ledger transparency (no blockchain)](#ledger-transparency-no-blockchain); go-live per [Production readiness checklist](#production-readiness-checklist-before-launch).

---

## What you still provide (non-code)

### Stripe (when you are ready)

Production or test **account**, **API keys**, **Connect** application, **webhook** endpoint + signing secret, **Price** and **Product** ids for **monetization maintenance** (and metadata binding to **par Noir identity**), and **US-only** Connect settings for v1. **Identity verification** is billed **through the third-party verifier** unless product later moves it onto Stripe—**do not** conflate verifier SKUs with Stripe Product ids.

### Counsel and CPA (what they need from you)

Enough to classify flows: **entity type**, **who** sells maintenance (**MoR** question), sample **ledger export** (showing **`G`**, balance-first debits, payouts), **payout** types (individual vs **feed pN**), and **states** where you have payees or users. They return: **1099 / reporting** treatment for balance vs card maintenance, **Connect** agreement choice, and **escheatment** steps **if** law applies—not something you “fill in” in this markdown; you **run the conversation** with the artifacts engineering will produce.

---

## Open decisions (remaining)

1. **Stripe Connect mode:** **Express vs Standard vs Custom** for **payee-initiated** payouts—choose when Stripe is configured (**US-only** v1).
2. **Cloud KMS details:** **Hyperscaler** and **region** (e.g. AWS KMS vs GCP Cloud KMS; same region as prod data where practical), plus **rotation** cadence for the period-signing key—or **defer** published signed period artifacts until after the v1 ledger.
3. **Track registry execution:** Implement phases **A–D** in [Track registry and licensing portal (build plan)](#track-registry-and-licensing-portal-build-plan); Cursor **dashboard monetization** plan links the same program for scheduling.

---

## Related documentation

- [IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md) (implementation phases; cost notes may evolve—**economics canonical here**)
- [SHARED_CODE_RULES.md](../../SHARED_CODE_RULES.md) (guiding principles, including crypto without blockchain)
- [third-party sharing and L5](../developer/third-party-sharing-and-L5.md)
- Identity verification (product): [IDENTITY_VERIFICATION.md](../../apps/id-dashboard/docs/IDENTITY_VERIFICATION.md)

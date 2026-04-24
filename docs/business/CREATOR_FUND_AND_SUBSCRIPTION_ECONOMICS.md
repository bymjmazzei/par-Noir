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
| **Who may earn from the fund** | Identity **verified** **and** paying the **monthly subscription** that **maintains** monetization eligibility. If either lapses, **no new accrual** from the fund until restored. |
| **Engagement** | **All** engagement counts for product/analytics. **Bounty** (fund allocation) weight: **90%** from engagement **by verified** accounts, **10%** from engagement **by unverified** accounts. |
| **Cash waterfall** | **Gross** `G` → pay **`E`** (monthly OPEX) → **`R = max(0, G - E)`** → **25%** of **`R`** to platform / **75%** of **`R`** to the **creator fund**. On each piece of content, **library music** applies **75% creator / 25% music pool** to the **creator’s** share of that reward (see Music). |
| **Creator payouts** | **45-day** hold after the **relevant rolling accrual period is finalized**; **payee-initiated** Stripe Connect payouts on **1st and 15th** (US **Eastern**); **$10 USD** minimum; balances **carry forward**; **24-month dormancy** trigger for counsel-led review (details under [Payouts](#payouts-and-tax-compliance-stripe-connect)). |
| **Payments rail (creator fund)** | **Stripe only** for **monetization maintenance** (money **in** via card/bank payers) and for **all** creator-fund **payouts** (money **out** via **Stripe Connect**). **Paid feed** products may continue to use **other** collectors (e.g. Coinbase) until migrated—they stay **out of this `G`** per [Scope](#scope-creator-fund-vs-other-paid-surfaces). |
| **Pay maintenance from balance (optional)** | Verified subscribers may **optionally** renew **monetization maintenance** by **debiting** accrued **creator-fund balance** on the **platform ledger** instead of a **Stripe** card charge for that period—see [Inbound payments](#inbound-payments-stripe-for-monetization-maintenance). **No** non-Stripe PSP for this path; it is **not** a second money-in rail, only **internal settlement** of amounts already in the fund’s liability to the payee. |

Symbols:

- **`G`**: Gross receipts **for this creator fund waterfall only**—**monetization maintenance** for each period, whether collected as **cash through Stripe** (Checkout, Billing, or equivalent) or **settled from payee balance** per [Pay from balance](#paying-maintenance-from-creator-balance-optional-product)—**how** the latter maps into **`G`** for the **`G` → `E` → `R`** waterfall is an **accounting open decision** (see [Open decisions](#open-decisions)). **Not in `G` here:** paid **feed** subscription revenue (separate product/ledger), creator-run **private subscriptions / paywalls** (third-party or future add-on), or other creator commerce—see [Scope](#scope-creator-fund-vs-other-paid-surfaces). Define whether **card-paid** amounts are **gross** with Stripe fees in **`E`** or **net** at collection (open decision).
- **`E`**: Monthly operating expenses charged **before** the 25/75 split (see [OPEX categories](#opex-categories-policy-draft)).
- **`R`**: Remainder after OPEX: `max(0, G - E)`.

---

## Ideology

- **Fair:** Same rules for everyone who qualifies; music rights honored when library audio is used.
- **Separation:** The **creator fund** pool is **not commingled** with **paid feed** revenue or with **creators’ own** subscription/paywall products (see [Scope](#scope-creator-fund-vs-other-paid-surfaces)).
- **Practically un-gameable:** **Paid verification + recurring subscription** is the **primary** defense: each coordinated identity pays monthly and passes identity checks, making **typical** collusion rings and casual sybil farms **economically costly** relative to expected bounty. **Operational backstops** (rate limits, anomaly detection, caps, audit trails) still apply as **fund size and reward density** grow.
- **Self-sustaining:** **Gross covers variable OPEX first**; the platform **25% applies to `R`**, not to gross while hiding infra in “profit.” The **creator fund** scales with **paying verified subscribers × price**, modulo **`E`** and creator competition for the pool.
- **Honest limits:** The model does **not** scale infinitely; see [Scaling and limits](#scaling-and-limits).
- **Crypto without blockchain:** Fund accounting and auditability use **traditional cryptography and append-only records** (see [Ledger transparency (no blockchain)](#ledger-transparency-no-blockchain)), not a public chain for consensus or payouts.

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

| Content | Creator share of that content’s creator-side reward |
|---------|------------------------------------------------------|
| **No** licensed library music | **100%** to creator |
| **Uses** music from the **licensed library** | **75%** creator / **25%** to music rights pool (per-track split among artists—**registry and proof TBD**; see [Open decisions](#open-decisions)) |

### Music rights holders (licensing portal)

**Policy:** Parties who earn from the **music pool** (library **25%**) use the **same payout rail** as creators: **verified par Noir identity**, **Stripe Connect** onboarding and tax flows (**US-only** at launch—see [Payouts](#payouts-and-tax-compliance-stripe-connect)). **Enrollment** is through **contract + licensing portal** (catalog sync on the roadmap); **whether** a rights holder must also hold **monetization maintenance** subscription when they are **not** earning creator bounty is a **SKU decision**—if exempt, document it explicitly so engineering does not infer a second payout vendor.

**Product surface:** The **licensing portal** ([`apps/licensing-portal`](../../apps/licensing-portal)) is **today** a **rights-holder intake form** (mailto inquiry). **Roadmap:** authenticated portal flows to **register catalog**, **sync** track metadata and usage, and **align splits** with the ledger—**no** separate “shadow” payout vendor; **Stripe Connect** remains the **sole** outbound rail for these payees.

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
- **Incoming** **Stripe** processing fees (% + fixed per txn) for **monetization maintenance** subscription charges (count toward **`E`** or net-`G` per accounting open decision).
- **Outgoing** **Stripe Connect** payout fees (per [Payouts](#payouts-and-tax-compliance-stripe-connect)), if billed separately from card-present charges.
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

## Ledger transparency (no blockchain)

par Noir’s guiding architecture is **crypto without blockchain**: decentralized **identity** and user-owned data, **without** using a public distributed ledger for creator fund consensus or payouts.

**Goals**

- **Detect retroactive tampering** with official numbers (`G`, `E`, `R`, allocations, payout batches).
- **Give creators verifiable artifacts** (e.g. signed statements) without every user hosting a **global** ledger in Drive.

**Recommended implementation pattern (engineering target—not yet built)**

1. **Append-only platform ledger** (e.g. PostgreSQL): insert-only **facts** (`revenue_event`, `expense_line`, `period_closed`, `allocation_line`, `payout_queued`, `payout_settled`). **Corrections** are **new rows** (reversal references), not silent `UPDATE`s of amounts.
2. **Tamper-evident chaining per stream:** each row includes **`hash(prev_row)`** or roll up to a **Merkle root** per fund period so backups or manual edits break verification.
3. **Signed period commitments:** once a period is finalized, publish a **small signed document** (platform key in **HSM/KMS**): period id, `G`, `E`, `R`, split amounts, Merkle root of allocation leaves. Signatures are verifiable **off-chain** without a blockchain.
4. **Optional:** **RFC 3161** (or similar) **timestamping** of the signed commitment if independent **time attestation** is required—still not a user-operated chain.
5. **User-owned copies (optional):** push **per-creator signed receipts** (or encrypted statements) to **that creator’s** storage (e.g. Drive metadata folder) for **portability and dispute evidence**—**not** a requirement that every user replicate a **network-wide** ledger.

**Explicit non-goals (unless product changes later)**

- **Public global consensus** over payout state.
- **Smart contracts** as the source of truth for subscription revenue allocation.

**Trust boundary:** This model gives **“the operator cannot silently rewrite history without detection”** to anyone who verifies signatures and the hash chain. It does **not** remove the need to **trust the platform** for **which events were admitted** before sealing a period—that is addressed by **operations**, **identity economics**, and **abuse detection**, not by a chain.

**Interaction with payouts:** The internal ledger records **accrual**, **allocation**, and **payout batch instructions** (amounts, payee references, batch ids). **Movement of money to creators’ bank accounts** (and **stablecoin** payouts **only where Stripe Connect supports** the platform and payee profile) plus **tax information collection** are performed by **Stripe**—not by re-implementing global withholding and IRS form logic in par Noir.

---

## Inbound payments (Stripe) for monetization maintenance

**Policy:** All **monetization maintenance** subscription charges that count toward this doc’s **`G`** are processed by **Stripe** (e.g. **Stripe Billing** recurring subscriptions and/or **Checkout** for payment collection—exact product to match engineering and finance). **Webhook-verified** payment success is the **source of truth** for crediting **`creator_fund_revenue_events`** and entitlement rows.

- **Secrets:** Use **Stripe webhook signing** (`STRIPE_WEBHOOK_SECRET` or platform equivalent); never trust unsigned callbacks.
- **Identity binding:** Each subscription or customer object must map to a stable **par Noir identity** id in metadata for reconciliation.
- **Separation:** Do **not** route **paid feed** or **other** Coinbase (or non-Stripe) charges into this **`G`** stream—those products keep their own integration until a deliberate migration.

### Paying maintenance from creator balance (optional product)

**Policy:** The dashboard (or API) may offer **“Pay my monetization maintenance from my creator balance”** so a payee applies **accrued fund balance** toward the **next** maintenance period instead of charging their **Stripe** payment method for that period.

**Eligibility (product defaults—tune with risk):**

- Same **identity verification** and **subscription entitlement** rules as card payers; this option **extends** renewal, it does **not** replace verification.
- Debit only from balance that is **eligible under the same (or stricter) rules as payee-initiated payouts**—e.g. **after** the **45-day** hold and **not** in dispute—so subscription is not funded with amounts that could still be **clawed back** as easily. (Stricter alternative: only amounts that would already meet the **$10** payout threshold logic—document whichever you ship.)
- **Sufficient** balance to cover the **full** maintenance price for the renewal window (no **partial** balance + card split in **v1** unless product explicitly adds it later).

**Ledger (engineering target):**

- **Append-only:** `subscription_balance_debit` (or equivalent) row: identity id, amount, period covered, reference to pricing, **no** raw payment details.
- **Entitlement:** Server-side **active maintenance** flag / period end updated **only** after the debit commits; **idempotent** so double-clicks do not double-charge the balance.
- **Relationship to Connect:** This is **not** a Connect payout; it is **internal** settlement (reduce **liability** to the payee, recognize subscription). **Stripe** subscription objects may still be used for **card** payers—balance payers need a **documented** pattern (e.g. **parallel** entitlement table with Stripe subscription **paused** or absent for that identity, or **Stripe Customer balance** / **$0 invoice** patterns—**finance + engineering** choose one source of truth).

**Accounting (`G`)—must match books:** Either (a) record a **`G`-equivalent** non-cash line so **`G` → `E` → `R`** denominators stay comparable to “everyone paid cash,” or (b) exclude balance-funded renewals from **`G`** and track **cash `G`** separately in dashboards—**pick with CPA** (see [Open decisions](#open-decisions)).

**Disclaimer:** Balance-funded renewal may affect **1099 / reporting** characterization vs card-funded maintenance; **counsel and CPA** sign off before launch.

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

- **Rolling periods:** **`G`**, **`E`**, and bounty **accrual** use **rolling** fund periods (exact window length—e.g. 7 vs 30 days—is an **implementation** choice; boundaries and **finalization** timestamps are computed in **`America/New_York` (US Eastern)**).
- **Payout rail geography (launch):** **United States only** for **Connect** payees and bank payouts at v1; expand countries only after policy + Stripe capabilities are updated.

### Payout timing and thresholds (confirmed)

- **45-day hold:** Creator (or music-pool) share from a given **closed rolling accrual period** becomes **eligible for disbursement** only after **45 calendar days** have passed since **that period’s balances were finalized** in **Eastern Time** (time to absorb **chargebacks**, **subscription reversals**, **fraud or data corrections**, and to stabilize the pool before cash leaves the platform). Until then, amounts remain **pending payout** in the internal ledger.
- **Payee-initiated payouts:** The **platform does not** silently sweep all balances. Each **payee** (**creator** or **rights holder** on the music pool) **initiates** their **Stripe Connect** payout from **dashboard or licensing portal** when **eligible**. **Product cadence:** surface **1st** and **15th** of each month (**Eastern**) as the standard **payout days** when users should initiate (UX and ops may still allow initiation **outside** those dates if Stripe and risk policy allow—engineering documents the chosen rule).
- **Minimum payout:** **$10 USD** per **transfer** at US launch; if **eligible** balance is below the minimum, **no transfer** and the balance **accumulates**.
- **Carryover:** Sub-minimum and not-yet-held amounts **carry forward** across rolling periods until paid or adjusted by **clawback / reversal** ledger entries.
- **24-month dormancy (product):** If **24 consecutive months** elapse **without** a **settled payee-initiated payout** while the payee had **eligible** balance **at or above** the **minimum** and **completed Connect onboarding**, treat the account as **dormant** for **workflow purposes**: **notify** the payee and start **counsel-approved** **escheatment / unclaimed-property** review per applicable law. This is **not** “automatic forfeiture at 24 months”—**legal outcome** depends on jurisdiction and facts. Sub-minimum balances continue to **accumulate** until they reach **$10**; the **24-month** clock is tied to **avoidable dormancy** (eligible + onboarded + no successful payout), not to raw “last login.”

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
| **Inbound `G`** | Only **monetization maintenance** Stripe events append to **`creator_fund_revenue_events`**; **no** feed or other SKU leakage. **Balance-funded** renewals append **only** per the **ledger + `G` policy** in [Pay from balance](#paying-maintenance-from-creator-balance-optional-product)—no fake Stripe webhooks. |
| **Payouts** | **Connect** onboarding live (**US-only** v1); **payee-initiated** flows tested; **1st/15th Eastern** UX/cadence; **45-day** hold matches ledger; **$10** minimum; **24-month dormancy** workflow stubbed; **reversal** rows tested. |
| **Stablecoin** | If offered: **Stripe** program **explicitly** enabled for your **platform country** and **payee** types; otherwise **disable** crypto payout UI until enabled. |
| **Identity / subscription** | **Server-side** entitlement for “verified + subscribed”; **remove demo-only** client paths for any payment that gates eligibility. |
| **Accounting** | Resolve open **`G` gross vs net** and **`E`** treatment with finance; export matches internal **`R`**. |
| **Periods** | **Rolling** accrual, **`America/New_York`** for boundaries and finalization; document **exact rolling window length** in implementation. |
| **Music** | v1 can ship **without** library 75/25 enforcement **or** ship registry—**choose** so engineering does not guess. |
| **Legal** | Counsel sign-off on **Connect** agreement, **payout classification**, **US-only** launch posture, **escheatment** and **24-month dormancy** workflow (#9), **balance-funded renewal** reporting (#6). |
| **Observability** | Alerts on webhook failures, payout failures, ledger imbalance; **no** sensitive PII in logs. |

---

## Reference scenario (illustrative only)

Not a forecast or commitment:

- **10k** paying users × **$5**/mo ⇒ **`G ≈ $50k`/mo**. If **`E = $10k`**, then **`R = $40k`**, **creator fund ≈ 0.75 × R = $30k`/mo** before per-creator engagement and music splits.
- At **~100k DAU**, social-order-of-magnitude **posts/month** often sit in a **wide** band (e.g. **~6k–30k+**) depending on what fraction of users post; **engagement volume** affects **how thinly** a fixed fund spreads, not the **fund size** (driven by payers and price).

---

## Relationship to codebase

As of this document, the repo has **no** production-complete **creator fund ledger**, no automated **G → E → R → 25/75** accounting, and **no** **Stripe** integration for **monetization maintenance**. Verification payment handling includes **demo-oriented** paths (e.g. dashboard `VerificationPaymentHandler` local storage). API **Coinbase** webhooks today cover **feed creation and feed subscriptions**—those remain **separate** from creator-fund **`G`** until feeds migrate to Stripe (optional future). The **licensing portal** app is an **intake form** only ([`apps/licensing-portal`](../../apps/licensing-portal)); **catalog sync** and **authenticated** rights-holder flows are **not** built yet.

Engineering should treat this file as the **policy target**: **Stripe** for **inbound** maintenance revenue and **Stripe Connect** as the **only** creator-fund **payout** rail; ledger per [Ledger transparency (no blockchain)](#ledger-transparency-no-blockchain); go-live per [Production readiness checklist](#production-readiness-checklist-before-launch).

---

## Open decisions

1. **SKUs:** Single **“verification + monetization maintenance”** subscription vs separate **identity verification** and **creator eligibility** products—pricing, naming, **Stripe** Price/Product ids and **metadata** for API entitlements.
2. **Rolling window length:** e.g. **7-day** vs **30-day** rolling fund periods (boundaries and finalization use **`America/New_York`**—see [Payouts](#payouts-and-tax-compliance-stripe-connect)).
3. **Music library:** Authoritative **track registry**, artist opt-in, and **on-content proof** (“this post uses library track X”) for enforcing **75/25**—or **defer** v1 to “no library split” until registry exists.
4. **`E` transparency:** Line items **in** vs **out** of creator-facing OPEX reporting (e.g. internal dev tools).
5. **PSP treatment:** Whether **`G`** is recorded **gross** with **Stripe** fees inside **`E`**, or **net** at collection—must be consistent in books and dashboards.
6. **Balance-funded maintenance vs `G`:** Whether renewals paid from **creator balance** count toward the same **`G`** line as Stripe card revenue (**fair-value non-cash** adjustment), are **excluded from `G`** with a separate reporting series, or use another **CPA-approved** mapping—drives dashboards and period seals.
7. **Key management:** Which **KMS/HSM** and key rotation policy backs **period signatures** and optional timestamping.
8. **Stripe Connect mode:** **Express vs Standard vs Custom** for **payee-initiated** payouts (**US-only** v1—international expansion later).
9. **Dormant balances:** Operational detail of the **24-month** dormancy workflow (notices, data retention, handoff to counsel)—**escheatment** remains **law-driven** once triggered.
10. **Music-pool-only payees:** Whether licensors who **only** receive **library pool** shares must hold **monetization maintenance** subscription (same as posting creators) or may use **verified identity + Connect + contract** alone—pick explicitly for v1.

---

## Related documentation

- [IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md) (implementation phases; cost notes may evolve—**economics canonical here**)
- [SHARED_CODE_RULES.md](../../SHARED_CODE_RULES.md) (guiding principles, including crypto without blockchain)
- [third-party sharing and L5](../developer/third-party-sharing-and-L5.md)
- Identity verification (product): [IDENTITY_VERIFICATION.md](../../apps/id-dashboard/docs/IDENTITY_VERIFICATION.md)

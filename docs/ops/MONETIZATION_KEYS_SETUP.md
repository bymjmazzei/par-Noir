# Monetization keys setup (Stripe + Stripe Identity)

The monetization loop is built and tested: subscribe ($10/mo), verify identity with Stripe Identity (included in the membership), earn from the creator fund, and get paid out through Stripe Connect. Everything stays off until these keys are set. This is the checklist for turning it on.

Do it all in **test mode first** (Stripe `sk_test_...` and a test-mode restricted key), run the smoke test at the bottom, then repeat with live keys.

---

## 1. Env variables at a glance

All of these go on the **API service in Railway** (Variables tab), not in any app `.env`. None of them are `VITE_` vars; nothing ships to the browser.

| Variable | Where it comes from | Required |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys | Yes |
| `STRIPE_MONETIZATION_PRICE_ID` | Printed by the bootstrap script (step 2) | Yes |
| `STRIPE_MONETIZATION_RENEWAL_CENTS` | Printed by the bootstrap script (`1000`) | Recommended |
| `STRIPE_WEBHOOK_SECRET` | Printed by the bootstrap script | Yes |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Printed by the bootstrap script | Yes |
| `STRIPE_IDENTITY_RESTRICTED_KEY` | Stripe Dashboard → Developers → API keys → restricted key (step 3) | Yes |
| `STRIPE_IDENTITY_COST_CENTS` | Stripe Identity price per verification, in cents | Yes |
| `CREATOR_FUND_CRON_SECRET` | Generate: `openssl rand -hex 32` | Yes |
| `ADMIN_API_KEY` | Already set if admin routes work; needed for the readiness check | Yes |

Optional (defaults are fine):

| Variable | Default | What it does |
| --- | --- | --- |
| `CREATOR_FUND_PERIOD_DAYS` | `30` | Length of a fund period |
| `CREATOR_FUND_PAYOUT_HOLD_DAYS` | `45` | Days after a period closes before earnings are payable (covers refund/dispute window) |
| `CREATOR_FUND_PERIOD_ATTESTATION_SECRET` | unset | HMAC stamp on each closed period |
| `VERIFICATION_VALIDITY_DAYS` | `365` | How long a verification (and its credential) stays valid |
| `CREATOR_FUND_PAIR_WEIGHT_CAP` | `5` | Max engagement weight one engager pN can send to one owner per period (5 comments, or 50 likes) |

**No identity data is stored on the server.** When Stripe verifies a session, the API signs a verification credential (with the existing OAuth signing key, checkable via `/.well-known/jwks.json`), the user keeps it in their pN's encrypted Knowledge docs, and the API redacts the session at Stripe. The server keeps only "this pN is verified until X". Nothing extra to generate or rotate.

**Each pN verifies and pays separately.** The same real-world ID can verify any number of pNs; each one pays its own Stripe Identity check and membership. The creator fund ignores engagement on your own content and caps how much one pN can send to one owner per period.

Crypto payouts are a second, optional rail; their variables are in [Crypto payouts (optional)](#crypto-payouts-optional).

---

## 2. Stripe

1. **Turn on Connect.** Stripe Dashboard → Connect → get started, choose **Express** accounts for the platform. Payouts to creators won't work without this.
2. **Run the bootstrap script** (creates the product, the $10/month price, and both webhooks; safe to re-run):

   ```bash
   cd api
   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-bootstrap.mjs
   ```

   It prints `STRIPE_MONETIZATION_PRICE_ID`, `STRIPE_MONETIZATION_RENEWAL_CENTS`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_CONNECT_WEBHOOK_SECRET`. Copy them straight into Railway.

   Stripe shows a webhook signing secret **only when the endpoint is first created**. If the script says an endpoint already existed, open it in Stripe Dashboard → Developers → Webhooks and click **Roll secret** to get a new one.

3. Webhooks it creates (for reference):
   - Platform: `https://api.parnoir.com/api/monetization/stripe-webhook`
     (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`, `transfer.reversed`, `identity.verification_session.verified`, `identity.verification_session.requires_input`)
   - Connect: `https://api.parnoir.com/api/monetization/stripe-connect-webhook` (`checkout.session.completed`, for paid licenses)

---

## 3. Stripe Identity

1. Stripe Dashboard → **Identity** → activate it for the account (test mode first).
2. Developers → API keys → **Create restricted key** with:
   - Identity → **Verification Sessions and Reports**: write
   - **Access sensitive verification results** (needed for date of birth and document number)

   Copy it → `STRIPE_IDENTITY_RESTRICTED_KEY`. Stripe only serves the sensitive fields for a limited time after a session is verified, so users should finalize soon after Stripe approves.
3. No separate webhook: the bootstrap script subscribes the platform webhook to `identity.verification_session.verified` and `identity.verification_session.requires_input`. Re-run it if your endpoint predates this.
4. Set `STRIPE_IDENTITY_COST_CENTS` to what Stripe charges per verification (e.g. `150` for $1.50). Each billed check is recorded once as a fund expense, so it comes out of the subscriber's first month before the fund split. If unset, verification still works but the cost isn't recorded.

### Crypto payouts (optional)

Creators can take payouts as **USDC on Base** to a wallet they save in the dashboard, instead of (or alongside) Stripe Connect. It's sent from the platform's Coinbase account through the Coinbase App API; this is separate from Coinbase Commerce, which handles incoming payments. The rail is off unless all four variables are set.

| Variable | Where it comes from |
| --- | --- |
| `COINBASE_PAYOUT_API_KEY_NAME` | [CDP portal](https://portal.cdp.coinbase.com) → API keys → create a key (ECDSA / ES256) with the **transfer** permission; the `organizations/.../apiKeys/...` name |
| `COINBASE_PAYOUT_API_KEY_SECRET` | That key's PEM private key, newlines escaped as `\n` |
| `COINBASE_PAYOUT_ACCOUNT_ID` | UUID of the funded USDC account (`GET /v2/accounts`) |
| `CRYPTO_PAYOUT_SANCTIONS_LIST_PATH` | Path on the API host to a sanctioned-address list: one address per line, `#` comments allowed (e.g. the OFAC SDN digital currency addresses) |

- Crypto payouts need a **verified identity**; a self-custody wallet has no identity check of its own.
- Every wallet is checked against the sanctions list when it's saved, when a payout is requested, and again before sending. If the file can't be read, saves and requests are refused and queued payouts wait. Keep the list current.
- Fund the USDC account before each payout day. A send that fails on the network stays queued and retries on the next run with the same Coinbase idempotency key (the payout row id), so it can't pay twice.
- The readiness check reports this rail separately under `cryptoPayouts`; it doesn't affect `"ready"`.

---

## 4. Generated secret

```bash
openssl rand -hex 32   # CREATOR_FUND_CRON_SECRET
```

Save it in your password manager before pasting into Railway.

---

## 5. Daily cron (GitHub Actions)

`.github/workflows/creator-fund-cron.yml` runs daily: closes the fund period when one is due, then sends queued payouts. It skips itself until the secret is set.

GitHub repo → Settings → Secrets and variables → Actions:

- **Secret** `CREATOR_FUND_CRON_SECRET` = same value as on Railway
- **Variable** `API_BASE_URL` (optional; defaults to `https://api.parnoir.com`)

Run it once by hand from the Actions tab (**Run workflow**) to confirm it works.

---

## 6. Confirm everything is set

After Railway redeploys the API:

```bash
curl -s https://api.parnoir.com/api/monetization/readiness \
  -H "X-Admin-Key: $ADMIN_API_KEY"
```

Expect `"ready": true`. If not, `missing` lists exactly which variables are absent (values are never shown).

---

## 7. Smoke test (test mode)

1. **Subscribe:** dashboard → Monetization → **Subscribe (Stripe Checkout)**. Pay with test card `4242 4242 4242 4242`. Status should show the membership active.
2. **Verify:** click **Verify identity (included)**. Complete Stripe's test verification flow. Back on the dashboard, finalize; the badge shows verified. In Railway Postgres, `creator_fund_opex_events` has one `stripe_identity` row.
3. **Connect:** Monetization → **Stripe Connect onboarding** → finish Stripe's test onboarding.
4. **Earn:** from a second verified + subscribed pN, like/comment on the first pN's public posts.
5. **Close a period quickly:** temporarily set `CREATOR_FUND_PERIOD_DAYS=1` and `CREATOR_FUND_PAYOUT_HOLD_DAYS=0`, wait a day (or use a fresh test DB), then:

   ```bash
   CREATOR_FUND_CRON_SECRET=... bash scripts/creator-fund-period-close.sh
   ```

6. **Pay out:** dashboard → **Request bounty payout** (minimum $10; the button appears once Connect is onboarded and the balance is payable). Stripe transfers need available platform balance; in test mode, top it up by charging test card `4000 0000 0000 0077` (funds land as available immediately). Then:

   ```bash
   curl -s -X POST "https://api.parnoir.com/api/creator-fund/payouts/run?force=1" \
     -H "X-Cron-Secret: $CREATOR_FUND_CRON_SECRET"
   ```

   (`force=1` skips the payout-day schedule.) The payout row should be `paid` with a Stripe transfer id.
7. **Refund/dispute (optional):** refund a subscription charge in the Stripe Dashboard, or pay with `4000 0000 0000 0259` to trigger a dispute. A negative `refund` / `dispute` row appears in `creator_fund_revenue_events`.
8. **Reset** `CREATOR_FUND_PERIOD_DAYS` and `CREATOR_FUND_PAYOUT_HOLD_DAYS` back to defaults (delete them).

---

## 8. Going live

1. Run the bootstrap script again with `sk_live_...` (live mode has its own products, prices, and webhooks).
2. Replace in Railway: `STRIPE_SECRET_KEY`, `STRIPE_MONETIZATION_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`.
3. Create a live restricted key (step 3) and replace `STRIPE_IDENTITY_RESTRICTED_KEY`; confirm `STRIPE_IDENTITY_COST_CENTS`.
4. **Keep** `CREATOR_FUND_CRON_SECRET` as it is, and don't rotate the OAuth signing key without publishing the old key in JWKS (held verification credentials are checked against it).
5. Re-check `/api/monetization/readiness`, then run `./deploy.sh` from the repo root so the dashboard picks up the latest build.

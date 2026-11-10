# Monetization keys setup (Stripe + Veriff)

The monetization loop is built and tested: subscribe ($10/mo), verify identity with Veriff (included in the membership), earn from the creator fund, and get paid out through Stripe Connect. Everything stays off until these keys are set. This is the checklist for turning it on.

Do it all in **test mode first** (Stripe `sk_test_...`, Veriff test integration), run the smoke test at the bottom, then repeat with live keys.

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
| `VERIFF_API_KEY` | Veriff Customer Portal → Integrations | Yes |
| `VERIFF_SHARED_SECRET` | Veriff Customer Portal → Integrations | Yes |
| `VERIFF_COST_CENTS` | Your Veriff contract price per check, in cents | Yes |
| `VERIFICATION_DEDUPE_SECRET` | Generate: `openssl rand -hex 32` | Yes |
| `LEGAL_NAME_HMAC_KEY` | Generate: `openssl rand -hex 32` | Yes (production) |
| `CREATOR_FUND_CRON_SECRET` | Generate: `openssl rand -hex 32` | Yes |
| `ADMIN_API_KEY` | Already set if admin routes work; needed for the readiness check | Yes |

Optional (defaults are fine):

| Variable | Default | What it does |
| --- | --- | --- |
| `CREATOR_FUND_PERIOD_DAYS` | `30` | Length of a fund period |
| `CREATOR_FUND_PAYOUT_HOLD_DAYS` | `45` | Days after a period closes before earnings are payable (covers refund/dispute window) |
| `CREATOR_FUND_PERIOD_ATTESTATION_SECRET` | unset | HMAC stamp on each closed period |

**Never change `VERIFICATION_DEDUPE_SECRET` or `LEGAL_NAME_HMAC_KEY` once real users have verified.** They hash stored data; rotating them breaks duplicate-ID detection and name matching for everyone already verified. Store copies in your password manager.

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
     (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`, `transfer.reversed`)
   - Connect: `https://api.parnoir.com/api/monetization/stripe-connect-webhook` (`checkout.session.completed`, for paid licenses)

---

## 3. Veriff

1. Veriff Customer Portal → **Integrations** → create (or open) the integration. Use a **test** integration first.
2. Copy the **API key** → `VERIFF_API_KEY` and the **shared secret key** → `VERIFF_SHARED_SECRET`.
3. In the integration settings, set **both** webhook URLs to:

   ```
   https://api.parnoir.com/api/verification/veriff/webhook
   ```

   (decision webhook = verification result; event webhook = started/submitted. The API handles both on the same URL.)
4. Set `VERIFF_COST_CENTS` to what Veriff charges you per check (e.g. `180` for $1.80). Each billed check is recorded once as a fund expense, so it comes out of the subscriber's first month before the fund split. If unset, verification still works but the cost isn't recorded.

---

## 4. Generated secrets

```bash
openssl rand -hex 32   # VERIFICATION_DEDUPE_SECRET
openssl rand -hex 32   # LEGAL_NAME_HMAC_KEY
openssl rand -hex 32   # CREATOR_FUND_CRON_SECRET
```

Save each in your password manager before pasting into Railway.

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
2. **Verify:** click **Verify identity (included)**. Complete Veriff's test flow. Back on the dashboard, the badge shows verified. In Railway Postgres, `creator_fund_opex_events` has one `veriff` row.
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
3. Switch to the live Veriff integration: replace `VERIFF_API_KEY`, `VERIFF_SHARED_SECRET`, set its webhook URLs (step 3), confirm `VERIFF_COST_CENTS`.
4. **Keep** `VERIFICATION_DEDUPE_SECRET`, `LEGAL_NAME_HMAC_KEY`, and `CREATOR_FUND_CRON_SECRET` as they are (unless no real user has verified yet).
5. Re-check `/api/monetization/readiness`, then run `./deploy.sh` from the repo root so the dashboard picks up the latest build.

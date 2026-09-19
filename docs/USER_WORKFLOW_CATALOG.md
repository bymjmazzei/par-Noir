# User workflow catalog (live QA)

Authority for **this pass** (2026-09-16). Tab-click maps remain in [`LIVE_APPS_STATUS.md`](LIVE_APPS_STATUS.md). A workflow is done only when the **user-visible conclusion** is observed.

**Fixture:** agent `.local/cursor-test-pn` only. Do not mint or overwrite it. Dual-pN (`.local/test-pn`) only when a second identity is required.

**Skipped as already proven (do not re-test this pass):**

| Skip | Why |
|---|---|
| Live Create New pN submit | Existing fixture; walk modal only, never write keys |
| Google Drive connect / OAuth Google picker | Proven |
| Drive index-root / layout population | Proven; Storage tab only **lists** existing custody |

**Deferred (not product bugs unless adjacent UI crashes):** Veriff, Stripe / creator-fund go-live, platform paid feed subscribe `410`.

Labels after a run: `LIVE_REAL` | `LIVE_UNFINISHED` | `BLOCKED` | `SKIPPED_PROVEN` | `DEFERRED` | `POLICY_410`.

Evidence: **OBSERVED** vs **INFERRED**. 429 / cancelled step → `BLOCKED`.

Harness: [`apps/aggregator-browser/scripts/ux-new-user-qa.mjs`](../apps/aggregator-browser/scripts/ux-new-user-qa.mjs) → `.local/ux-playwright/new-user/report.json`.

---

## Dashboard (`https://pn.parnoir.com/`)

| Id | Start | Action | Conclusion | Falsifier |
|---|---|---|---|---|
| `dashboard.create_modal` | Locked `/` or `?create=1` | Open Create New pN | Modal title visible | Close without submit; never write fixture |
| `dashboard.unlock` | Locked gate | Upload `.pn` + Key 1/2 → Unlock | Authenticated shell; **Lock** visible | Still on gate |
| `dashboard.privacy` | Unlocked | Tab Privacy & Sharing | Data points / sharing chrome loaded | Error / 4xx loop |
| `dashboard.privacy.grants` | Privacy tab | View third-party access | Grant list or honest empty | Crash |
| `dashboard.privacy.verify` | Privacy tab | Open Verify | Deferred copy (Veriff) | Crash / fake “verified” |
| `dashboard.subpn` | Unlocked | Tab Sub-pN | List or create chrome | Dead tab |
| `dashboard.delegation` | Unlocked | Tab Delegation | List or create chrome | Dead tab |
| `dashboard.recovery` | Unlocked | Tab Recovery Tool | Vault/custodian status (no live recover) | Dead tab |
| `dashboard.storage` | Unlocked | Tab Storage | Layout status + file list via owner routes | `cloud_token_*` / silent empty error |
| `dashboard.storage.connect` | — | — | `SKIPPED_PROVEN` | Do not reconnect |
| `dashboard.monetization` | Unlocked | Tab Monetization | Stripe deferred copy | Crash / fake paid success |
| `dashboard.devices` | Unlocked | Devices chrome if present | List or empty-but-real | Crash |
| `dashboard.lock` | Unlocked | Lock | Back on unlock gate | Session stuck |

## Browse (`https://browse.parnoir.com/?view=feed`)

| Id | Start | Action | Conclusion | Falsifier |
|---|---|---|---|---|
| `browse.unlock` | Locked | Padlock OAuth popup | Lock control; no amber keys-missing banner | Unlock fail |
| `browse.rail.*` | Unlocked feed | DISCOVER / MEDIA / THOUGHTS / COLLECTIONS | Content **or** honest empty | Spinner/error with no copy |
| `browse.search` | Unlocked | Search “art” | Results pane or empty-results | Error, no pane |
| `browse.upload.thought` | Unlocked | Upload → **Add Content (+)** → Add Thought → metadata **Submit** | Thought queued/complete; visible on Me | Upload error / never on Me |
| `browse.upload.expiry` | Upload or Share settings | Set Never / 24h / 48h / 7d / custom → public | Post visible until expiry; then gone from discover and stored private | Stays public forever / deleted from storage |
| `browse.engage.like` | Own or public post | Like then unlike | Count/filled state + `POST .../like` 2xx | No request / 4xx |
| `browse.engage.comment` | Same post | Add comment | Comment visible | No request / 4xx |
| `browse.engage.save` | Same post | Save | Saved state + API 2xx | Dead control |
| `browse.engage.share` | Same post | Share | Toast or share API | Dead control |
| `browse.follow` | Creator profile | Follow if distinct from Connect | Following state changes **or** no distinct Follow (note) | Crash |
| `browse.feed.create` | Home + | Create Feed | Modal explains dashboard Sub-pN **or** feed created | Missing CTA |
| `browse.feed.discover` | Feeds UI | Discover/list | List or empty; paid subscribe `410` = `POLICY_410` | Hard error |
| `browse.me` | Bottom Me | Open own profile | Profile chrome; own post if uploaded | Blank error |
| `browse.inbox` | Bottom Inbox | Open overlay | Messages/Requests chrome | Blank error |
| `browse.report_own` | Own test post | Report copyright | Confirmation (own post only) | Reports others / no CTA |
| `browse.lock` | Unlocked | Lock pN | Locked padlock | Stuck unlocked |

## Messaging (`https://messaging.parnoir.com/`)

Separate origin unlock (browse session does not apply).

| Id | Start | Action | Conclusion | Falsifier |
|---|---|---|---|---|
| `messaging.unlock` | Locked | Unlock popup | Cloud AT; no `linkedInactive` banner | 409 cloud / banner |
| `messaging.messages` | Unlocked | Messages tab | Thread list or empty | Error |
| `messaging.notifications` | Unlocked | Notifications | Hits `/api/notifications` or honest empty | Never requests / error |
| `messaging.requests` | Unlocked | Requests | List or empty | Error |
| `messaging.connections` | Unlocked | Connections | List or empty | Error |
| `messaging.group` | Connected peer | New group + send | Thread + send 2xx | Skip if no peer; do not re-prove dual DM |
| `messaging.lock` | Unlocked | Lock | Locked | Stuck |

## OAuth + permissions (`https://developers.parnoir.com/` + API consent)

| Id | Start | Action | Conclusion | Falsifier |
|---|---|---|---|---|
| `developer.unlock` | Locked | Unlock pN (redirect consent) | Signed in; credentials list | Unlock fail |
| `developer.credentials.list` | Signed in | `/credentials` | Clients/keys list or empty | Error |
| `developer.oauth.register` | Credentials | Save throwaway client `qa-cursor-*` | Client id **or** pending-review copy | 4xx |
| `developer.oauth.authorize` | Registered/approved client | Consent Step 1+2 | Token; grant on dashboard Privacy | Pending-only = unfinished |
| `developer.oauth.revoke` | Grant present | Dashboard Revoke | Grant gone | Still listed |
| `developer.platform` | `/platform` | Open | Gate/redirect for non-operator | Crash |
| `developer.nav.*` | Signed in | Data points / docs / integrate / api-ref / proposals | Page readable | 404 |

## Prism (`https://prism.parnoir.com/`)

| Id | Start | Action | Conclusion | Falsifier |
|---|---|---|---|---|
| `prism.unlock` | Locked | Unlock | Unlocked shell | Fail |
| `prism.apply` | Unlocked or locked CTA | Apply / Submit | Submitted **or** ineligible copy | Button missing, no explanation |
| `prism.queue` | Unlocked | Ray queue | Empty-but-real **or** approve/deny | Dead chrome |
| `prism.admin_seed` | Admin only | Seed demo | Seeded **or** not-admin (expected) | Crash |

## Licensing (`https://licensing.parnoir.com/`)

| Id | Start | Action | Conclusion | Falsifier |
|---|---|---|---|---|
| `licensing.unlock` | Locked | Sign in with pN | Signed-in shell | Fail |
| `licensing.tracks.list` | Signed in | Track library | List or “No tracks yet” | Error |
| `licensing.tracks.add` | Form | Add track “QA cursor test” | Track in list | Control missing / 4xx |
| `licensing.partner` | Any | Partner inquiry | mailto/form reachable | Missing |

---

## Pace

- One origin per Chromium context; ≥90s after each authenticate+token pair.
- Honor `Retry-After`. Do not run Drive connect/disconnect/swap scripts.
- No secrets in reports (API path + status only).

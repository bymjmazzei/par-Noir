# Device cloud custody — outbox SoT / opaque throughway E2E

Custody defaults **on** (`DEVICE_CLOUD_CUSTODY` unset or `1`). Opt out only with `0`/`false`/`no`.

## Happy path (cross-cloud DM)

1. On connect: each party mints `mailbox_route_key`; peer stores it as `peerMailboxRouteKey` on the connections row.
2. Recipient dashboard locked / native asleep.
3. Sender (browser): local sealed outbox commit → `POST /api/messages/send` with client `messageId`, `connectionId`, and peer `routeKey` when known.
4. API responds `delivery: "throughway"`; durable `social_mailbox` rows keyed by **`route_key`** only (no clear from/to in payload).
5. Recipient unlocks id-dashboard: ensure route key → flush claims pending by route (+ legacy pepper fallback) → materialize conversation/notification into **own** cloud → ack.
6. Sender unlocks dashboard: promote local/bridge outbox → cloud `_outbox/` + sender conversation silo; reconcile re-enqueues missing throughway jobs by `routeKey`.

## Wipe / rebuild

1. Mid-flight: delete recipient’s pending `social_mailbox` rows.
2. Sender unlock (or browser `reconcileSenderOutboxFanout`): lookup miss → idempotent `POST /api/mailbox/enqueue` from outbox payload (route key / legacy).
3. Recipient unlock receives rebuilt jobs.

## Browser before dashboard

1. Send from browser only; keep local outbox `pending`/`enqueued`.
2. API fan-out fails: outbox remains; retry send/reconcile without dropping commit.
3. Open dashboard unlock: bridge/local promote writes cloud SoT when credentials unsealed.

## Engagement

Likes/comments return `delivery: "public"` (aggregator counts only). **No** mailbox jobs for engagement. Actor own-cloud preference/engagement writes stay on the actor device → own provider.

## Cloud grants

Reconnect Dropbox (App folder), OneDrive (AppFolder), S3/Azure (forced prefix; Azure SAS-only). Google stays `drive.file`.

## Ops

Apply `api/migrations/add_social_mailbox_route_key.sql`. Set `MAILBOX_ROUTE_PEPPER` in production (legacy route derivation for pre-exchange connections).

`npx tsx scripts/purge-storage-credentials-secrets.ts` then rotate `STORAGE_CREDENTIALS_SECRET` if any legacy secrets remain.

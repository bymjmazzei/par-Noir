# Diagnostic: dashboard Drive 401 / owner-index 409, and the unreadable published thought

Date: 2026-08-09. Read-only diagnostic. No source files were changed.

Every finding below is labelled **OBSERVED** (an observation was made and is named) or
**INFERRED** (read off code or call graph, not executed), per
`.cursor/rules/diagnostic-discipline.mdc` section 6.

---

## Summary

Two unrelated roots, plus one UI defect that turns the second into a hang.

| Bug | Root | Layer |
|---|---|---|
| A | Google access tokens are used without validating freshness, and a 55-minute expiry is invented when none is known | Dashboard client |
| B | `publicContentRef` is not accepted by the PUT metadata route or by the service beneath it, so it is discarded on every write | API |
| C | Two feed components render a spinner keyed on an absent map entry and have no failure state | Browser client |

Bug B is fully established at runtime. Bug A's mechanism is established in code; its
user-visible symptom did **not** reproduce on a cold unlock, which narrows the trigger.

---

## Bug A: `drive/v3/about` 401 and `owner-index` 409

### Falsification gate

Hypothesis: no `makeRequest` call site validates token freshness before sending.
Falsifying observation: any call site that checks freshness first.

**OBSERVED — not falsified.** `apps/id-dashboard/src/services/storage/GoogleDriveBackend.ts`
has 14 external `this.makeRequest(` call sites plus one internal retry. Every one guards
with `if (!this.token)`, a *presence* check. `makeRequest` (line 500) reads `this.token` at
501 and sends it at 524 as `Bearer ${this.token}`, consulting `this.tokenExpiresAt` nowhere.
The 401 the user reported originates at `getUserInfo()` (line 1566) → line 1573.

### Mechanism

**OBSERVED.** The class owns a correct check-then-mint method, `ensureAccessToken()` at line
247, which validates `tokenExpiresAt` against a 60s skew. No line in the file calls it. The
divergence is documented at line 278: *"Internal Drive calls still use this.token and run 401
recovery."*

Three aggravating factors:

1. **OBSERVED.** `ensureAccessToken` returns `null` on the unrefreshable path (line 279)
   **without clearing `this.token`**. The dead token remains in the field and the next
   `makeRequest` sends it again.
2. **OBSERVED.** `connect()` line 164 sets `this.tokenExpiresAt = Date.now() + 55*60*1000`
   when no expiry is supplied. The canonical contract in
   `packages/device-cloud-credentials/src/driveTokenResolver.ts` (lines 92-105) is that
   unknown expiry means **not fresh**. This class inverts it, manufacturing false freshness
   for a token that may already be dead.
3. **OBSERVED.** `getAccessToken()` (line 240) returns the raw unvalidated field to external
   callers.

### Live reproduction

**OBSERVED — the symptom did not reproduce.** A cold unlock of the dashboard with a test pN
produced 26 API/Google calls and **zero failures**: `drive/v3/about?fields=user` returned
**200**, `/api/storage/owner-index/{pn}` returned **200** twice, and the Storage panel
correctly listed the connected provider and the user's file. Three consecutive
`POST /api/auth/google-oauth/refresh` calls (all 200) completed *before* the first Drive
call, so the blind send happened to carry a live token.

**INFERRED.** The 401 is therefore a race between credential refresh/hydration and the first
Drive call from the storage components, or an aged in-tab session — not a property of unlock
itself. The user's original stack (`getAggregatedUserInfo` reached via `setTimeout`) is
consistent with a timing-dependent trigger.

### Classification of the owner-index 409

**OBSERVED.** Reproduced deliberately from the authenticated page context:

| Condition | Status | Body |
|---|---|---|
| Dead cloud token forwarded | 409 | `cloud_token_required` — "Google Drive access token rejected. Forward a fresh `X-PN-Cloud-Access-Token`." |
| No cloud token forwarded | 409 | `cloud_token_required` — "Google Drive access token required." |

Neither is `drive_not_initialized` nor `drive_index_stale`. Per the classification rule this
is a **real credential defect and escalates**; it is not the designed device-custody
fallback. It shares Bug A's root: a Google token that was never validated before use.

### Exposure: other paths with the same root

**OBSERVED**, outside `packages/device-cloud-credentials`:

| Path | Defect |
|---|---|
| `GoogleDriveBackend.refreshAccessToken` (lines 391-494) | Second full refresh implementation: own endpoint call, own 429 backoff, own single-flight. Duplicates `refreshDriveAccessToken`. The file does not import `@par-noir/device-cloud-credentials` at all |
| `GoogleDriveMetadataService.ts` | ~30 direct `Bearer` sends to googleapis.com; `accessToken` is a parameter. Only 401 handling is a throw at line 721 — no refresh. Fed raw `this.token` from `GoogleDriveBackend.uploadFile` lines 1265/1270/1278 |
| `FeedGoogleDriveService.ts` lines 103-115 | Calls `googleDriveBackend.getAccessToken()` straight into a Bearer header; no 401 branch |
| `useDriveCredentialHydration.ts` line 274 | Installs the `__attemptGoogleDrive401Recovery` global hook, consumed at `GoogleDriveBackend.ts:360`. Re-seats cached credentials without going through `resolveFreshDriveToken`. **OBSERVED live**: the hook is present on `window` in a running dashboard |
| `useDriveFileDeletion.ts` lines 168-203 | On owner-API 401, falls back to direct `backend.deleteFile` — a use-then-react chain across two credential systems |

**OBSERVED.** All four external pre-warm callers of `ensureAccessToken`
(`useLoadFileMetadata.ts:58`, `useLoadAggregatedFiles.ts:315`, `cloudSessionBootstrap.ts:143`,
`useDriveCredentialHydration.ts:163`) treat its failure as non-blocking and continue. The
first two then rebuild the token from a four-way fallback chain,
`ensuredToken || backend.getAccessToken() || backend.token || localStorage`, which resurrects
precisely the field the resolver just declined to vouch for.

### Why the ratchet did not catch it

**OBSERVED.** `scripts/check-drive-token-freshness-boundary.sh` does scan this file and
reports OK. `ENVELOPE_PATTERN` requires three things simultaneously — a receiver identifier
beginning with one of seven account-shaped prefixes, a property literally named
`access_token`/`accessToken`, and a trailing `||`. `this.token` fails all three: the receiver
is the keyword `this`, the property is `token`, and the read at line 524 is followed by `}`.
`CLOCK_RESTART_PATTERN` requires `Date.now() + <account-word>.expires_in`, which cannot match
a field read containing none of those tokens.

**OBSERVED, second gap.** The same pattern also misses `GoogleDriveBackend.ts:164`
(`Date.now() + 55 * 60 * 1000` — a numeric literal follows the `+`) and line 461
(`tokenData.expires_in`, where the receiver contains no account-word). Line 461 is
legitimate, but it is unmatched by accident of naming rather than by design.

**INFERRED.** A regex keyed on `Bearer ${this.<field>}` would catch both current violations
with zero false positives today, but is defeated by `const t = this.token;` on the preceding
line, and cannot reach the ~30 parameter-passed sends in `GoogleDriveMetadataService.ts`. A
structural rule is more durable: *any in-scope file containing a googleapis.com fetch must
import from `@par-noir/device-cloud-credentials`*, ratcheted by an allowlist in the style of
`scripts/token-resolver-allowlist.txt`. Current burn-down would be three files. Per rule 1,
whichever check is chosen must be proven to fail on a synthetic violation before it is
trusted. **No such proof has been run.**

---

## Bug B: published thought is permanently unreadable

### Falsification gate

Hypothesis: the row is persisted public with a `publicToken` but no usable
`publicContentRef`. Falsifying observation: a well-formed `publicContentRef` on the row.

**OBSERVED — not falsified.** For the reported file id, live against production:

- `GET /api/aggregator/metadata-index/{fileId}/inspect` → 200. `isPublic: true`,
  `publicToken` present, and **`publicContentRef` absent from the metadata entirely**.
- `GET /api/aggregator/public-content/{fileId}` → **409 `missing_public_content_ref`**
  (not `legacy_embedded_token`).
- Row `uploadDate` is same-day, so it was written by currently deployed code.

**OBSERVED.** The `publicToken` is well-formed: `shareKey` present at 44 chars (base64 of 32
bytes), and `contentKey: {encrypted:'', wrappedWith:'', iv:''}` — which is **hardcoded by
design** at `apps/aggregator-browser/src/services/encryptionService.ts:70`, because embedding
ciphertext in the token is what the `legacy_embedded_token` rule forbids. The empty content
key is correct and is **not** a symptom. Client-side encryption and envelope generation both
succeeded.

### Root cause

**OBSERVED.** The API never accepts the field, at two independent layers:

1. `api/src/server/modules/aggregatorRoutes.ts` lines 1303-1329 — the PUT handler
   destructures a fixed allow-list from `req.body`. It includes `publicToken` (line 1315).
   It does **not** include `publicContentRef`. The field is discarded before any logic runs.
2. `api/src/server/modules/aggregatorMetadataServiceDB.ts` lines 1755-1782 — the
   `updateMetadata` `updates` parameter type declares `publicToken` (line 1774) and has **no
   `publicContentRef` member at all**.

Consequently `initialMetadata` (lines 1474-1502) spreads `...(publicToken && { publicToken })`
at line 1483 with no ref, and the same omission repeats in `minimalMetadata` (1587-1614) and
`submitMetadata` (2814).

**OBSERVED.** Repository-wide, `publicContentRef` appears in `api/src` only in
`publicContentRoutes.ts`, `publicBlobAccess.ts`, and `aggregatorRoutes.ts` lines 299/303/306
— the POST guard and its error text. **It is never persisted by any PUT.**

**OBSERVED.** The guard that exists for exactly this shape lives in
`app.post('/api/aggregator/metadata-index')` (line 245, check at line 303). Every browser
write path uses `PUT /:fileId` via `uploadProcessor.createMetadata` (line 859), so the guard
never executes. The PUT route accepts the half-written row it just created itself.

**OBSERVED.** The client is correct. `publicShareFields`
(`uploadProcessor.ts:27-42`) is all-or-nothing, `publishPublicShare` returns both fields or
throws, and the thought path spreads `...shareFields` atomically at line 478.

**Repair note — OBSERVED.** Companion metadata (`companionMetadataSheets.ts`), the declared
source of truth, also never stores `publicContentRef`. No resync or reconcile can restore it.
It exists only in the `ensure-public` response, in browser memory, and in the request body
that PUT discards. Existing broken rows must be re-published, not repaired.

### Exposure: other ways a public row can lack share material

**OBSERVED.**

| Path | Defect |
|---|---|
| `backgroundTaskProcessor.ts:417` (`processMetadataUpdate`, reached from `EditFileModal`) | Copies `isPublic` straight into the PUT body. No share-token generation, no `publishPublicShare`, no guard. Flipping private→public here yields a row with **neither** field. Independent second bug |
| `collectionService.ts:136` | Defaults `isPublic` to `true` (`metadata?.isPublic ?? true`), and the generation `try/catch` at 83-94 only logs, so line 157 can send `isPublic: true` with both fields undefined |
| `uploadProcessor.ts` swallowed catches at 163, 199, 236, 438 | `publicShareFields` returns `{}` when generation is undefined, so the write proceeds with `isPublic` unchanged and no share fields. Line 438 is the thought-thumbnail path and has no warning at all. Sites 587, 618, 670 cannot emit a public row |
| `userStorageSyncService.ts:59, :83` → `bulkUpsertMetadata` | Hardcodes `isPublic: true` for portable-backend files with no token and no ref, bypassing all route validation |
| `aggregatorMetadataServiceDB.ts:2230-2231` | `COALESCE(..., 'true'::jsonb)` defaults an absent `isPublic` to **true** |
| `dmcaTakedownService.ts:61` | Restores `isPublic: true` after a takedown with no ref validation |
| `saveShareSettings.ts:129-139` (dashboard) | PUTs to `/api/aggregator/metadata-index` with no `:fileId` segment; no such route is registered. **INFERRED** to 404 — not runtime-verified |
| POST guard itself (line 303) | Conditional on `publicToken` being truthy. A body with `isPublic: true` and no token passes |

---

## Bug C: the spinner never stops

**OBSERVED.** `fetchPublicEnvelope`
(`packages/aggregator-domain/src/publicContentClient.ts:124-127`) throws on any non-2xx and
does not distinguish a permanent 409 from a transient failure.

The stuck state is the **absence of a map key**, not a stale flag. `DiscoveryPage.tsx`
(spinner at line 876) and `FullScreenFeed.tsx` (spinners at 2224 and 2291, `thumbnails` state
at line 136) both render purely on `thumbnails.get(fileId)` being `undefined`, and neither
component has any failure or error set that a `catch` could populate.

`DiscoveryPage` additionally retries forever: `processedThumbnailsRef.current.add(fileId)`
(line 158) sits *inside* the `try`, after the decrypt, so a failing file is never marked
processed and is re-selected on every state change.

`CollectionFeed` (`error` map, `finally` at 357-364) and `HorizontalThumbnailFeed`
(`failedThumbnailsRef`, `finally` at 219-221) already implement the correct pattern.
`HomePage` degrades to a placeholder rather than spinning.

Minor leak, **OBSERVED**: `FullScreenFeed.tsx:1475-1478` clears
`loadingCollectionThumbnailsRef` but not `loadingStartTimesRef`; the 15s sweeper at 151-173
covers it.

---

## Corrections, ordered by user-visible impact

1. **Accept and persist `publicContentRef` on PUT.** Add it to the destructure
   (`aggregatorRoutes.ts:1303-1329`), to `initialMetadata`, `minimalMetadata` and the
   `updateMetadata` call, and to the `updates` type
   (`aggregatorMetadataServiceDB.ts:1757-1782`). Without this, every public post is
   unreadable. Existing broken rows need re-publishing; they cannot be repaired from
   companion metadata.
2. **Move the public-row guard so it covers every writer**, not just POST, and make it fire on
   `isPublic === true` regardless of whether `publicToken` is present.
3. **Give the two feed components a failure state** so a permanent 4xx renders an error
   instead of a spinner, and move `processedThumbnailsRef.add` into a `finally` so
   `DiscoveryPage` stops retrying a permanently-409 endpoint.
4. **Make `GoogleDriveBackend` check-then-mint.** Route all 14 call sites through the
   canonical resolver, delete the parallel refresh implementation, remove the 55-minute
   expiry invention, clear `this.token` when it is known dead, and remove or validate
   `getAccessToken()`.
5. **Close the remaining Drive-token bypasses**: `GoogleDriveMetadataService`,
   `FeedGoogleDriveService`, the `__attemptGoogleDrive401Recovery` hook, and the
   API-401→direct-Drive fallback in `useDriveFileDeletion`.
6. **Fix `processMetadataUpdate`** so the edit modal cannot set `isPublic: true` without
   materializing share material, and fix the `collectionService` default-to-public.
7. **Replace the swallowed catches** in `uploadProcessor.ts` (163, 199, 236, 438) with
   failures that surface, so a publish cannot half-succeed.
8. **Replace the freshness ratchet with a structural check** and prove it fails on a synthetic
   violation before trusting it.

## What was not observed

- Bug A's 401/409 were never reproduced live; a cold unlock was clean. The trigger condition
  (race vs. aged session) is inferred from code and from the user's original stack trace.
- The proposed ratchet has not been proven to fail on a synthetic violation.
- `saveShareSettings.ts:129-139` returning 404 is inferred, not executed.

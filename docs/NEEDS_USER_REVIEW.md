# NEEDS_USER_REVIEW

Parked items — **do not delete or reclassify until you answer.**

Generated 2026-09-09.

---

### developer.identity_sdk_note
- **Observed:** Session stack note (identity-sdk)
- **Source:** PortalContext.tsx → @identity-protocol/identity-sdk
- **Notes:** Unlock REAL via OAuth; PortalContext still depends on identity-sdk → identity-core
- **Question:** Keep developer portal on `@identity-protocol/identity-sdk` until migrated to `@par-noir/*`, or schedule rebuild now?
- **Options:** KEEP_SCAFFOLD | NEEDS_CURRENT_STACK rebuild ticket | other

### messaging.inbox.tabs (no API on tab click alone)
- **Observed (2026-09-09 code path):** Dual-pN Connect via `?creator=` works (POST request 200). B Accept blocked while messaging origin lacks cloud AT. Race fix + vault publish hard-fail + banner `pn-cloud-credentials-ready` listen are in tree; **not on prod until deploy**.
- **Ops blocker (cannot fix in code):** Google Cloud Console must authorize redirect `https://messaging.parnoir.com/oauth-callback.html` (see [OAUTH_AND_PRODUCTION_ROLLOUT_CHECKLIST.md](./ops/OAUTH_AND_PRODUCTION_ROLLOUT_CHECKLIST.md) §6b).
- **Question:** Deploy aggregator-browser (browse + messaging) + register messaging Google redirect, then re-run Accept → DM → outbox?
- **Options:** deploy + Google Console redirect | hold

### messaging.cloud_reconnect_on_device (test-pn-2)
- **Observed:** Banner linkedInactive on messaging; panel briefly opens then closes (markReady-before-AT race — **fixed in tree**). Authorize click works; Google returns **redirect_uri_mismatch** for messaging oauth-callback until Console is updated. Browse often hydrates OK without banner.
- **Question:** After deploy + Console redirect, confirm messaging unlock hydrates vault (no banner) without Google reconnect?
- **Options:** deploy now | hold

### Unused same-name UI (KEEP until canonical chosen)

- `apps/aggregator-browser/src/components/CollectionFeed.tsx`
- `apps/aggregator-browser/src/components/ContextSwitcher.tsx`
- `apps/aggregator-browser/src/components/EmojiPicker.tsx`
- `apps/aggregator-browser/src/components/FeedNavBar.tsx`
- `apps/aggregator-browser/src/components/HorizontalThumbnailFeed.tsx`
- `apps/aggregator-browser/src/components/MediaViewer.tsx`
- `apps/id-dashboard/src/components/lazy/DeveloperPortalLazy.tsx`
- `apps/id-dashboard/src/components/lazy/LicenseModalLazy.tsx`
- `apps/id-dashboard/src/pages/DeveloperPortal.tsx`
- **Question:** Which file is canonical per feature? Delete duplicates only after you pick.

### Static orphan scan (zero basename importers — not proof dead)
- **Question:** KEEP_SCAFFOLD vs SAFE_DELETE for each?

- `apps/aggregator-browser/src/components/file/createVideoThumbnail.ts`
- `apps/aggregator-browser/src/hooks/useDriveFiles.ts`
- `apps/aggregator-browser/src/hooks/useMobile.ts`
- `apps/aggregator-browser/src/hooks/useSwipeGesture.ts`
- `apps/aggregator-browser/src/services/backgroundTaskProcessor.ts`
- `apps/aggregator-browser/src/services/textPostService.ts`
- `apps/aggregator-browser/src/services/uploadNotificationService.ts`
- `apps/aggregator-browser/src/services/uploadProcessor.ts`
- `apps/aggregator-browser/src/utils/mePageCoverGenerator.ts`
- `apps/aggregator-browser/src/utils/volumeIdGenerator.ts`
- `apps/aggregator-browser/src/vite-env.d.ts`
- `apps/aggregator-browser/src/workers/thumbnail.worker.ts`
- `apps/aggregator-browser/src/workers/upload.worker.ts`
- `apps/developer-portal/src/vite-env.d.ts`
- `apps/id-dashboard/src/__tests__/setup.ts`
- `apps/id-dashboard/src/components/DashboardDropdown.tsx`
- `apps/id-dashboard/src/components/IdentitySuccessionPanel.tsx`
- `apps/id-dashboard/src/components/IntegratorTile.tsx`
- `apps/id-dashboard/src/components/LazyLoader.tsx`
- `apps/id-dashboard/src/components/NicknameEditor.tsx`

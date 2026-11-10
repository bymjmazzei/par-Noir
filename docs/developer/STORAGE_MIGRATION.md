# Storage migration

Social cloud migration, multi-account connect, and cross-cloud file moves. All of it runs on the owner's device; the API never reads or writes a user's cloud.

## Multi-account per provider

Each connected account has a canonical id: `{prefix}::{pn}::{slug}` (e.g. `s3::pn-abc123::my-bucket`).

- Connect additional accounts via **Additional Cloud Providers** without disconnecting others.
- `PUT /api/storage/credentials/:pn/provider` upserts the layout shell by `accountId` (no secrets).
- `DELETE /api/storage/credentials/:pn/provider/:provider/:accountId` removes one account.

## Social cloud migration

`SocialCloudMigrationWizard` (dashboard) runs the move on the device:

1. `openSocialCloudMove` (`@par-noir/device-cloud-credentials`) opens the current social cloud and lays out the new one (`initializeDevicePortableLayout` or `ensureDeviceDriveLayout`).
2. `migrateSocialCloudOnDevice` copies the data and reports one item per data set or blob.
3. Only when nothing failed: `PUT /api/storage/credentials/:pn/social-cloud` with `migrated: true`, then the new layout is recorded (`POST /api/storage/layout/:pn` for portable, `POST /api/storage/initialize/:pn` with `pnDriveIndex` for Google).

| From | To | Strategy |
|------|-----|----------|
| portable A | portable B | Copy every blob under the layout root (full parity) |
| Google Drive | portable | Social stores: connections, groups, inbox, DM and group history, message requests, owner/public file index, followers, following, notifications |
| portable | Google Drive | Social stores: connections, groups, inbox, DM history, message requests, owner/public file index |

Not carried between Google and portable (listed in the wizard before confirming): `SOCIAL_MIGRATION_NOT_CARRIED` — ledgers, engagement, per-content-class indexes, companion/integrator metadata, profile and preferences. Portable → Google also skips group history, followers and notifications.

**409 semantics:** `PUT .../social-cloud` without `migrated: true` returns `migration_required` for any provider change.

Encrypted **file blobs** on other backends stay where they are.

## File migration

`moveOwnedFilesOnDevice` moves encrypted blobs between connected non-Google backends and repoints the owner and public index rows on the social cloud. Dashboard: select files in bulk mode → **Move to cloud**.

## Testing

- `packages/device-cloud-credentials`: `migrateSocialCloud.test.ts`, `moveOwnedFiles.test.ts`.
- Social cloud change without `migrated: true` returns `migration_required` (409): `api/src/server/modules/storage/storageRoutes.test.ts`.

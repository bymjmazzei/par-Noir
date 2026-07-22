# Social cloud parity checklist

Every social feature must work when `socialCloudProvider` is portable (Dropbox, S3, Azure, OneDrive, FTP). Google Sheets is only allowed behind the Google `DelegateTableAdapter` / Drive init — not from HTTP routes or domain services once Phase 3 is complete.

| Feature | Facade entry | Must not require Sheets at call site |
|---------|--------------|--------------------------------------|
| Owner / public file indexes | `IndexStorageService` → `openTable` / index portable | No direct `IndexSheetsService` from routes |
| Companion metadata | `companionMetadataService` (portable JSON + Google Sheets adapter) | No Sheets-only create/update |
| Connections | `ConnectionsService` | No direct `ConnectionsSheetsService` CRUD from routes |
| Followers / following | `socialGraph` via facade | — |
| Groups | `group` via facade | — |
| Messaging inbox / conversations | `MessageSheetsService` branch → portable / facade | Attachments via blob backends |
| Engagement | `EngagementDriveService` → portable engagement | No `googleDriveAccounts` gate |
| Notifications (+ prefs) | `notificationService` | Portable prefs JSON/table |
| Activity / messaging / prism ledgers | ledger services → `openTable` | Segmented later for scale |
| Preferences | `preferencesService` | — |
| ZKP data points | `zkpDataPointsService` | — |
| Third-party permissions | `thirdPartyPermissionsService` | OAuth lookup via service, not Sheets |
| Devices | `deviceStorageService` | — |
| Recovery | `recoverySheetsService` / portable | — |
| Feed subscribers | `CreatorSubscriberStorage` | — |
| Platform registry | social-cloud facade (operator pN) | Not Sheets-only |

## Import rule

`api/src/server.ts` and route modules must not import `*SheetsService` except during migration; prefer facades. CI: `scripts/check-sheets-import-boundary.sh`.

## Migration

Companion metadata and feed subscribers are migrated by transformers in `packages/storage-migration` (see `STORAGE_MIGRATION.md`).

# Cloud-agnostic verification checklist

Manual / automated checks for social-cloud parity (no Google required).

## Automated

```bash
# Table + segment contract tests
cd packages/user-owned-storage && npm test -- --run

# Sheets import boundary (soft warn until routes fully collapsed)
./scripts/check-sheets-import-boundary.sh

# API typecheck
cd api && npx tsc --noEmit -p tsconfig.json
```

## Manual zero-Google path

1. Create / unlock identity
2. Connect only Dropbox or S3 as social cloud (Secure Cloud panel)
3. Upload a file → companion metadata created (portable JSON)
4. Toggle public → index via IndexStorageService
5. Appear in aggregator after sync
6. Like / comment from another account → engagement + companion update
7. Send DM with attachment → blob on social cloud
8. Notification preferences update persists

## Manual Drive → portable migration

1. User with Google social cloud
2. Connect portable provider
3. Run SocialCloudMigrationWizard → complete
4. Repeat core flows above without Google account

## Regression

- Existing Google Drive users: Sheets adapter still serves tables
- Platform registry works with operator on portable or Google

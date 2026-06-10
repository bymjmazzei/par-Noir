# Azure Blob Storage setup

## 1. Create storage account + container

- Storage account with HTTPS-only enabled
- Private container (no anonymous public read)

## 2. SAS token scope

Create a container-level SAS with:

- Read, Write, List, Create, Delete
- HTTPS only
- Expiration aligned with your rotation policy

Scope to the `par-noir-*` prefix when possible.

## 3. Connect in dashboard

**Additional Cloud Providers → Azure Blob**

- Storage account name
- Container name
- SAS token (or connection string via API `azureBlob.connectionString`)

## 4. Rotation

Rotate SAS before expiry. Update credentials in dashboard (re-connect).

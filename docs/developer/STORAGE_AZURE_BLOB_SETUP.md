# Azure Blob Storage setup

## 1. Create storage account + container

- Storage account with HTTPS-only enabled
- Private container (no anonymous public read)

## 2. SAS token (required)

Container-level SAS only — **connection strings are rejected**.

Permissions: Read, Write, List, Create, Delete; HTTPS only.

Prefer scoping to the `par-noir-{pn}/` prefix when your tooling supports directory SAS.

## 3. Connect in dashboard

**Additional Cloud Providers → Azure Blob**

- Storage account name
- Container name
- SAS token (required)
- Blob prefix (required; defaults to `par-noir-{pn}`)

## 4. Rotation

Rotate SAS before expiry. Re-connect in dashboard.

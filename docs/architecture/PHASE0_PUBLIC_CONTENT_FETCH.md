# Phase 0 — Anonymous public ciphertext fetch (falsification)

**Date:** 2026-08-08  
**Hypothesis:** Public ciphertext can be downloaded without **owner** OAuth.

## Observations

| Probe | Result |
|-------|--------|
| `GET https://www.googleapis.com/drive/v3/files/{id}?alt=media` (no auth, no key) | **403** |
| Same URL with `&key=invalid` | **400** `API key not valid` — proves API-key path exists (not owner OAuth) |
| `https://drive.google.com/uc?export=download&id={id}` | **303** to `drive.usercontent.google.com` (OAuth-less URL shape) |
| Stale public sample file IDs | 404/500 — could not complete end-to-end body download without a live public binary |

## Locked strategy (not falsified for custody goals)

- Prefer `publicContentRef.publicUrl` (uc download / provider shared link) with **no** Authorization header.
- Drive fallback: platform env `GOOGLE_DRIVE_API_KEY` / `GOOGLE_API_KEY` on `alt=media` — **not** `resolveOwnerDriveToken` for another user.
- Pure zero-credential Drive **API** without key is **falsified** (403). Platform API key remains custody-aligned.

## Inferred (not observed on a live owned file)

Binary `uc?export=download` bodies work for anyone-reader uploaded binaries in Google’s documented model; confirm on first make-public integration test with `GOOGLE_DRIVE_API_KEY` set in API env.

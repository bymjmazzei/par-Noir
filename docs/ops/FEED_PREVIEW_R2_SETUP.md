# Feed preview R2 setup (platform CDN)

Platform-operated Cloudflare R2 for **warm** feed posters / SD / HD. Distinct from [user-owned R2](../../apps/id-dashboard/docs/CLOUDFLARE_R2_SETUP.md).

## Bucket

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **R2 Object Storage** → **Create bucket**.
2. Name: `pn-feed-previews` (prod), optional `pn-feed-previews-dev`.
3. Location: Automatic. Keep the bucket **private** (presigned access only).

## API token

1. R2 → **Manage R2 API Tokens**.
2. Token with **Object Read & Write** on `pn-feed-previews` only.
3. Save Access Key ID, Secret Access Key, Account ID, endpoint  
   `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.

## Custom domain (prod)

Bucket → **Settings** → **Custom Domains** → e.g. `feed-media.parnoir.com`.

## Railway / API env

```bash
FEED_R2_ACCOUNT_ID=
FEED_R2_ACCESS_KEY_ID=
FEED_R2_SECRET_ACCESS_KEY=
FEED_R2_BUCKET=pn-feed-previews
FEED_R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
FEED_R2_PUBLIC_HOST=https://feed-media.parnoir.com
FEED_R2_SIGNED_GET_TTL_SEC=300
FEED_R2_SD_HD_IDLE_EVICT_DAYS=30
FEED_FREE_DAILY_VIEW_STARTS=80
FEED_FREE_DAILY_MB=250
FEED_PREVIEW_SD_MAX_BYTES=4194304
FEED_PREVIEW_HD_MAX_BYTES=10485760
FEED_PREVIEW_POSTER_MAX_BYTES=204800
```

Fail closed for feed-media routes when R2 env is unset in production.

## Lifecycle

- **Poster + metadata:** stay hot while the post is public.
- **SD/HD:** evicted from R2 after `FEED_R2_SD_HD_IDLE_EVICT_DAYS` with no play; canonical plaintext previews remain on the owner’s cloud; API pull-through rehydrates on miss.

## CORS (required for browse `fetch` + blob)

Browse loads previews with `fetch(public-media)` then follows the **302** to the signed R2 URL and reads the body as a blob (metering headers on the API hop). The **final** R2 response must allow the browse origin:

1. R2 bucket → **Settings** → **CORS policy**
2. Allow origins: browse hosting origins (e.g. `https://browse.parnoir.com`, local Vite origins)
3. Methods: `GET`, `HEAD` (and `PUT` if uploading from the browser to presigned URLs)
4. Allowed headers: `*` or at least those used by signed requests
5. Expose headers as needed for Range (optional)

Without this, DevTools shows a CORS failure on `*.r2.cloudflarestorage.com` after a successful API 302.

## Rotate tokens

1. Create a new R2 token with the same scope.
2. Update Railway env; redeploy API.
3. Revoke the old token after health checks pass.

## Local / staging

Use MinIO or `pn-feed-previews-dev` with the same env shape. Unit tests mock the S3-compatible client.

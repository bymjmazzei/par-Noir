/**
 * Platform Cloudflare R2 client for feed preview warm CDN (S3-compatible).
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  FEED_PREVIEW_HD_MAX_BYTES,
  FEED_PREVIEW_POSTER_MAX_BYTES,
  FEED_PREVIEW_SD_MAX_BYTES,
  FEED_R2_SD_HD_IDLE_EVICT_DAYS,
  type FeedPreviewVariant,
  maxBytesForVariant,
} from '@par-noir/aggregator-domain';

export type FeedR2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
  publicHost?: string;
  signedGetTtlSec: number;
  idleEvictDays: number;
};

let cached: { config: FeedR2Config; client: S3Client } | null = null;

export function readFeedR2ConfigFromEnv(): FeedR2Config | null {
  const accessKeyId = process.env.FEED_R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.FEED_R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.FEED_R2_BUCKET?.trim();
  const endpoint = process.env.FEED_R2_ENDPOINT?.trim();
  const accountId = process.env.FEED_R2_ACCOUNT_ID?.trim() || '';
  if (!accessKeyId || !secretAccessKey || !bucket || !endpoint) {
    return null;
  }
  const ttl = Number(process.env.FEED_R2_SIGNED_GET_TTL_SEC || 300);
  const idle = Number(process.env.FEED_R2_SD_HD_IDLE_EVICT_DAYS || FEED_R2_SD_HD_IDLE_EVICT_DAYS);
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint,
    publicHost: process.env.FEED_R2_PUBLIC_HOST?.trim() || undefined,
    signedGetTtlSec: Number.isFinite(ttl) && ttl > 0 ? ttl : 300,
    idleEvictDays: Number.isFinite(idle) && idle > 0 ? idle : FEED_R2_SD_HD_IDLE_EVICT_DAYS,
  };
}

export function getFeedR2(): { config: FeedR2Config; client: S3Client } | null {
  const config = readFeedR2ConfigFromEnv();
  if (!config) {
    cached = null;
    return null;
  }
  if (
    cached &&
    cached.config.accessKeyId === config.accessKeyId &&
    cached.config.bucket === config.bucket &&
    cached.config.endpoint === config.endpoint
  ) {
    return cached;
  }
  const client = new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  cached = { config, client };
  return cached;
}

export function feedPreviewEnvMaxBytes(variant: FeedPreviewVariant): number {
  if (variant === 'poster') {
    const n = Number(process.env.FEED_PREVIEW_POSTER_MAX_BYTES);
    return Number.isFinite(n) && n > 0 ? n : FEED_PREVIEW_POSTER_MAX_BYTES;
  }
  if (variant === 'hd') {
    const n = Number(process.env.FEED_PREVIEW_HD_MAX_BYTES);
    return Number.isFinite(n) && n > 0 ? n : FEED_PREVIEW_HD_MAX_BYTES;
  }
  const n = Number(process.env.FEED_PREVIEW_SD_MAX_BYTES);
  return Number.isFinite(n) && n > 0 ? n : FEED_PREVIEW_SD_MAX_BYTES;
}

export async function feedR2Put(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<void> {
  const r2 = getFeedR2();
  if (!r2) throw new Error('feed_r2_not_configured');
  await r2.client.send(
    new PutObjectCommand({
      Bucket: r2.config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function feedR2Head(key: string): Promise<{ size: number } | null> {
  const r2 = getFeedR2();
  if (!r2) return null;
  try {
    const out = await r2.client.send(
      new HeadObjectCommand({ Bucket: r2.config.bucket, Key: key })
    );
    return { size: out.ContentLength ?? 0 };
  } catch (err: unknown) {
    const name = (err as { name?: string }).name;
    if (name === 'NotFound' || name === 'NoSuchKey') return null;
    throw err;
  }
}

export async function feedR2Delete(key: string): Promise<void> {
  const r2 = getFeedR2();
  if (!r2) return;
  await r2.client.send(
    new DeleteObjectCommand({ Bucket: r2.config.bucket, Key: key })
  );
}

export async function feedR2GetBytes(key: string): Promise<Buffer | null> {
  const r2 = getFeedR2();
  if (!r2) return null;
  try {
    const out = await r2.client.send(
      new GetObjectCommand({ Bucket: r2.config.bucket, Key: key })
    );
    const bytes = await out.Body?.transformToByteArray();
    return bytes ? Buffer.from(bytes) : null;
  } catch (err: unknown) {
    const name = (err as { name?: string }).name;
    if (name === 'NoSuchKey' || name === 'NotFound') return null;
    throw err;
  }
}

export async function feedR2SignedGetUrl(key: string): Promise<string> {
  const r2 = getFeedR2();
  if (!r2) throw new Error('feed_r2_not_configured');
  const cmd = new GetObjectCommand({ Bucket: r2.config.bucket, Key: key });
  return getSignedUrl(r2.client, cmd, { expiresIn: r2.config.signedGetTtlSec });
}

export async function feedR2PresignedPutUrl(
  key: string,
  contentType: string,
  contentLength: number,
  variant: FeedPreviewVariant
): Promise<{ url: string; maxBytes: number }> {
  const r2 = getFeedR2();
  if (!r2) throw new Error('feed_r2_not_configured');
  const maxBytes = Math.min(feedPreviewEnvMaxBytes(variant), maxBytesForVariant(variant));
  if (contentLength > maxBytes) {
    throw new Error('content_length_exceeds_variant_max');
  }
  const cmd = new PutObjectCommand({
    Bucket: r2.config.bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  });
  const url = await getSignedUrl(r2.client, cmd, { expiresIn: r2.config.signedGetTtlSec });
  return { url, maxBytes };
}

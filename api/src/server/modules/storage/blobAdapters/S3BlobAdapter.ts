import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import type { BlobStore } from '@par-noir/user-owned-storage';
import type { BlobEntry, BlobHead, PutOptions, PutResult } from '@par-noir/user-owned-storage';

export class S3BlobAdapter implements BlobStore {
  readonly providerId = 'aws_s3';
  private client: S3Client;
  private bucket: string;
  private keyPrefix: string;

  constructor(params: {
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    prefix?: string;
  }) {
    this.bucket = params.bucket;
    this.keyPrefix = params.prefix ? (params.prefix.endsWith('/') ? params.prefix : `${params.prefix}/`) : '';
    this.client = new S3Client({
      region: params.region,
      credentials: {
        accessKeyId: params.accessKeyId,
        secretAccessKey: params.secretAccessKey
      }
    });
  }

  private fullKey(key: string): string {
    const k = key.startsWith('/') ? key.slice(1) : key;
    return `${this.keyPrefix}${k}`;
  }

  async put(key: string, data: Uint8Array | Buffer, options?: PutOptions): Promise<PutResult> {
    const fullKey = this.fullKey(key);
    const result = await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: fullKey,
        Body: data,
        ContentType: options?.contentType
      })
    );
    return { etag: result.ETag?.replace(/"/g, ''), version: result.ETag?.replace(/"/g, '') };
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.fullKey(key) })
      );
      const bytes = await result.Body?.transformToByteArray();
      return bytes ?? null;
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'NoSuchKey') return null;
      throw err;
    }
  }

  async head(key: string): Promise<BlobHead | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: this.fullKey(key) })
      );
      return {
        etag: result.ETag?.replace(/"/g, ''),
        version: result.VersionId,
        size: result.ContentLength ?? 0,
        lastModified: result.LastModified?.toISOString()
      };
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'NotFound') return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.fullKey(key) })
    );
  }

  async list(prefix: string): Promise<BlobEntry[]> {
    const fullPrefix = this.fullKey(prefix);
    const entries: BlobEntry[] = [];
    let token: string | undefined;
    do {
      const result = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: fullPrefix,
          ContinuationToken: token
        })
      );
      for (const obj of result.Contents ?? []) {
        if (!obj.Key) continue;
        const relative = obj.Key.startsWith(this.keyPrefix)
          ? obj.Key.slice(this.keyPrefix.length)
          : obj.Key;
        entries.push({
          key: relative,
          size: obj.Size ?? 0,
          lastModified: obj.LastModified?.toISOString()
        });
      }
      token = result.NextContinuationToken;
    } while (token);
    return entries;
  }

  async mkdir(_path: string): Promise<void> {
    // S3 has no real directories; prefix implied by keys
  }
}

import { BlobServiceClient } from '@azure/storage-blob';
import type { BlobStore } from '@par-noir/user-owned-storage';
import type { BlobEntry, BlobHead, PutOptions, PutResult } from '@par-noir/user-owned-storage';

export class AzureBlobAdapter implements BlobStore {
  readonly providerId = 'azure_blob';
  private containerClient: ReturnType<BlobServiceClient['getContainerClient']>;
  private keyPrefix: string;

  constructor(params: {
    accountName: string;
    container: string;
    sasToken?: string;
    connectionString?: string;
    prefix?: string;
  }) {
    let service: BlobServiceClient;
    if (params.connectionString) {
      service = BlobServiceClient.fromConnectionString(params.connectionString);
    } else if (params.sasToken) {
      const url = `https://${params.accountName}.blob.core.windows.net?${params.sasToken.replace(/^\?/, '')}`;
      service = new BlobServiceClient(url);
    } else {
      throw new Error('Azure Blob requires sasToken or connectionString');
    }
    this.containerClient = service.getContainerClient(params.container);
    this.keyPrefix = params.prefix ? (params.prefix.endsWith('/') ? params.prefix : `${params.prefix}/`) : '';
  }

  private fullKey(key: string): string {
    const k = key.startsWith('/') ? key.slice(1) : key;
    return `${this.keyPrefix}${k}`;
  }

  async put(key: string, data: Uint8Array | Buffer, options?: PutOptions): Promise<PutResult> {
    const blob = this.containerClient.getBlockBlobClient(this.fullKey(key));
    if (options?.ifMatch) {
      const props = await blob.getProperties().catch(() => null);
      if (props?.etag && props.etag !== options.ifMatch) {
        throw new Error('Azure blob etag mismatch');
      }
    }
    const result = await blob.uploadData(data, {
      blobHTTPHeaders: options?.contentType
        ? { blobContentType: options.contentType }
        : undefined
    });
    return {
      etag: result.etag,
      version: result.versionId
    };
  }

  async get(key: string): Promise<Uint8Array | null> {
    const blob = this.containerClient.getBlockBlobClient(this.fullKey(key));
    try {
      const dl = await blob.download();
      const bytes = dl.readableStreamBody
        ? await streamToBytes(dl.readableStreamBody)
        : null;
      return bytes;
    } catch (err: unknown) {
      if ((err as { statusCode?: number }).statusCode === 404) return null;
      throw err;
    }
  }

  async head(key: string): Promise<BlobHead | null> {
    const blob = this.containerClient.getBlockBlobClient(this.fullKey(key));
    try {
      const props = await blob.getProperties();
      return {
        etag: props.etag,
        version: props.versionId,
        size: props.contentLength ?? 0,
        lastModified: props.lastModified?.toISOString()
      };
    } catch (err: unknown) {
      if ((err as { statusCode?: number }).statusCode === 404) return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await this.containerClient.deleteBlob(this.fullKey(key));
  }

  async list(prefix: string): Promise<BlobEntry[]> {
    const entries: BlobEntry[] = [];
    const fullPrefix = this.fullKey(prefix);
    for await (const item of this.containerClient.listBlobsFlat({ prefix: fullPrefix })) {
      const relative = item.name.startsWith(this.keyPrefix)
        ? item.name.slice(this.keyPrefix.length)
        : item.name;
      entries.push({
        key: relative,
        size: item.properties.contentLength ?? 0,
        lastModified: item.properties.lastModified?.toISOString()
      });
    }
    return entries;
  }

  async mkdir(_path: string): Promise<void> {
    // virtual folders
  }
}

async function streamToBytes(stream: NodeJS.ReadableStream): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array | string>) {
    chunks.push(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array | string)
    );
  }
  return new Uint8Array(Buffer.concat(chunks));
}

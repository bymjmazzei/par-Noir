/**
 * Dashboard adapter for @par-noir/owner-files.
 * Drive bytes go device-direct through the registered storage backends; owner API calls
 * use the par Noir OAuth JWT. The device owner index comes from the device sheet
 * (an empty sheet means "scan Drive"), never from GET /api/storage/owner-index.
 */
import { decryptPrivateFileBlob } from '@par-noir/identity-crypto';
import {
  isAllowedFeedMediaSignedUrl,
  penDocUrl,
  publicMediaPath,
  type DriveListing,
  type OwnerAccount,
  type OwnerFileRow,
  type OwnerFilesTransport,
  type OwnerIndexEntry,
} from '@par-noir/owner-files';
import type { FileAggregatorService } from './aggregator/FileAggregatorService';
import { GoogleDriveBackend } from './storage/GoogleDriveBackend';
import { fetchOwnerIndex } from '../components/storage/hooks/loadFiles/fetchOwnerIndex';
import { ownerGet } from './ownerApiService';
import type { AggregatedFile, PublicMetadata, ShareToken } from '../types/aggregator';

export interface DashboardOwnerFilesDeps {
  aggregatorService: FileAggregatorService;
  /** Canonical pN identifier (from the unlocked public key). */
  pnIdentifier: string;
  resolveOwnerApiToken: (wantedPn?: string | null) => string | null;
  ownerKey: () => { id: string; publicKey: string } | null;
  shareTokenCache: Map<string, ShareToken>;
  makeShareTokenCacheKey: (backendId: string, backendFileId: string) => string;
}

type IndexSheetEntry = Record<string, any>;

function pnWithPrefix(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

function schemaFileType(mime: string | undefined): PublicMetadata['fileType'] {
  if (mime?.startsWith('image/')) return 'image';
  if (mime?.startsWith('video/')) return 'video';
  if (mime?.startsWith('audio/')) return 'audio';
  return 'document';
}

/** Sheet row → index entry with the PublicMetadata the share / edit flows read. */
function indexEntryFromSheet(account: OwnerAccount, entry: IndexSheetEntry): OwnerIndexEntry {
  const driveFileId = entry.googleDriveFileId || entry.backendFileId;
  const fileId = entry.fileId || driveFileId || `${account.accountKey}:${entry.fileName}`;
  const name = entry.originalName || entry.fileName || 'Untitled';
  const publicToken =
    typeof entry.publicToken === 'string'
      ? entry.publicToken
      : entry.publicToken
        ? JSON.stringify(entry.publicToken)
        : undefined;
  const metadata = {
    fileId,
    backend: account.accountKey,
    backendFileId: driveFileId,
    name,
    description: entry.description || '',
    keywords: entry.tags || [],
    uploadDate: entry.uploadedAt,
    fileType: schemaFileType(entry.mimeType),
    isPublic: entry.visibility === 'public',
    thumbnail: entry.thumbnail,
    publicToken,
    engagement: entry.engagement,
    inReplyTo: entry.inReplyTo,
    repostOf: entry.repostOf,
    isPartOf: entry.isPartOf,
  } as Record<string, unknown>;
  return {
    fileId: entry.fileId,
    fileName: entry.fileName,
    originalName: entry.originalName,
    mimeType: entry.mimeType,
    size: typeof entry.size === 'number' ? entry.size : Number(entry.size || 0),
    uploadedAt: entry.uploadedAt,
    backendFileId: entry.backendFileId,
    googleDriveFileId: entry.googleDriveFileId,
    visibility: entry.visibility,
    metadata,
  };
}

export function createDashboardOwnerFilesTransport(deps: DashboardOwnerFilesDeps): OwnerFilesTransport {
  const pn = pnWithPrefix(deps.pnIdentifier);
  const signedUrls = new Map<string, string>();

  const ownerToken = (): string => {
    const token = deps.resolveOwnerApiToken(pn);
    if (!token) throw new Error('par Noir API session not ready — unlock again and retry');
    return token;
  };

  return {
    listDriveFiles: async (account): Promise<DriveListing[]> => {
      const backend = deps.aggregatorService.getBackend(account.accountKey);
      if (!backend?.isConnected()) throw new Error(`Storage account not connected: ${account.accountKey}`);
      return backend instanceof GoogleDriveBackend
        ? backend.listOwnerFiles(deps.pnIdentifier)
        : backend.listFiles(undefined, deps.pnIdentifier);
    },

    fetchOwnerIndex: async (account) => {
      const { ownerIndex } = await fetchOwnerIndex({
        backendId: account.accountKey,
        currentPnIdentifier: deps.pnIdentifier,
        resolveOwnerApiToken: deps.resolveOwnerApiToken,
      });
      const entries = (ownerIndex?.files || []) as IndexSheetEntry[];
      if (!entries.length) return null;
      for (const entry of entries) {
        if (!entry.publicToken) continue;
        try {
          const shareToken =
            typeof entry.publicToken === 'string' ? JSON.parse(entry.publicToken) : entry.publicToken;
          deps.shareTokenCache.set(
            deps.makeShareTokenCacheKey(account.accountKey, entry.googleDriveFileId || entry.backendFileId),
            shareToken
          );
        } catch {
          /* unparseable token: share settings regenerate it */
        }
      }
      return entries.map((entry) => indexEntryFromSheet(account, entry));
    },

    fetchOwnerCatalog: async () => {
      const res = await ownerGet(ownerToken(), '/api/aggregator/owner-catalog?limit=500', { pnIdentifier: pn });
      if (!res.ok) throw new Error(`owner_catalog_${res.status}`);
      const data = (await res.json()) as { files?: Array<{ fileId?: string; metadata?: Record<string, unknown> }> };
      return (data.files || [])
        .map((f) => ({ fileId: f.fileId || (f.metadata?.fileId as string) || '', metadata: f.metadata || {} }))
        .filter((f) => f.fileId);
    },

    fetchMetadata: async (fileId) => {
      const res = await ownerGet(ownerToken(), `/api/aggregator/metadata-index/${encodeURIComponent(fileId)}`, {
        pnIdentifier: pn,
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { metadata?: Record<string, unknown> } & Record<string, unknown>;
      return body.metadata || body;
    },

    downloadFile: ({ accountKey, driveFileId }) =>
      deps.aggregatorService.downloadFromBackend(accountKey, driveFileId),

    resolvePublicMediaUrl: async (fileId, variant) => {
      const cacheKey = `${fileId}|${variant}`;
      const hit = signedUrls.get(cacheKey);
      if (hit) return hit;
      const res = await ownerGet(ownerToken(), publicMediaPath(fileId, variant), { pnIdentifier: pn });
      if (!res.ok) throw new Error(`public_media_${res.status}`);
      const body = (await res.json()) as { url?: unknown };
      const url = typeof body.url === 'string' ? body.url : '';
      if (!url || !isAllowedFeedMediaSignedUrl(url)) throw new Error('public_media_bad_url');
      signedUrls.set(cacheKey, url);
      return url;
    },

    decryptPackage: async (pkg) => {
      const key = deps.ownerKey();
      if (!key) throw new Error('Please unlock your pN first to decrypt files');
      return (await decryptPrivateFileBlob(pkg, key)).decryptedBlob;
    },

    openInPen: (penDocId) => {
      window.open(penDocUrl(penDocId), '_blank', 'noopener,noreferrer');
    },
  };
}

/** The share / edit / delete hooks still speak AggregatedFile; this is their view of a row. */
export function ownerRowToAggregatedFile(row: OwnerFileRow): AggregatedFile {
  return {
    id: row.id,
    name: row.name,
    originalName: row.displayName,
    mimeType: row.mimeType || 'application/octet-stream',
    size: row.size,
    modifiedTime: row.modifiedTime,
    backend: row.accountKey,
    backendFileId: row.driveFileId || row.metadataIndexFileId || row.id,
    encrypted: row.encrypted,
    visibility: row.visibility,
    aggregatedAt: row.modifiedTime,
    catalogBacked: row.origin === 'catalog',
    metadataIndexFileId: row.metadataIndexFileId,
  } as AggregatedFile;
}

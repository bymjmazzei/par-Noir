/**
 * Canonical pN Drive layout: cached folder IDs and integrators/ root at init.
 */

import {
  INTEGRATORS_ROOT,
  normalizePnIdentifier,
  pnFolderDisplayName
} from './integratorStoragePaths';

export interface PnCachedFolderIds {
  pnFolderId?: string;
  metadataFolderId?: string;
  integratorsRootId?: string;
  messagesFolderId?: string;
  inboxSheetId?: string;
}

export function readCachedFolderIds(credentials: {
  cachedFolderIds?: unknown;
}): PnCachedFolderIds {
  const raw = credentials?.cachedFolderIds;
  if (!raw || typeof raw !== 'object') return {};
  const c = raw as Record<string, unknown>;
  const pick = (key: keyof PnCachedFolderIds): string | undefined => {
    const v = c[key];
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };
  return {
    pnFolderId: pick('pnFolderId'),
    metadataFolderId: pick('metadataFolderId'),
    integratorsRootId: pick('integratorsRootId'),
    messagesFolderId: pick('messagesFolderId'),
    inboxSheetId: pick('inboxSheetId')
  };
}

export function mergeCachedFolderIds(
  existing: PnCachedFolderIds | undefined,
  patch: Partial<PnCachedFolderIds>
): PnCachedFolderIds {
  return { ...(existing || {}), ...patch };
}

export async function loadCachedFolderIds(
  pnIdentifier: string
): Promise<PnCachedFolderIds | null> {
  const normalized = normalizePnIdentifier(pnIdentifier);
  const { storageCredentialsService } = await import('./storageCredentialsService');
  const record = await storageCredentialsService.getCredentials(normalized);
  if (!record?.credentials) return null;
  return readCachedFolderIds(record.credentials);
}

export async function persistCachedFolderIds(
  pnIdentifier: string,
  credentials: Record<string, unknown>,
  patch: Partial<PnCachedFolderIds>
): Promise<PnCachedFolderIds> {
  const normalized = normalizePnIdentifier(pnIdentifier);
  const merged = mergeCachedFolderIds(readCachedFolderIds(credentials), patch);
  credentials.cachedFolderIds = merged;
  const { storageCredentialsService } = await import('./storageCredentialsService');
  await storageCredentialsService.upsertCredentials(normalized, credentials);
  return merged;
}

async function driveFetch(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {})
    }
  });
}

function escapeDriveQueryName(name: string): string {
  return name.replace(/'/g, "\\'");
}

export async function findFolderByNameUnderParent(
  accessToken: string,
  name: string,
  parentId: string
): Promise<string | null> {
  const q = `name='${escapeDriveQueryName(name)}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await driveFetch(
    accessToken,
    `/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { files?: Array<{ id: string }> };
  return data.files?.[0]?.id ?? null;
}

export async function createFolderUnderParent(
  accessToken: string,
  name: string,
  parentId: string
): Promise<string> {
  const res = await driveFetch(accessToken, '/files', {
    method: 'POST',
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to create folder "${name}": ${res.status} ${text.slice(0, 200)}`);
  }
  const created = (await res.json()) as { id: string };
  return created.id;
}

export async function findOrCreateFolderUnderParent(
  accessToken: string,
  name: string,
  parentId: string
): Promise<string> {
  const existing = await findFolderByNameUnderParent(accessToken, name, parentId);
  if (existing) return existing;
  return createFolderUnderParent(accessToken, name, parentId);
}

/** Idempotent: ensure empty `integrators/` under the pN root (Drive setup). */
export async function initializeIntegratorsRoot(
  accessToken: string,
  pnFolderId: string
): Promise<string> {
  return findOrCreateFolderUnderParent(accessToken, INTEGRATORS_ROOT, pnFolderId);
}

export function hasCachedDriveLayout(
  cached: PnCachedFolderIds | undefined | null
): cached is PnCachedFolderIds & {
  pnFolderId: string;
  metadataFolderId: string;
  integratorsRootId: string;
} {
  return Boolean(
    cached?.pnFolderId && cached?.metadataFolderId && cached?.integratorsRootId
  );
}

export async function findPnRootFolderId(
  accessToken: string,
  pnIdentifier: string
): Promise<string | null> {
  const normalized = normalizePnIdentifier(pnIdentifier);
  const name = pnFolderDisplayName(normalized);
  const q = `name='${escapeDriveQueryName(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await driveFetch(
    accessToken,
    `/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { files?: Array<{ id: string }> };
  return data.files?.[0]?.id ?? null;
}

/**
 * After metadata folder exists: resolve pN root, create integrators/, merge cache.
 */
export async function ensureIntegratorsRootCached(
  accessToken: string,
  pnIdentifier: string,
  metadataFolderId: string,
  credentials: Record<string, unknown>,
  extra?: Partial<PnCachedFolderIds>
): Promise<PnCachedFolderIds> {
  const normalized = normalizePnIdentifier(pnIdentifier);
  const existing = readCachedFolderIds(credentials);
  let pnFolderId = existing.pnFolderId;
  if (!pnFolderId) {
    pnFolderId = await findPnRootFolderId(accessToken, normalized) ?? undefined;
  }
  if (!pnFolderId) {
    throw new Error('pN root folder not found after metadata initialization');
  }

  const integratorsRootId = await initializeIntegratorsRoot(accessToken, pnFolderId);
  return persistCachedFolderIds(normalized, credentials, {
    pnFolderId,
    metadataFolderId,
    integratorsRootId,
    ...extra
  });
}

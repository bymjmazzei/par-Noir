/**
 * Canonical pN Drive layout helpers (init-only folder discovery).
 * Runtime IDs live in pnDriveIndex — see pnDriveIndex.ts and ownerDriveContext.ts.
 */

import {
  INTEGRATORS_ROOT,
  normalizePnIdentifier,
  pnFolderDisplayName
} from './integratorStoragePaths';

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

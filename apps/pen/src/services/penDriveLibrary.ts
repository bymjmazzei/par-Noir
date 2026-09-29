/**
 * Pen library and doc tree live on the owner's Drive. The API no longer opens it.
 */

import {
  deviceDriveCall,
  ensureSessionDriveIndex,
  getCloudAccessTokenFromSession,
  getSessionDriveIndex,
  type DeviceDriveLayout,
} from '@par-noir/device-cloud-credentials';
import { PEN_ROOT, docRootPath, sanitizeSegment } from '@par-noir/pen-protocol';
import { ownerFetch, ownerGet } from './penOwnerFetch';

const FOLDER = 'application/vnd.google-apps.folder';

export async function penSessionDrive(identityId: string): Promise<{
  accessToken: string;
  index: DeviceDriveLayout;
}> {
  const accessToken = getCloudAccessTokenFromSession(identityId);
  if (!accessToken) throw new Error('cloud_on_device');
  const cached = getSessionDriveIndex(identityId);
  if (cached?.pnFolderId) return { accessToken, index: cached };
  const index = await ensureSessionDriveIndex({
    identityId,
    accessToken,
    readStoredIndex: async () => {
      const res = await ownerGet(
        `/api/storage/credentials/${encodeURIComponent(identityId)}`,
        { pnIdentifier: identityId }
      );
      if (!res.ok) return null;
      const body = (await res.json()) as { credentials?: { pnDriveIndex?: DeviceDriveLayout } };
      return body.credentials?.pnDriveIndex || null;
    },
    persistIndex: async (built) => {
      await ownerFetch(
        'POST',
        `/api/storage/initialize/${encodeURIComponent(identityId)}`,
        { pnDriveIndex: built },
        { pnIdentifier: identityId }
      );
    },
  });
  return { accessToken, index };
}

async function findChild(
  accessToken: string,
  parentId: string,
  name: string,
  mimeType?: string
): Promise<string | null> {
  const parts = [
    `name='${name.replace(/'/g, "\\'")}'`,
    `'${parentId}' in parents`,
    'trashed=false',
  ];
  if (mimeType) parts.push(`mimeType='${mimeType}'`);
  const q = encodeURIComponent(parts.join(' and '));
  const res = await deviceDriveCall('GET', `/api/drive/files?q=${q}&pageSize=1`, undefined, {
    accessToken,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { files?: Array<{ id?: string }> };
  return data.files?.[0]?.id || null;
}

async function listChildren(
  accessToken: string,
  parentId: string,
  mimeType?: string
): Promise<Array<{ id: string; name: string }>> {
  const parts = [`'${parentId}' in parents`, 'trashed=false'];
  if (mimeType) parts.push(`mimeType='${mimeType}'`);
  const q = encodeURIComponent(parts.join(' and '));
  const res = await deviceDriveCall('GET', `/api/drive/files?q=${q}&pageSize=100`, undefined, {
    accessToken,
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { files?: Array<{ id?: string; name?: string }> };
  return (data.files || [])
    .filter((f) => f.id && f.name)
    .map((f) => ({ id: f.id as string, name: f.name as string }));
}

export async function downloadDriveText(accessToken: string, fileId: string): Promise<string> {
  const res = await deviceDriveCall(
    'GET',
    `/api/drive/files/${encodeURIComponent(fileId)}?download=true`,
    undefined,
    { accessToken }
  );
  if (!res.ok) return '';
  return res.text();
}

export async function penRootFolderId(accessToken: string, pnFolderId: string): Promise<string | null> {
  return findChild(accessToken, pnFolderId, PEN_ROOT, FOLDER);
}

export async function readLibraryIndex(
  accessToken: string,
  pnFolderId: string
): Promise<Record<string, unknown>[]> {
  const root = await penRootFolderId(accessToken, pnFolderId);
  if (!root) return [];
  const indexId = await findChild(accessToken, root, 'library.index.json');
  if (!indexId) return [];
  const text = await downloadDriveText(accessToken, indexId);
  try {
    const parsed = text ? JSON.parse(text) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function readNamedJson<T>(
  accessToken: string,
  parentId: string,
  name: string
): Promise<T | null> {
  const id = await findChild(accessToken, parentId, name);
  if (!id) return null;
  const text = await downloadDriveText(accessToken, id);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Opaque doc tree: doc.json, history.chain, current/*.pen, drafts. */
export async function readDocTree(params: {
  accessToken: string;
  pnFolderId: string;
  docId: string;
}): Promise<{
  manifest: unknown;
  chain: unknown;
  currentSections: Array<{ slug: string; ciphertext: string }>;
  drafts: Array<{ draft: unknown; sections: Array<{ slug: string; ciphertext: string }> }>;
} | null> {
  const root = await penRootFolderId(params.accessToken, params.pnFolderId);
  if (!root) return null;
  const docFolderName = docRootPath(params.docId).split('/').pop() || sanitizeSegment(params.docId);
  const docFolder = await findChild(params.accessToken, root, docFolderName, FOLDER);
  if (!docFolder) return null;
  const manifest = await readNamedJson(params.accessToken, docFolder, 'doc.json');
  const chainFile = await findChild(params.accessToken, docFolder, 'history.chain');
  let chain: unknown = null;
  if (chainFile) {
    const text = await downloadDriveText(params.accessToken, chainFile);
    try {
      chain = text ? JSON.parse(text) : null;
    } catch {
      chain = text ? { raw: text } : null;
    }
  }
  const currentDir = await findChild(params.accessToken, docFolder, 'current', FOLDER);
  const currentSections: Array<{ slug: string; ciphertext: string }> = [];
  if (currentDir) {
    const files = await listChildren(params.accessToken, currentDir);
    for (const file of files) {
      if (!file.name.endsWith('.pen')) continue;
      currentSections.push({
        slug: file.name.replace(/\.pen$/, ''),
        ciphertext: await downloadDriveText(params.accessToken, file.id),
      });
    }
  }
  const draftsDir = await findChild(params.accessToken, docFolder, 'drafts', FOLDER);
  const drafts: Array<{ draft: unknown; sections: Array<{ slug: string; ciphertext: string }> }> = [];
  if (draftsDir) {
    const draftFolders = await listChildren(params.accessToken, draftsDir, FOLDER);
    for (const folder of draftFolders) {
      const draft = await readNamedJson(params.accessToken, folder.id, 'draft.json');
      const sections: Array<{ slug: string; ciphertext: string }> = [];
      const files = await listChildren(params.accessToken, folder.id);
      for (const file of files) {
        if (!file.name.endsWith('.pen')) continue;
        sections.push({
          slug: file.name.replace(/\.pen$/, ''),
          ciphertext: await downloadDriveText(params.accessToken, file.id),
        });
      }
      if (draft) drafts.push({ draft, sections });
    }
  }
  if (!manifest || !chain) return null;
  return { manifest, chain, currentSections, drafts };
}

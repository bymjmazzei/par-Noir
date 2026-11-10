/**
 * Owner and public file indexes live on the pN's social cloud, read and written
 * from this device. The API stores the layout shell only.
 */
import { deviceDriveCall, deviceFileIndex } from '@par-noir/device-cloud-credentials';
import { sessionSocialFor } from '../sessionSocial';

function pnKey(pnIdentifier: string): string {
  return pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
}

export async function readDeviceOwnerIndex(
  pnIdentifier: string,
  apiToken: string
): Promise<Record<string, unknown>[]> {
  const ctx = await sessionSocialFor(pnKey(pnIdentifier), apiToken);
  return deviceFileIndex(ctx, 'owner').list();
}

export async function writeDeviceOwnerIndexEntry(
  pnIdentifier: string,
  apiToken: string,
  entry: {
    fileId: string;
    googleDriveFileId: string;
    visibility: string;
    uploadedAt: string;
  }
): Promise<void> {
  const ctx = await sessionSocialFor(pnKey(pnIdentifier), apiToken);
  await deviceFileIndex(ctx, 'owner').upsert({ ...entry });
}

export async function readDevicePublicIndex(
  pnIdentifier: string,
  apiToken: string
): Promise<Record<string, unknown>[]> {
  const ctx = await sessionSocialFor(pnKey(pnIdentifier), apiToken);
  return deviceFileIndex(ctx, 'public').list();
}

export async function writeDevicePublicIndexEntry(
  pnIdentifier: string,
  apiToken: string,
  entry: Record<string, unknown>
): Promise<void> {
  const ctx = await sessionSocialFor(pnKey(pnIdentifier), apiToken);
  await deviceFileIndex(ctx, 'public').upsert(entry);
}

/**
 * Removes a deleted post from the owner's cloud: the stored files (with each Drive
 * file's companion metadata sheet) and the owner/public index rows. A file already
 * gone counts as removed.
 */
export async function deleteDeviceOwnerFiles(
  pnIdentifier: string,
  apiToken: string,
  fileIds: readonly string[]
): Promise<void> {
  const ids = [...new Set(fileIds.filter(Boolean))];
  if (ids.length === 0) return;
  const ctx = await sessionSocialFor(pnKey(pnIdentifier), apiToken);

  const failed: string[] = [];
  if (ctx.kind === 'google_drive') {
    const call = (method: string, path: string) =>
      deviceDriveCall(method, path, undefined, { accessToken: ctx.accessToken });
    for (const id of ids) {
      const q = `name='${id.replace(/'/g, "\\'")}.metadata' and trashed=false`;
      const companions = await call('GET', `/api/drive/files?q=${encodeURIComponent(q)}`);
      const companionIds = companions.ok
        ? ((await companions.json()) as { files?: Array<{ id: string }> }).files?.map((f) => f.id) ?? []
        : [];
      for (const target of [id, ...companionIds]) {
        const res = await call('DELETE', `/api/drive/files/${encodeURIComponent(target)}`);
        if (!res.ok && res.status !== 404) failed.push(target);
      }
    }
  } else {
    const wanted = new Set(ids);
    const owned = (await deviceFileIndex(ctx, 'owner').list()).filter(
      (e) => wanted.has(String(e.fileId)) || wanted.has(String(e.backendFileId ?? ''))
    );
    for (const entry of owned) {
      const key = typeof entry.backendFileId === 'string' ? entry.backendFileId : '';
      if (!key || (entry.backend && entry.backend !== ctx.provider)) continue;
      await ctx.blobs.delete(key).catch(() => failed.push(key));
    }
  }

  for (const kind of ['owner', 'public'] as const) {
    await deviceFileIndex(ctx, kind).remove(ids);
  }

  if (failed.length > 0) {
    throw new Error(`Could not delete ${failed.length} file(s) from your cloud`);
  }
}

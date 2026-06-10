import { google } from 'googleapis';
import {
  buildPortableInventoryFromList,
  type SocialCloudInventory
} from '@par-noir/storage-migration';
import { METADATA_DIR, MESSAGES_DIR, readCachedLayout } from '@par-noir/user-owned-storage';
import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { GoogleOAuth2Helper, type GoogleDriveToken } from '../googleOAuth2Helper';

export async function buildGoogleInventoryFromDrive(
  token: GoogleDriveToken,
  credentials: StorageCredentialsEnvelope,
  pnIdentifier: string,
  accountId?: string
): Promise<SocialCloudInventory> {
  const layout = readCachedLayout(credentials);
  const metadataFolderId = layout.nodeIds?.metadataFolderId;
  const messagesFolderId = layout.nodeIds?.messagesFolderId;
  if (!metadataFolderId) {
    return { items: [], totalEstimatedBytes: 0 };
  }

  const auth = GoogleOAuth2Helper.createClient(token, pnIdentifier, accountId);
  const drive = google.drive({ version: 'v3', auth });

  const items: SocialCloudInventory['items'] = [];
  let total = 0;

  async function listFolder(folderId: string, prefix: string): Promise<void> {
    let pageToken: string | undefined;
    do {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'nextPageToken, files(id, name, mimeType, size)',
        pageSize: 200,
        pageToken
      });
      for (const f of res.data.files ?? []) {
        const size = parseInt(f.size ?? '0', 10) || 0;
        const rel = `${prefix}${f.name}`;
        let kind: SocialCloudInventory['items'][0]['kind'] = 'other';
        if (f.mimeType === 'application/vnd.google-apps.spreadsheet') {
          kind = rel.includes('-index') ? 'index' : 'table_db';
        } else if (f.name?.endsWith('.json')) {
          kind = 'json';
        }
        items.push({ path: rel, kind, estimatedBytes: size });
        total += size;
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  }

  await listFolder(metadataFolderId, `${METADATA_DIR}/`);
  if (messagesFolderId) {
    await listFolder(messagesFolderId, `${MESSAGES_DIR}/`);
  }

  const portableStyle = items.map((i) => ({
    key: i.path,
    size: i.estimatedBytes
  }));
  const merged = buildPortableInventoryFromList(portableStyle, '');
  return {
    items: [...merged.items, ...items.filter((i) => !merged.items.some((m) => m.path === i.path))],
    totalEstimatedBytes: total || merged.totalEstimatedBytes
  };
}

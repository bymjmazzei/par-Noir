/**
 * Browse adapter for @par-noir/owner-files. Storage I/O goes through the par Noir API only.
 */
import { decryptPrivateFileBlob } from '@par-noir/identity-crypto/browser';
import { parseAccountKey, penDocUrl, type OwnerFilesTransport } from '@par-noir/owner-files';
import { PNOAuthService } from './pnOAuthService';
import { downloadStorageBlob, listStorageFiles } from './storageApiClient';
import { fetchOwnerCatalog } from './ownerCatalogService';
import { resolvePublicMediaObjectUrl } from './feedPreviewPlayback';
import { apiGet } from './ownerApiFetch';
import { openExternalUrl } from '../utils/openExternalUrl';

async function withAccessToken<T>(run: (token: string) => Promise<T>): Promise<T> {
  const token = await PNOAuthService.getValidAccessToken();
  if (!token) throw new Error('Please connect your pN to view files');
  try {
    return await run(token);
  } catch (err) {
    const refreshed = await PNOAuthService.getValidAccessToken(true);
    if (!refreshed) throw new Error('Your session has expired. Please unlock your pN again to continue.');
    if (refreshed === token) throw err;
    return run(refreshed);
  }
}

async function ownerKey(): Promise<{ id: string; publicKey: string }> {
  const session = PNOAuthService.loadSession();
  if (!session?.did) throw new Error('Unlock your pN to open private files');
  let publicKey = session.publicKey;
  if (!publicKey && session.accessToken) {
    const info = await PNOAuthService.getUserInfo(session.accessToken).catch(() => null);
    if (info?.public_key) {
      publicKey = info.public_key;
      PNOAuthService.saveSession({ ...session, publicKey });
    }
  }
  if (!publicKey) throw new Error('Missing pN public key');
  return { id: session.did, publicKey };
}

export function createBrowserOwnerFilesTransport(pnIdentifier: string): OwnerFilesTransport {
  return {
    listDriveFiles: (account) =>
      withAccessToken((token) => listStorageFiles(token, pnIdentifier, account.provider, account.accountId)),

    fetchOwnerCatalog: () => fetchOwnerCatalog(pnIdentifier),

    fetchMetadata: async (fileId) => {
      const res = await apiGet(`/api/aggregator/metadata-index/${encodeURIComponent(fileId)}`);
      if (!res.ok) return null;
      const body = (await res.json()) as { metadata?: Record<string, unknown> } & Record<string, unknown>;
      return body.metadata || body;
    },

    downloadFile: ({ accountKey, driveFileId, thumbnail }) => {
      const { provider, accountId } = parseAccountKey(accountKey);
      return withAccessToken((token) =>
        downloadStorageBlob(token, pnIdentifier, provider || 'google_drive', driveFileId, {
          accountId: accountId || undefined,
          thumbnail
        })
      );
    },

    resolvePublicMediaUrl: (fileId, variant) => resolvePublicMediaObjectUrl(fileId, variant),

    decryptPackage: async (pkg) => (await decryptPrivateFileBlob(pkg, await ownerKey())).decryptedBlob,

    openInPen: (penDocId) => {
      void openExternalUrl(penDocUrl(penDocId));
    }
  };
}

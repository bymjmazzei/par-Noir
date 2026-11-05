/**
 * Encrypt and upload identity document images into private `_metadata/zkp-docs/`.
 * Never indexes for Storage modal or aggregator public feeds.
 */

import { IdentityCrypto } from '@par-noir/identity-crypto';
import { ownerFetch } from './ownerApiService';

export async function ensureZkpDocsFolderId(
  pnIdentifier: string,
  authToken: string
): Promise<string> {
  const { ensureDriveChildFolder } = await import('@par-noir/device-cloud-credentials');
  const { sessionDriveFor } = await import('./sessionDrive');
  const drive = await sessionDriveFor(pnIdentifier, authToken);
  return ensureDriveChildFolder(drive.accessToken, drive.index.metadataFolderId, 'zkp-docs');
}

export async function uploadZkpDocEncrypted(opts: {
  file: File;
  pnIdentifier: string;
  authToken: string;
  key1: string;
  key2: string;
  sessionId?: string;
}): Promise<string> {
  if (opts.sessionId) {
    const { ensureCloudSessionBootstrap } = await import('../contexts/CloudSessionContext');
    const result = await ensureCloudSessionBootstrap({
      apiToken: opts.authToken,
      pnIdentifier: opts.pnIdentifier,
      sessionId: opts.sessionId
    });
    if (result.status !== 'ready') {
      throw new Error(result.error || 'Reconnect Google Drive on this device to upload documents');
    }
  }
  const folderId = await ensureZkpDocsFolderId(opts.pnIdentifier, opts.authToken);
  const buf = await opts.file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  const b64 = btoa(binary);

  const encrypted = await IdentityCrypto.encryptData(
    JSON.stringify({
      mimeType: opts.file.type || 'application/octet-stream',
      name: opts.file.name,
      dataBase64: b64
    }),
    opts.key1,
    opts.key2
  );

  const packageJson = JSON.stringify(encrypted);
  const fileData = btoa(unescape(encodeURIComponent(packageJson)));
  const safeName = `zkp-doc-${Date.now()}.encrypted`;

  // ownerFetch resolves the Drive token and refuses to send the upload at all
  // when none can be minted, rather than issuing it Bearer-only.
  const uploadRes = await ownerFetch(
    opts.authToken,
    'POST',
    '/api/drive/files',
    {
      fileData,
      fileName: safeName,
      mimeType: 'application/json',
      parents: [folderId],
      encrypt: false
    },
    { pnIdentifier: opts.pnIdentifier }
  );

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`zkp-docs upload failed: ${text}`);
  }
  const out = (await uploadRes.json()) as { id?: string; fileId?: string; file?: { id?: string } };
  const id = out.id || out.fileId || out.file?.id;
  if (!id) throw new Error('Upload returned no file id');
  return id;
}
